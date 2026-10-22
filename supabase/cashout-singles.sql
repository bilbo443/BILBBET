-- Full cash out for ordinary unresolved singles. Install before the app change.
-- Activation is deliberately separate: cashout_enabled remains false.
BEGIN;
CREATE TABLE IF NOT EXISTS bilbbet_private.cashout_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 username text NOT NULL, bet_id text NOT NULL, amount numeric NOT NULL CHECK(amount>0),
 quote jsonb NOT NULL, price_round integer NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '30 seconds')
);
ALTER TABLE bilbbet_private.cashout_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bilbbet_private.cashout_offers FROM PUBLIC,anon,authenticated;
INSERT INTO bilbbet_private.settings(key,value) VALUES ('cashout_enabled','false')
ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION bilbbet_private.cashout_value(b jsonb, q jsonb)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path TO pg_catalog AS $f$
DECLARE odds numeric; payout numeric; s jsonb;
BEGIN
 IF b->>'status' IS DISTINCT FROM 'PENDING' OR jsonb_array_length(b->'selections')<>1
 OR coalesce((b->>'boosted')::boolean,false) OR b->>'boostRound' IS NOT NULL
 OR b->>'featuredPickRound' IS NOT NULL OR coalesce((b->>'freeBet')::boolean,false)
 OR coalesce((b->>'bonusBet')::boolean,false) OR coalesce((b->>'isFreeBet')::boolean,false)
 OR coalesce((b->>'nearMissBonusAwarded')::boolean,false) THEN RETURN NULL; END IF;
 s:=b->'selections'->0;
 IF s->>'result' IS NOT NULL OR q IS NULL OR q->>'id' IS DISTINCT FROM s->>'id'
 OR coalesce((q->>'featured')::boolean,false) OR NOT coalesce((q->>'bettable')::boolean,true)
 OR split_part(s->>'id','|',1) NOT IN ('H2H','H2H_WIN','H2H_MEDIAN','FUT','FACUP','ECL','ECLGROUP','LEADAT')
 THEN RETURN NULL; END IF;
 SELECT min((p #>> '{}')::numeric) INTO odds FROM jsonb_array_elements(q->'prices') p;
 payout:=(b->>'potentialReturn')::numeric;
 IF odds IS NULL OR odds::text IN ('NaN','Infinity','-Infinity') OR odds<1.005
 OR payout IS NULL OR payout::text IN ('NaN','Infinity','-Infinity') OR payout<=0
 OR (b->>'stake')::numeric<=0 THEN RETURN NULL; END IF;
 -- Current implied probability removes the board's 5% odds margin.
 -- Retain 95% of fair value. Floor to cents and never exceed accepted return.
 RETURN nullif(trunc(least(payout,payout/(odds*1.05)*0.95),2),0);
END $f$;
REVOKE ALL ON FUNCTION bilbbet_private.cashout_value(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION bilbbet_private.cashout_open(q jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path TO pg_catalog AS $f$
DECLARE cr integer:=bilbbet_private.current_round(); pr integer; dates jsonb; kickoff timestamptz;
 published timestamptz; paused jsonb; enabled boolean; held boolean;
BEGIN
 SELECT (value #>> '{}')::boolean INTO enabled FROM bilbbet_private.settings WHERE key='cashout_enabled';
 IF enabled IS DISTINCT FROM true OR NOT bilbbet_private.price_checks_enabled() THEN RETURN false; END IF;
 SELECT (value #>> '{}')::integer INTO pr FROM bilbbet_private.settings WHERE key='price_round';
 SELECT (value #>> '{}')::timestamptz INTO published FROM bilbbet_private.settings WHERE key='cashout_prices_published_at';
 IF pr IS DISTINCT FROM cr OR published IS NULL OR published>clock_timestamp()
 OR published<clock_timestamp()-interval '8 days' OR bilbbet_private.round_closed(cr) THEN RETURN false; END IF;
 SELECT value INTO dates FROM bilbbet_private.settings WHERE key='round_dates';
 kickoff:=((dates->>cr::text)::date+time '19:00') AT TIME ZONE 'Australia/Sydney';
 IF cr=1 THEN kickoff:=timestamptz '2026-10-16 19:55:00 Australia/Sydney'; END IF;
 -- Cash out never uses the deliberate-reopen exception during play.
 IF kickoff IS NULL OR clock_timestamp()>=kickoff THEN RETURN false; END IF;
 IF q->>'round' IS NOT NULL AND bilbbet_private.round_closed((q->>'round')::integer) THEN RETURN false; END IF;
 SELECT value INTO paused FROM public.kv_store WHERE key='bilbbet2_paused_categories';
 IF coalesce((paused->>(q->>'category'))::boolean,false) THEN RETURN false; END IF;
 SELECT (value #>> '{}')::boolean INTO held FROM bilbbet_private.settings WHERE key='final_roster_market_hold';
 IF coalesce(held,true) AND q->>'type' IN ('FACUP','RODDY','DIV3','HELD') THEN RETURN false; END IF;
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION bilbbet_private.cashout_open(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bilbbet_cashout_offer(p_bet_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $f$
DECLARE who text:=bilbbet_private.actor(); b jsonb; q jsonb; amount numeric; offer bilbbet_private.cashout_offers;
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'Sign in to view cash out'; END IF;
 SELECT value INTO b FROM public.kv_store WHERE key='bilbbet2_bet:'||p_bet_id;
 IF b IS NULL OR lower(b->>'username') IS DISTINCT FROM who THEN RAISE EXCEPTION 'Bet not found'; END IF;
 SELECT value INTO q FROM bilbbet_private.quotes WHERE id=b->'selections'->0->>'id';
 amount:=bilbbet_private.cashout_value(b,q);
 IF amount IS NULL OR NOT bilbbet_private.cashout_open(q) THEN
  RETURN jsonb_build_object('available',false,'message','Cash out is unavailable for this bet right now.');
 END IF;
 -- Reuse a still-current offer. Prevent repeated clicks from accumulating offers.
 SELECT * INTO offer FROM bilbbet_private.cashout_offers WHERE username=who AND bet_id=p_bet_id
 AND quote=q AND expires_at>clock_timestamp() ORDER BY expires_at DESC LIMIT 1;
 IF offer.id IS NULL THEN
  DELETE FROM bilbbet_private.cashout_offers WHERE username=who AND expires_at<clock_timestamp()-interval '1 day';
  INSERT INTO bilbbet_private.cashout_offers(username,bet_id,amount,quote,price_round)
  VALUES(who,p_bet_id,amount,q,bilbbet_private.current_round()) RETURNING * INTO offer;
 END IF;
 RETURN jsonb_build_object('available',true,'offerId',offer.id,'amount',offer.amount,'expiresAt',offer.expires_at);
END $f$;
REVOKE ALL ON FUNCTION public.bilbbet_cashout_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_cashout_offer(text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.bilbbet_cashout_accept(p_bet_id text,p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $f$
DECLARE who text:=bilbbet_private.actor(); u jsonb; b jsonb; q jsonb;
 offer bilbbet_private.cashout_offers; amount numeric; txid text; tx jsonb;
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'Sign in to cash out'; END IF;
 -- Same account-then-bet lock order as placement and settlement.
 SELECT value INTO u FROM public.kv_store WHERE key='bilbbet2_user:'||who FOR UPDATE;
 IF u IS NULL OR u->>'status' IS DISTINCT FROM 'APPROVED' THEN RAISE EXCEPTION 'Account is not approved'; END IF;
 SELECT value INTO b FROM public.kv_store WHERE key='bilbbet2_bet:'||p_bet_id FOR UPDATE;
 IF b IS NULL OR lower(b->>'username') IS DISTINCT FROM who THEN RAISE EXCEPTION 'Bet not found'; END IF;
 IF b->>'status'='CASHED_OUT' THEN
  IF b->'cashOut'->>'offerId' IS DISTINCT FROM p_offer_id::text THEN RAISE EXCEPTION 'This bet was already cashed out'; END IF;
  RETURN jsonb_build_object('bet',b,'user',u,'replayed',true);
 END IF;
 SELECT * INTO offer FROM bilbbet_private.cashout_offers WHERE id=p_offer_id AND username=who AND bet_id=p_bet_id FOR UPDATE;
 IF offer.id IS NULL OR offer.expires_at<=clock_timestamp() OR offer.price_round<>bilbbet_private.current_round() THEN
  RAISE EXCEPTION 'Cash-out offer expired. Request a new offer'; END IF;
 -- Row lock prevents a concurrent board replacement until this transaction ends.
 SELECT value INTO q FROM bilbbet_private.quotes WHERE id=b->'selections'->0->>'id' FOR SHARE;
 amount:=bilbbet_private.cashout_value(b,q);
 IF amount IS NULL OR amount IS DISTINCT FROM offer.amount OR q IS DISTINCT FROM offer.quote
 OR NOT bilbbet_private.cashout_open(q) THEN RAISE EXCEPTION 'Cash-out offer changed or is unavailable. Request a new offer'; END IF;
 u:=jsonb_set(u,'{balance}',to_jsonb((u->>'balance')::numeric+amount));
 b:=b||jsonb_build_object('status','CASHED_OUT','actualReturn',amount,'cashOut',jsonb_build_object(
 'offerId',offer.id,'amount',amount,'acceptedAt',clock_timestamp(),'currentOdds',q->'odds','factor',0.95));
 UPDATE public.kv_store SET value=u WHERE key='bilbbet2_user:'||who;
 UPDATE public.kv_store SET value=b WHERE key='bilbbet2_bet:'||p_bet_id;
 txid:='cashout:'||p_bet_id;
 tx:=jsonb_build_object('id',txid,'username',u->>'username','type','CASH_OUT','amount',amount,
 'balanceAfter',(u->>'balance')::numeric,'reason','Bet cashed out','timestamp',floor(extract(epoch from clock_timestamp())*1000));
 INSERT INTO public.kv_store(key,value) VALUES('bilbbet2_tx:'||txid,tx);
 INSERT INTO public.kv_store(key,value) VALUES('bilbbet2_tx_index_'||who,jsonb_build_array(txid))
 ON CONFLICT(key) DO UPDATE SET value=public.kv_store.value||excluded.value;
 RETURN jsonb_build_object('bet',b,'user',u,'replayed',false);
END $f$;
REVOKE ALL ON FUNCTION public.bilbbet_cashout_accept(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_cashout_accept(text,uuid) TO anon,authenticated;

-- Preserve installed fixes. Fail atomically if the expected function bodies differ.
DO $patch$
DECLARE src text; old text; new text;
BEGIN
 src:=replace(pg_get_functiondef('public.bilbbet_publish_board(jsonb)'::regprocedure),chr(13),'');
 old:=' RETURN jsonb_array_length(p_quotes);';
 new:=$body$ INSERT INTO bilbbet_private.settings(key,value)
 VALUES('cashout_prices_published_at',to_jsonb(clock_timestamp()))
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 RETURN jsonb_array_length(p_quotes);$body$;
 IF position('cashout_prices_published_at' in src)=0 THEN
  IF (length(src)-length(replace(src,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Publisher differs; no changes applied'; END IF;
  EXECUTE replace(src,old,new);
 END IF;
 src:=replace(pg_get_functiondef('bilbbet_private.bilbbet_settle_bet(text,text,integer)'::regprocedure),chr(13),'');
 old:='  original := b;';
 new:=$body$  IF b->>'status'='CASHED_OUT' THEN RAISE EXCEPTION 'Cashed-out bets cannot be settled or reset'; END IF;
  original := b;$body$;
 IF position('Cashed-out bets cannot' in src)=0 THEN
  IF (length(src)-length(replace(src,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Settlement differs; no changes applied'; END IF;
  EXECUTE replace(src,old,new);
 END IF;
END $patch$;
COMMIT;
