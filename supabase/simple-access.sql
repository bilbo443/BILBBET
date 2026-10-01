BEGIN;

DO $$ BEGIN
 IF to_regprocedure('public.bilbbet_place_bets(text,text,jsonb,integer,timestamptz,boolean)') IS NULL
 OR to_regprocedure('public.bilbbet_settle_bet(text,text,integer)') IS NULL THEN
  RAISE EXCEPTION 'Existing atomic placement or settlement function missing; no changes applied';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.kv_store WHERE key='bilbbet2_user:admin') THEN
  RAISE EXCEPTION 'Existing admin account missing; no changes applied';
 END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS bilbbet_private;
REVOKE ALL ON SCHEMA bilbbet_private FROM PUBLIC, anon, authenticated;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS bilbbet_private.credentials(
 username text PRIMARY KEY,
 password_hash text,
 legacy_hash text,
 administrator boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS bilbbet_private.sessions(
 token_hash text PRIMARY KEY,
 username text NOT NULL REFERENCES bilbbet_private.credentials(username),
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS bilbbet_private.login_limits(
 username text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 0,
 window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bilbbet_private.settings(
 key text PRIMARY KEY,
 value jsonb NOT NULL
);

REVOKE ALL ON ALL TABLES IN SCHEMA bilbbet_private FROM PUBLIC, anon, authenticated;

INSERT INTO bilbbet_private.credentials(username,legacy_hash,administrator)
SELECT lower(value->>'username'),value->>'pinHash',lower(value->>'username')='admin'
FROM public.kv_store
WHERE key LIKE 'bilbbet2_user:%' AND value->>'username' IS NOT NULL
ON CONFLICT(username) DO NOTHING;

UPDATE bilbbet_private.credentials SET legacy_hash=NULL WHERE administrator;

UPDATE public.kv_store k
SET value=(k.value-'pinHash')||jsonb_build_object('isAdmin',c.administrator)
FROM bilbbet_private.credentials c
WHERE k.key='bilbbet2_user:'||c.username;

CREATE OR REPLACE FUNCTION bilbbet_private.legacy_hash(pin text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE h bigint:=0; i integer; c integer;
BEGIN
 FOR i IN 1..length(pin) LOOP
  c:=ascii(substr(pin,i,1));
  IF c>65535 THEN
   h:=(31*h+55296+(c-65536)/1024)%4294967296;
   c:=56320+(c-65536)%1024;
  END IF;
  h:=(31*h+c)%4294967296;
 END LOOP;
 IF h>=2147483648 THEN h:=h-4294967296; END IF;
 RETURN h::text;
END $$;

CREATE OR REPLACE FUNCTION bilbbet_private.actor()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
DECLARE token text; who text;
BEGIN
 token:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-bilbbet-session','');
 IF token='' THEN RETURN NULL; END IF;
 SELECT s.username INTO who
 FROM bilbbet_private.sessions s
 JOIN public.kv_store k ON k.key='bilbbet2_user:'||s.username
 WHERE s.token_hash=encode(extensions.digest(token,'sha256'),'hex')
 AND s.expires_at>now()
 AND coalesce(k.value->>'status','APPROVED') NOT IN ('RESET','REJECTED','KICKED');
 RETURN who;
END $$;

CREATE OR REPLACE FUNCTION bilbbet_private.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(
  (SELECT administrator FROM bilbbet_private.credentials
   WHERE username=bilbbet_private.actor()),
  false
 )
$$;

CREATE OR REPLACE FUNCTION public.bilbbet_login(p_username text,p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 name text:=lower(trim(p_username));
 c bilbbet_private.credentials%ROWTYPE;
 lim bilbbet_private.login_limits%ROWTYPE;
 token text;
 u jsonb;
 ok boolean:=false;
BEGIN
 IF name IS NULL OR name='' OR length(name)>100
 OR p_pin IS NULL OR length(p_pin)<4 OR octet_length(p_pin)>72 THEN
  RETURN jsonb_build_object('error','Username or PIN was not accepted.');
 END IF;

 INSERT INTO bilbbet_private.login_limits(username)
 VALUES(name) ON CONFLICT DO NOTHING;

 SELECT * INTO lim FROM bilbbet_private.login_limits
 WHERE username=name FOR UPDATE;

 IF lim.window_start<now()-interval '15 minutes' THEN
  UPDATE bilbbet_private.login_limits
  SET attempts=0,window_start=now() WHERE username=name;
  lim.attempts:=0;
 END IF;

 IF lim.attempts>=5 THEN
  RETURN jsonb_build_object('error','Too many attempts. Please wait 15 minutes.');
 END IF;

 SELECT * INTO c FROM bilbbet_private.credentials
 WHERE username=name FOR UPDATE;

 IF c.password_hash IS NOT NULL THEN
  ok:=extensions.crypt(p_pin,c.password_hash)=c.password_hash;
 ELSIF c.legacy_hash IS NOT NULL AND NOT c.administrator THEN
  ok:=bilbbet_private.legacy_hash(p_pin)=c.legacy_hash;
 END IF;

 SELECT value INTO u FROM public.kv_store
 WHERE key='bilbbet2_user:'||name;

 IF NOT coalesce(ok,false) OR u IS NULL
 OR coalesce(u->>'status','APPROVED') IN ('RESET','REJECTED','KICKED') THEN
  UPDATE bilbbet_private.login_limits
  SET attempts=attempts+1 WHERE username=name;
  RETURN jsonb_build_object('error','Username or PIN was not accepted.');
 END IF;

 IF c.password_hash IS NULL THEN
  UPDATE bilbbet_private.credentials
  SET password_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)),
      legacy_hash=NULL
  WHERE username=name;
 END IF;

 UPDATE bilbbet_private.login_limits
 SET attempts=0,window_start=now() WHERE username=name;

 IF c.administrator THEN
  DELETE FROM bilbbet_private.settings WHERE key='admin_setup_pin';
 END IF;

 DELETE FROM bilbbet_private.sessions WHERE expires_at<now();
 token:=encode(extensions.gen_random_bytes(32),'hex');

 INSERT INTO bilbbet_private.sessions
 VALUES(
  encode(extensions.digest(token,'sha256'),'hex'),
  name,
  now()+CASE WHEN c.administrator THEN interval '8 hours' ELSE interval '14 days' END
 );

 u:=(u-'pinHash')||jsonb_build_object(
  'isAdmin',c.administrator,
  '__kv_version',encode(extensions.digest(u::text,'sha256'),'hex')
 );
 RETURN jsonb_build_object('token',token,'user',u);
END $$;

CREATE OR REPLACE FUNCTION public.bilbbet_logout()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE token text;
BEGIN
 token:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-bilbbet-session','');
 DELETE FROM bilbbet_private.sessions
 WHERE token_hash=encode(extensions.digest(token,'sha256'),'hex');
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.bilbbet_read(p_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
DECLARE
 who text:=bilbbet_private.actor();
 admin boolean:=bilbbet_private.is_admin();
 wanted_key text;
 v jsonb;
 result jsonb:='{}';
 allowed boolean;
BEGIN
 IF cardinality(p_keys)>300 THEN RAISE EXCEPTION 'Too many keys'; END IF;

 FOREACH wanted_key IN ARRAY p_keys LOOP
  SELECT value INTO v FROM public.kv_store k WHERE k.key=wanted_key;
  IF v IS NULL THEN CONTINUE; END IF;
  allowed:=admin;

  IF wanted_key LIKE 'bilbbet2_user:%' THEN
   allowed:=true;
   IF NOT admin AND substring(wanted_key FROM 15) IS DISTINCT FROM who THEN
    v:=jsonb_build_object(
     'username',v->'username',
     'balance',v->'balance',
     'status',v->'status',
     'isAdmin',coalesce(
      (SELECT administrator FROM bilbbet_private.credentials
       WHERE username=substring(wanted_key FROM 15)),
      false
     )
    );
   ELSE
    v:=(v-'pinHash')||jsonb_build_object(
     '__kv_version',encode(extensions.digest(v::text,'sha256'),'hex'),
     'isAdmin',coalesce(
      (SELECT administrator FROM bilbbet_private.credentials
       WHERE username=substring(wanted_key FROM 15)),
      false
     )
    );
   END IF;
  ELSIF wanted_key LIKE 'bilbbet2_bet:%' THEN
   allowed:=true;
  ELSIF wanted_key LIKE 'bilbbet2_tx:%' THEN
   allowed:=admin OR lower(v->>'username')=who;
  ELSIF wanted_key LIKE 'bilbbet2_placement:%' THEN
   allowed:=admin;
  ELSIF wanted_key LIKE 'bilbbet2_bets_index_%' THEN
   allowed:=admin OR substring(wanted_key FROM 21)=who;
  ELSIF wanted_key LIKE 'bilbbet2_tx_index_%' THEN
   allowed:=admin OR substring(wanted_key FROM 19)=who;
  ELSIF wanted_key='bilbbet2_users_index' THEN
   allowed:=true;
  ELSIF wanted_key='bilbbet2_all_bets_index' THEN
   allowed:=true;
  ELSIF wanted_key LIKE 'bilbbet2_feedback:%'
     OR wanted_key LIKE 'bilbbet2_feedback_%' THEN
   allowed:=admin;
  ELSIF wanted_key LIKE 'bilbbet2_tips_%'
     OR wanted_key LIKE 'bilbbet2_preseason_%' THEN
   allowed:=who IS NOT NULL;
  ELSE
   allowed:=admin OR wanted_key IN (
    'bilbbet2_current_round_override',
    'bilbbet2_round_betting_open',
    'bilbbet2_close_scope',
    'bilbbet2_paused_categories',
    'bilbbet2_last_autoclosed_round',
    'bilbbet2_h2h_schedule_confirmed',
    'bilbbet2_divisions_announced',
    'bilbbet2_current_season_label',
    'bilbbet2_season_closed',
    'bilbbet2_cup_fixtures',
    'bilbbet2_playoff_fixtures',
    'bilbbet2_ecl_groups',
    'bilbbet2_cup_overrides',
    'bilbbet2_election_betting_open',
    'bilbbet2_r1_fixture_override',
    'bilbbet2_manual_betting_control',
    'bilbbet2_odds_refresh_requested',
    'bilbbet2_novelty_index'
   )
   OR wanted_key LIKE 'bilbbet2_novelty:%'
   OR wanted_key LIKE 'bilbbet2_featured_%'
   OR wanted_key LIKE 'bilbbet2_winner:%'
   OR wanted_key='bilbbet2_winners_index'
   OR wanted_key LIKE 'bilbbet2_home_%'
   OR wanted_key LIKE 'bilbbet2_best_value_winner_%';
  END IF;

  IF coalesce(allowed,false) THEN
   result:=result||jsonb_build_object(wanted_key,v);
  END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.bilbbet_write(
 p_key text,p_value jsonb,p_delete boolean DEFAULT false
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 who text:=bilbbet_private.actor();
 admin boolean:=bilbbet_private.is_admin();
 old jsonb;
 allowed boolean:=false;
 round_no integer;
 season text;
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'Sign in to make changes'; END IF;

 SELECT value INTO old FROM public.kv_store WHERE key=p_key FOR UPDATE;

 IF p_key LIKE 'bilbbet2_placement:%'
 OR p_key LIKE 'bilbbet2_bet:%'
 OR p_key LIKE 'bilbbet2_tx:%'
 OR p_key='bilbbet2_all_bets_index'
 OR p_key LIKE 'bilbbet2_bets_index_%'
 OR p_key LIKE 'bilbbet2_tx_index_%' THEN
  IF NOT admin THEN
   RAISE EXCEPTION 'Financial records require protected operations';
  END IF;
 END IF;

 IF admin THEN
  allowed:=true;
 ELSIF p_key='bilbbet2_user:'||who AND NOT p_delete THEN
  allowed:=
   (p_value-ARRAY['tipReminderEnabled','welcomeSeen','__kv_version'])
   IS NOT DISTINCT FROM
   (old-ARRAY['tipReminderEnabled','welcomeSeen','pinHash']);
 ELSIF left(p_key,length('bilbbet2_tips_'||who||'_R'))='bilbbet2_tips_'||who||'_R' THEN
  allowed:=NOT p_delete AND NOT bilbbet_private.round_closed((p_value->>'round')::integer);
 ELSIF p_key='bilbbet2_preseason_'||who THEN
  allowed:=NOT p_delete AND NOT bilbbet_private.round_closed(1);
 END IF;

 IF NOT coalesce(allowed,false) THEN
  RAISE EXCEPTION 'This account cannot change that record';
 END IF;

 IF NOT admin
 AND left(p_key,length('bilbbet2_tips_'||who||'_R'))='bilbbet2_tips_'||who||'_R' THEN
  round_no:=(p_value->>'round')::integer;
  SELECT replace(value #>> '{}','/','-') INTO season
  FROM public.kv_store WHERE key='bilbbet2_current_season_label';
  season:=coalesce(season,'26-27');

  IF round_no IS NULL OR round_no NOT BETWEEN 1 AND 26
  OR p_key IS DISTINCT FROM (
   'bilbbet2_tips_'||who||'_R'||round_no::text||
   CASE WHEN round_no=1 THEN '_median_' ELSE '_official_' END||season
  )
  OR jsonb_typeof(p_value->'picks') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid tips';
  END IF;
 END IF;

 IF NOT admin AND p_key='bilbbet2_preseason_'||who
 AND jsonb_typeof(p_value->'picks') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid preseason picks';
 END IF;

 IF p_key LIKE 'bilbbet2_user:%' AND NOT p_delete AND old IS NOT NULL THEN
  IF p_value->>'__kv_version'
  IS DISTINCT FROM encode(extensions.digest(old::text,'sha256'),'hex') THEN
   RAISE EXCEPTION 'Account changed. Refresh before trying again';
  END IF;
 END IF;

 IF p_delete THEN
  DELETE FROM public.kv_store WHERE key=p_key;
 ELSE
  INSERT INTO public.kv_store(key,value)
  VALUES(
   p_key,
   CASE WHEN jsonb_typeof(p_value)='object'
    THEN p_value-ARRAY['pinHash','__kv_version']
    ELSE p_value
   END
  )
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 END IF;
 RETURN true;
END $$;

REVOKE ALL ON TABLE public.kv_store FROM PUBLIC, anon, authenticated;

DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO cols
 FROM pg_attribute
 WHERE attrelid='public.kv_store'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format(
  'REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.kv_store FROM PUBLIC,anon,authenticated',
  cols,cols,cols,cols
 );
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bilbbet_private FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
 public.bilbbet_login(text,text),
 public.bilbbet_logout(),
 public.bilbbet_read(text[]),
 public.bilbbet_write(text,jsonb,boolean)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
 public.bilbbet_login(text,text),
 public.bilbbet_logout(),
 public.bilbbet_read(text[]),
 public.bilbbet_write(text,jsonb,boolean)
TO anon,authenticated;

CREATE OR REPLACE FUNCTION bilbbet_private.current_round()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
DECLARE dates jsonb; r integer; override integer;
BEGIN
 SELECT (value #>> '{}')::integer INTO override
 FROM public.kv_store WHERE key='bilbbet2_current_round_override';
 IF override IS NOT NULL THEN RETURN override; END IF;

 SELECT value INTO dates FROM bilbbet_private.settings WHERE key='round_dates';
 IF dates IS NULL THEN RAISE EXCEPTION 'Server calendar not installed'; END IF;

 SELECT max(key::integer) INTO r FROM jsonb_each_text(dates)
 WHERE value::date<=(now() AT TIME ZONE 'Australia/Sydney')::date;
 RETURN coalesce(r,1);
END $$;

CREATE OR REPLACE FUNCTION bilbbet_private.round_closed(r integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
DECLARE
 current_r integer:=bilbbet_private.current_round();
 open boolean;
 scope text;
 dates jsonb;
 kickoff timestamptz;
 reopened integer;
BEGIN
 IF r<current_r THEN RETURN true; END IF;

 SELECT coalesce((value #>> '{}')::boolean,true) INTO open
 FROM public.kv_store WHERE key='bilbbet2_round_betting_open';
 SELECT value #>> '{}' INTO scope
 FROM public.kv_store WHERE key='bilbbet2_close_scope';

 IF open=false THEN RETURN r=current_r OR scope='all'; END IF;

 SELECT value INTO dates FROM bilbbet_private.settings WHERE key='round_dates';
 SELECT (value #>> '{}')::integer INTO reopened
 FROM public.kv_store WHERE key='bilbbet2_last_autoclosed_round';

 kickoff:=((dates->>current_r::text)::date+time '19:00')
 AT TIME ZONE 'Australia/Sydney';

 RETURN coalesce(now()>=kickoff,false)
 AND coalesce(reopened,0)<>current_r
 AND (r=current_r OR scope='all');
END $$;

CREATE OR REPLACE FUNCTION public.bilbbet_register(
 p_username text,p_pin text,p_reminder boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE name text:=lower(trim(p_username)); u jsonb; carry jsonb;
BEGIN
 IF name IS NULL OR name='' OR length(name)>100 OR name='admin'
 OR name ~ '[[:cntrl:]]'
 OR p_pin IS NULL OR length(p_pin)<4 OR octet_length(p_pin)>72 THEN
  RETURN jsonb_build_object(
   'error','Choose a valid username and a PIN of at least four characters.'
  );
 END IF;

 IF EXISTS(SELECT 1 FROM bilbbet_private.credentials WHERE username=name)
 OR EXISTS(SELECT 1 FROM public.kv_store WHERE key='bilbbet2_user:'||name) THEN
  RETURN jsonb_build_object('error','This account already exists. Please sign in.');
 END IF;

 SELECT value->trim(p_username) INTO carry
 FROM bilbbet_private.settings WHERE key='carry_balances';

 INSERT INTO bilbbet_private.credentials(username,password_hash)
 VALUES(name,extensions.crypt(p_pin,extensions.gen_salt('bf',10)));

 u:=jsonb_build_object(
  'username',trim(p_username),
  'balance',0,
  'isAdmin',false,
  'status','PENDING',
  'everFunded',false,
  'welcomeSeen',false,
  'tipReminderEnabled',p_reminder,
  'dormantCarry',coalesce((carry->>'carry')::numeric,0),
  'historicalRecord',carry->'historicalRecord'
 );

 INSERT INTO public.kv_store(key,value) VALUES('bilbbet2_user:'||name,u);
 INSERT INTO public.kv_store(key,value)
 VALUES('bilbbet2_users_index',jsonb_build_array(trim(p_username)))
 ON CONFLICT(key) DO UPDATE SET value=public.kv_store.value||excluded.value;

 RETURN public.bilbbet_login(trim(p_username),p_pin);
END $$;

CREATE OR REPLACE FUNCTION public.bilbbet_reset_pin(p_username text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target text:=lower(trim(p_username)); secret text;
BEGIN
 IF NOT bilbbet_private.is_admin() THEN
  RAISE EXCEPTION 'Administrator sign-in required';
 END IF;

 PERFORM 1 FROM public.kv_store WHERE key='bilbbet2_user:'||target FOR UPDATE;

 IF NOT FOUND
 OR NOT EXISTS(
  SELECT 1 FROM bilbbet_private.credentials
  WHERE username=target AND NOT administrator
 ) THEN
  RAISE EXCEPTION 'Player account not found';
 END IF;

 secret:=lpad(
  ((('x'||encode(extensions.gen_random_bytes(6),'hex'))::bit(48)::bigint)
  %1000000000000)::text,12,'0'
 );

 UPDATE bilbbet_private.credentials
 SET password_hash=extensions.crypt(secret,extensions.gen_salt('bf',10)),
     legacy_hash=NULL
 WHERE username=target;

 DELETE FROM bilbbet_private.sessions WHERE username=target;
 DELETE FROM bilbbet_private.login_limits WHERE username=target;
 RETURN secret;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilbbet_reset_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_reset_pin(text) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.bilbbet_register(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_register(text,text,boolean) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.bilbbet_sync_settings(
 p_dates jsonb,p_rules jsonb,p_pool jsonb,p_carry jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT bilbbet_private.is_admin() THEN
  RAISE EXCEPTION 'Administrator sign-in required';
 END IF;

 IF jsonb_typeof(p_dates) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_rules) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_pool) IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_carry) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid season settings';
 END IF;

 PERFORM value::date FROM jsonb_each_text(p_dates);

 INSERT INTO bilbbet_private.settings(key,value) VALUES
  ('round_dates',p_dates),
  ('final_roster_market_hold',coalesce(p_rules->'final_roster_market_hold','true'::jsonb)),
  ('division3_pool',p_pool),
  ('carry_balances',p_carry)
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;

 RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilbbet_sync_settings(jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_sync_settings(jsonb,jsonb,jsonb,jsonb) TO anon,authenticated;

DO $$ BEGIN
 IF to_regprocedure('bilbbet_private.bilbbet_settle_bet(text,text,integer)') IS NULL THEN
  ALTER FUNCTION public.bilbbet_settle_bet(text,text,integer)
  SET SCHEMA bilbbet_private;
 END IF;
 IF to_regprocedure('bilbbet_private.bilbbet_place_bets(text,text,jsonb,integer,timestamptz,boolean)') IS NULL THEN
  ALTER FUNCTION public.bilbbet_place_bets(text,text,jsonb,integer,timestamptz,boolean)
  SET SCHEMA bilbbet_private;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bilbbet_settle_bet(
 p_bet_id text,p_result text,p_leg integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT bilbbet_private.is_admin() THEN
  RAISE EXCEPTION 'Administrator sign-in required';
 END IF;
 RETURN bilbbet_private.bilbbet_settle_bet(p_bet_id,p_result,p_leg);
END $$;

CREATE OR REPLACE FUNCTION public.bilbbet_place_bets(
 p_request_id text,
 p_username text,
 p_bets jsonb,
 p_round integer,
 p_deadline timestamptz DEFAULT NULL,
 p_recover_only boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 who text:=bilbbet_private.actor();
 current_r integer;
 receipt jsonb;
 scope text;
 b jsonb;
 selection jsonb;
 parts text[];
 r integer;
 held boolean;
 partial boolean;
 paused jsonb;
 category text;
 pool jsonb;
BEGIN
 IF who IS NULL OR who<>lower(p_username) THEN
  RAISE EXCEPTION 'Sign in to your own account';
 END IF;

 SELECT value INTO receipt FROM public.kv_store
 WHERE key='bilbbet2_placement:'||who||':'||p_request_id;

 IF receipt IS NOT NULL OR p_recover_only THEN
  RETURN bilbbet_private.bilbbet_place_bets(
   p_request_id,p_username,p_bets,p_round,p_deadline,p_recover_only
  );
 END IF;

 current_r:=bilbbet_private.current_round();
 IF p_round IS DISTINCT FROM current_r THEN
  RAISE EXCEPTION 'Round changed. Refresh the page';
 END IF;

 SELECT value #>> '{}' INTO scope FROM public.kv_store
 WHERE key='bilbbet2_close_scope';

 IF scope='all' AND bilbbet_private.round_closed(current_r) THEN
  RAISE EXCEPTION 'Betting is closed';
 END IF;

 SELECT value INTO paused FROM public.kv_store
 WHERE key='bilbbet2_paused_categories';

 SELECT coalesce((value #>> '{}')::boolean,true) INTO held
 FROM bilbbet_private.settings WHERE key='final_roster_market_hold';

 SELECT coalesce((value #>> '{}')::boolean,false) INTO partial
 FROM public.kv_store WHERE key='bilbbet2_divisions_announced';
 partial:=NOT coalesce(partial,false);

 SELECT value INTO pool FROM bilbbet_private.settings WHERE key='division3_pool';

 FOR b IN SELECT value FROM jsonb_array_elements(p_bets) LOOP
  IF jsonb_array_length(b->'selections')>100 THEN
   RAISE EXCEPTION 'Too many selections';
  END IF;

  FOR selection IN SELECT value FROM jsonb_array_elements(b->'selections') LOOP
   parts:=string_to_array(selection->>'id','|');
   r:=NULL;
   category:=NULL;

   IF parts[1]='H2H' THEN
    r:=replace(parts[3],'R','')::integer;
    category:='H2H';
   ELSIF parts[1] IN ('H2H_WIN','H2H_MEDIAN') THEN
    r:=replace(parts[3],'R','')::integer;
    category:='H2H';
   ELSIF parts[1]='LEADAT' THEN
    r:=parts[3]::integer;
    category:='LEADING';
   ELSIF parts[1]='SPECIALFIX' AND parts[2] IN ('win_round','lose_round') THEN
    r:=replace(parts[3],'R','')::integer;
    category:='SPECIALS';
   ELSIF parts[1]='SPECIALFIX' THEN
    category:='SPECIALS';
   ELSIF parts[1]='FUT' THEN
    category:=parts[2]||'|'||parts[3];
   ELSIF parts[1] IN ('FACUP','ECL','ECLGROUP') THEN
    category:=parts[1]||'|'||parts[2];
   END IF;

   IF r IS NOT NULL AND bilbbet_private.round_closed(r) THEN
    RAISE EXCEPTION 'This round has locked';
   END IF;

   IF coalesce((paused->>category)::boolean,false) THEN
    RAISE EXCEPTION 'This market is paused';
   END IF;

   IF held AND (
    parts[1]='FACUP'
    OR parts[1] IN ('FUT','LEADAT') AND parts[2]='RODDY'
    OR parts[1]='SPECIALFIX' AND parts[2] IN ('charity','philanthropy')
    OR EXISTS(
     SELECT 1 FROM unnest(parts) item
     WHERE item LIKE 'DIVISION 3%' OR coalesce(pool,'[]'::jsonb) ? item
    )
   ) THEN
    RAISE EXCEPTION 'Final-roster markets remain closed';
   END IF;

   IF partial AND parts[1]='H2H'
   AND NOT coalesce(
    (SELECT (value #>> '{}')::boolean FROM public.kv_store
     WHERE key='bilbbet2_h2h_schedule_confirmed'),
    false
   ) THEN
    RAISE EXCEPTION 'Official division fixtures are still pending';
   END IF;

   IF parts[1]='NOVELTY'
   AND (SELECT value->>'status' FROM public.kv_store
        WHERE key='bilbbet2_novelty:'||parts[2]) IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Novelty market is closed';
   END IF;

   IF parts[1] LIKE 'ELECTION_%'
   AND (SELECT (value #>> '{}')::boolean FROM public.kv_store
        WHERE key='bilbbet2_election_betting_open')=false THEN
    RAISE EXCEPTION 'Election betting is closed';
   END IF;
  END LOOP;
 END LOOP;

 RETURN bilbbet_private.bilbbet_place_bets(
  p_request_id,p_username,p_bets,current_r,NULL,false
 );
END $$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA bilbbet_private FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION
 public.bilbbet_settle_bet(text,text,integer),
 public.bilbbet_place_bets(text,text,jsonb,integer,timestamptz,boolean)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 public.bilbbet_settle_bet(text,text,integer),
 public.bilbbet_place_bets(text,text,jsonb,integer,timestamptz,boolean)
TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.bilbbet_feedback(
 p_category text,p_comment text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 who text:=bilbbet_private.actor();
 name text;
 id text:=encode(extensions.gen_random_bytes(12),'hex');
BEGIN
 IF p_category IS NULL OR length(p_category)>100
 OR coalesce(length(p_comment),0)>2000 THEN
  RAISE EXCEPTION 'Feedback is too long';
 END IF;

 SELECT value->>'username' INTO name FROM public.kv_store
 WHERE key='bilbbet2_user:'||who;

 INSERT INTO public.kv_store(key,value)
 VALUES(
  'bilbbet2_feedback:'||id,
  jsonb_build_object(
   'id',id,'username',coalesce(name,'Guest'),
   'category',p_category,'comment',p_comment,
   'timestamp',floor(extract(epoch FROM now())*1000)
  )
 );

 INSERT INTO public.kv_store(key,value)
 VALUES('bilbbet2_feedback_index',jsonb_build_array(id))
 ON CONFLICT(key) DO UPDATE SET value=public.kv_store.value||excluded.value;

 RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilbbet_feedback(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_feedback(text,text) TO anon,authenticated;
INSERT INTO bilbbet_private.settings(key,value) VALUES('round_dates','{"1": "2026-10-16", "2": "2026-10-23", "3": "2026-10-30", "4": "2026-11-06", "5": "2026-11-20", "6": "2026-11-27", "7": "2026-12-11", "8": "2026-12-18", "9": "2026-12-25", "10": "2027-01-01", "11": "2027-01-08", "12": "2027-01-15", "13": "2027-01-22", "14": "2027-01-29", "15": "2027-02-05", "16": "2027-02-12", "17": "2027-02-26", "18": "2027-03-05", "19": "2027-03-12", "20": "2027-03-19", "21": "2027-03-26", "22": "2027-04-02", "23": "2027-04-16", "24": "2027-04-23", "25": "2027-04-30", "26": "2027-05-07"}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO bilbbet_private.settings(key,value) VALUES('final_roster_market_hold','true'::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO bilbbet_private.settings(key,value) VALUES('division3_pool','["NUKEFORREST NUKES", "THE MALTESE KNIGHTS", "FOR VUCK''S SAKE FC", "GARRY WALLAH UNITED FC", "THE 2ND JARV ADMINISTRATION", "FC TIKITOKA", "MONGREL GARDEN", "VICTORY", "AARONGURDWOODREICH", "BREXIT LADS", "PAW PATROL UNITED", "LOAVES AND FISHES", "LOLLEY POP MAN", "CAG''S INVESTORS", "DOG GOES WOOF, PAYNE GOES MEOW", "PAYNE IN THE NECK", "GALUCTASARY", "SK STURM MELBOURNE", "SILVO''S SQUAD", "JEREMY", "GARNCELONA", "SHAQNADO 2: RETURN OF THE SHAQ", "BRAYDEN", "BRANDON''S MATE", "JYE", "ALEX", "SUCCULENT CHINESE MEAL", "DOESN''T EVEN MATA", "DADDY VALKANIS & SONS", "KRANSKY FC", "CONCEICAO"]'::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO bilbbet_private.settings(key,value) VALUES('carry_balances','{"ZEN GARDEN C.F": {"carry": -500.0, "historicalRecord": {"totalBets": 2, "winningBets": 0, "winnings": 0.0, "losingBets": 2, "losses": 1000.0, "voidBets": 0, "voidReturn": 0.0}}, "JERRY THE PAINTER": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "ZEN PIJ FC": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "SHANENIGANS": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "MELBCITYGUY": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "BEST OF A BAD BENCH": {"carry": 1.0, "historicalRecord": {"totalBets": 22, "winningBets": 10, "winnings": 29855.7, "losingBets": 12, "losses": 24276.05, "voidBets": 0, "voidReturn": 0.0}}, "LINDON-CHEVELLA FC": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "JARVIS ZEBRAS": {"carry": 40000.2, "historicalRecord": {"totalBets": 43, "winningBets": 8, "winnings": 150030.2, "losingBets": 35, "losses": 78579.72, "voidBets": 0, "voidReturn": 0.0}}, "STAIRWAY TO EVANS": {"carry": 340.0, "historicalRecord": {"totalBets": 1, "winningBets": 0, "winnings": 0.0, "losingBets": 1, "losses": 2500.0, "voidBets": 0, "voidReturn": 0.0}}, "KALLO FC": {"carry": 754.65, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "SAUCE FC": {"carry": 1025.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "ALASKAN BULL WORMS": {"carry": 1466.43, "historicalRecord": {"totalBets": 2, "winningBets": 1, "winnings": 122.5, "losingBets": 1, "losses": 50.0, "voidBets": 0, "voidReturn": 0.0}}, "BC UNITED ZEBRAS": {"carry": 75500.0, "historicalRecord": {"totalBets": 2, "winningBets": 2, "winnings": 76001.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "DW ABOUT IT FC": {"carry": 1000.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "GIVE US WANG": {"carry": 2803.93, "historicalRecord": {"totalBets": 11, "winningBets": 4, "winnings": 1795.11, "losingBets": 7, "losses": 400.0, "voidBets": 0, "voidReturn": 0.0}}, "NANISTATE": {"carry": 381.65, "historicalRecord": {"totalBets": 3, "winningBets": 2, "winnings": 1513.5, "losingBets": 1, "losses": 50.0, "voidBets": 0, "voidReturn": 0.0}}, "FROGBERT FOOTBALL": {"carry": 17808.92, "historicalRecord": {"totalBets": 12, "winningBets": 4, "winnings": 21463.75, "losingBets": 8, "losses": 6400.0, "voidBets": 0, "voidReturn": 0.0}}, "HARVEY FREKES": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "VICTORYRULES": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "BIG MAC FC": {"carry": 591.0, "historicalRecord": {"totalBets": 7, "winningBets": 3, "winnings": 393.0, "losingBets": 3, "losses": 150.0, "voidBets": 1, "voidReturn": 50.0}}, "TOP KUOLITY": {"carry": 0.0, "historicalRecord": {"totalBets": 1, "winningBets": 0, "winnings": 0.0, "losingBets": 1, "losses": 500.0, "voidBets": 0, "voidReturn": 0.0}}, "SONS OF VALHALLA": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "INTER MILANOVIC": {"carry": 700.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "3DOGS": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "ALBANIAN BOARS": {"carry": 9440.05, "historicalRecord": {"totalBets": 22, "winningBets": 12, "winnings": 32067.55, "losingBets": 10, "losses": 10500.0, "voidBets": 0, "voidReturn": 0.0}}, "LALAS LEVEN": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "MANCHESTHAIR UTD": {"carry": 500.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "THE WAINE TRAIN": {"carry": 0.32, "historicalRecord": {"totalBets": 26, "winningBets": 9, "winnings": 33599.09, "losingBets": 17, "losses": 32770.52, "voidBets": 0, "voidReturn": 0.0}}, "AFC BIG RED PORT": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "CARNEGIE DACHSHUNDS FC": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "REAPERS FC": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "ROTORUA UNITED": {"carry": 0.0, "historicalRecord": {"totalBets": 1, "winningBets": 1, "winnings": 90.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "THE DRONE POLICE": {"carry": 0.0, "historicalRecord": {"totalBets": 14, "winningBets": 6, "winnings": 19998.87, "losingBets": 7, "losses": 377.0, "voidBets": 1, "voidReturn": 370.0}}, "DINKIN CRFC": {"carry": 11088789.0, "historicalRecord": {"totalBets": 6, "winningBets": 0, "winnings": 0.0, "losingBets": 5, "losses": 1123500.0, "voidBets": 0, "voidReturn": 0.0}}, "SPOONERS FC": {"carry": 0.0, "historicalRecord": {"totalBets": 4, "winningBets": 2, "winnings": 1657.0, "losingBets": 2, "losses": 1957.14, "voidBets": 0, "voidReturn": 0.0}}, "CASUAL APPROACH": {"carry": 550.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "JUSTICEFORMOON FC": {"carry": -300.0, "historicalRecord": {"totalBets": 2, "winningBets": 0, "winnings": 0.0, "losingBets": 2, "losses": 500.0, "voidBets": 0, "voidReturn": 0.0}}, "ROYAL KC UNITED FC": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "SILVERMAN''S XI": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "X2 STRANGE": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "DEER PARK UNITED": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "THE GARUCCI-SHOW": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "FULLY SCICLUNA": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "JUAN EL MAGICO FC": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "BALLERS": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "THE MALTESE KNIGHTS": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "GARRY WALLAH UNITED FC": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "THE 2ND JARV ADMINISTRATION": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "MONGREL GARDEN": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "AARONGURDWOODREICH": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "LOAVES AND FISHES": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "CAG''S INVESTORS": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "DOG GOES WOOF, PAYNE GOES MEOW": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "PAYNE IN THE NECK": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "NUKEFORREST NUKES": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "FOR VUCK''S SAKE FC": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "FC TIKITOKA": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "VICTORY": {"carry": 550.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "BREXIT LADS": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "PAW PATROL UNITED": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}, "LOLLEY POP MAN": {"carry": 0.0, "historicalRecord": {"totalBets": 0, "winningBets": 0, "winnings": 0.0, "losingBets": 0, "losses": 0.0, "voidBets": 0, "voidReturn": 0.0}}}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value;

-- Check that direct public access is still blocked.
DO $$ BEGIN
 IF has_table_privilege('anon','public.kv_store','SELECT')
 OR has_table_privilege('anon','public.kv_store','INSERT')
 OR has_table_privilege('anon','public.kv_store','UPDATE')
 OR has_table_privilege('anon','public.kv_store','DELETE')
 OR has_any_column_privilege('anon','public.kv_store','SELECT')
 OR has_any_column_privilege('anon','public.kv_store','INSERT')
 OR has_any_column_privilege('anon','public.kv_store','UPDATE') THEN
  RAISE EXCEPTION 'Public table privileges remain';
 END IF;
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.headers','{}',true);

DO $$ DECLARE blocked boolean; BEGIN
 IF (public.bilbbet_read(ARRAY['bilbbet2_user:admin'])->'bilbbet2_user:admin') ? '__kv_version'
 OR (public.bilbbet_read(ARRAY['bilbbet2_user:admin'])->'bilbbet2_user:admin') ? 'pinHash' THEN
  RAISE EXCEPTION 'Anonymous private account read was accepted';
 END IF;

 blocked:=false;
 BEGIN
  PERFORM public.bilbbet_place_bets('security-probe','admin','[]'::jsonb,1,NULL,false);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Sign in to your own account' THEN blocked:=true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Anonymous bet was accepted'; END IF;

 blocked:=false;
 BEGIN
  PERFORM public.bilbbet_settle_bet('security-probe','WON',NULL);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Administrator sign-in required' THEN blocked:=true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Anonymous settlement was accepted'; END IF;
END $$;

RESET ROLE;

-- Generate a replacement admin PIN, shown only in SQL Editor results.
DELETE FROM bilbbet_private.sessions WHERE username='admin';
DELETE FROM bilbbet_private.login_limits WHERE username='admin';

WITH secret AS MATERIALIZED (
 SELECT lpad(
  ((('x'||encode(extensions.gen_random_bytes(3),'hex'))::bit(24)::bigint)
  %1000000)::text,6,'0'
 ) AS pin
),
updated AS (
 UPDATE bilbbet_private.credentials c
 SET password_hash=extensions.crypt(secret.pin,extensions.gen_salt('bf',10)),
     legacy_hash=NULL
 FROM secret WHERE c.username='admin' AND c.administrator
 RETURNING c.username
)
INSERT INTO bilbbet_private.settings(key,value)
SELECT 'admin_setup_pin',to_jsonb(secret.pin) FROM secret CROSS JOIN updated
ON CONFLICT(key) DO UPDATE SET value=excluded.value;

COMMIT;
NOTIFY pgrst, 'reload schema';

SELECT
 'PASS: protected access installed' AS result,
 value #>> '{}' AS private_admin_pin
FROM bilbbet_private.settings
WHERE key='admin_setup_pin';
