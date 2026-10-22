BEGIN;
-- Run only after the installer, inside a transaction that is rolled back.
-- All fixture records and function overrides below are temporary to that transaction.
CREATE OR REPLACE FUNCTION bilbbet_private.actor() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog AS $$ SELECT '__cashout_test__'::text $$;
INSERT INTO public.kv_store(key,value) VALUES
 ('bilbbet2_current_round_override','2'),('bilbbet2_round_betting_open','true'),('bilbbet2_paused_categories','{}'),
 ('bilbbet2_user:__cashout_test__','{"username":"__cashout_test__","status":"APPROVED","balance":1000}')
ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO bilbbet_private.settings(key,value) VALUES
 ('cashout_enabled','true'),('price_checks_enabled','true'),('price_round','2'),
 ('cashout_prices_published_at',to_jsonb(clock_timestamp())),
 ('round_dates',jsonb_build_object('2',(current_date+1)::text))
ON CONFLICT(key) DO UPDATE SET value=excluded.value;
DO $test$
DECLARE b jsonb; q jsonb; o jsonb; answer jsonb; repeated jsonb; offerid uuid; blocked boolean;
BEGIN
 b:='{"id":"__cashout_test_bet__","username":"__cashout_test__","status":"PENDING","stake":100,"combinedOdds":4,"potentialReturn":400,"selections":[{"id":"FUT|RODDY|roddy_win_pct|TEST","odds":4}]}';
 q:='{"id":"FUT|RODDY|roddy_win_pct|TEST","odds":2,"prices":[2],"category":"FUT|RODDY","type":"FUT"}';
 IF bilbbet_private.cashout_value(b,q)<>180.95 THEN RAISE EXCEPTION 'Formula failed'; END IF;
 IF bilbbet_private.cashout_value(b||'{"boosted":true}',q) IS NOT NULL THEN RAISE EXCEPTION 'Boost exclusion failed'; END IF;
 IF bilbbet_private.cashout_value(b||'{"freeBet":true}',q) IS NOT NULL THEN RAISE EXCEPTION 'Bonus exclusion failed'; END IF;
 IF bilbbet_private.cashout_value(b||'{"status":"WON"}',q) IS NOT NULL THEN RAISE EXCEPTION 'Settled exclusion failed'; END IF;
 IF bilbbet_private.cashout_value(jsonb_set(b,'{selections}',(b->'selections')||(b->'selections')),q) IS NOT NULL THEN RAISE EXCEPTION 'Multi exclusion failed'; END IF;
 INSERT INTO public.kv_store(key,value) VALUES ('bilbbet2_bet:__cashout_test_bet__',b);
 INSERT INTO bilbbet_private.quotes(id,value) VALUES(q->>'id',q);
 o:=public.bilbbet_cashout_offer(b->>'id');
 IF o->>'available'<>'true' THEN RAISE EXCEPTION 'Valid offer missing'; END IF;
 offerid:=(o->>'offerId')::uuid;
 UPDATE bilbbet_private.quotes SET value=jsonb_set(value,'{odds}','3') WHERE id=q->>'id';
 blocked:=false;
 BEGIN PERFORM public.bilbbet_cashout_accept(b->>'id',offerid); EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Changed quote accepted'; END IF;
 UPDATE bilbbet_private.quotes SET value=q WHERE id=q->>'id';
 UPDATE bilbbet_private.cashout_offers SET expires_at=clock_timestamp()-interval '1 second' WHERE id=offerid;
 blocked:=false;
 BEGIN PERFORM public.bilbbet_cashout_accept(b->>'id',offerid); EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expired offer accepted'; END IF;
 o:=public.bilbbet_cashout_offer(b->>'id'); offerid:=(o->>'offerId')::uuid;
 UPDATE public.kv_store SET value='{"FUT|RODDY":true}' WHERE key='bilbbet2_paused_categories';
 IF bilbbet_private.cashout_open(q) THEN RAISE EXCEPTION 'Paused market open'; END IF;
 UPDATE public.kv_store SET value='{}' WHERE key='bilbbet2_paused_categories';
 UPDATE public.kv_store SET value='false' WHERE key='bilbbet2_round_betting_open';
 IF bilbbet_private.cashout_open(q) THEN RAISE EXCEPTION 'Round-close guard failed'; END IF;
 UPDATE public.kv_store SET value='true' WHERE key='bilbbet2_round_betting_open';
 UPDATE bilbbet_private.settings SET value='1' WHERE key='price_round';
 IF bilbbet_private.cashout_open(q) THEN RAISE EXCEPTION 'Stale price round open'; END IF;
 UPDATE bilbbet_private.settings SET value='2' WHERE key='price_round';
 UPDATE public.kv_store SET value=jsonb_set(b,'{username}','"another_owner"') WHERE key='bilbbet2_bet:__cashout_test_bet__';
 blocked:=false;
 BEGIN PERFORM public.bilbbet_cashout_accept(b->>'id',offerid); EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Foreign bet accepted'; END IF;
 UPDATE public.kv_store SET value=b WHERE key='bilbbet2_bet:__cashout_test_bet__';
 answer:=public.bilbbet_cashout_accept(b->>'id',offerid);
 repeated:=public.bilbbet_cashout_accept(b->>'id',offerid);
 IF answer->'user'->>'balance'<>'1180.95' OR repeated->'user'->>'balance'<>'1180.95'
 OR repeated->>'replayed'<>'true' OR answer->'bet'->>'status'<>'CASHED_OUT'
 OR answer->'bet'->'selections' IS DISTINCT FROM b->'selections'
 OR answer->'bet'->>'potentialReturn'<>'400' THEN RAISE EXCEPTION 'Credit/receipt/history test failed'; END IF;
 blocked:=false;
 BEGIN PERFORM bilbbet_private.bilbbet_settle_bet(b->>'id','WON',null); EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Cashed-out bet settled again'; END IF;
 IF (SELECT jsonb_array_length(value) FROM public.kv_store WHERE key='bilbbet2_tx_index___cashout_test__')<>1 THEN RAISE EXCEPTION 'Duplicate transaction'; END IF;
END $test$;
SELECT 'PASS: formula, exclusions, ownership, stale/expired/changed offers, pauses, lockout, one credit, preserved history and settlement protection' AS result;

ROLLBACK;
