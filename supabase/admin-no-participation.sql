-- Restrict participation, not administration. No account/bet/tip data is changed.
-- Patch the installed wrappers so existing market controls and grants survive.
DO $migration$
DECLARE signature text; definition text; guard text; marker text;
BEGIN
 FOR signature,marker,guard IN
  SELECT * FROM (VALUES
   ('public.bilbbet_place_bets(text,text,jsonb,integer,timestamp with time zone,boolean)',
    'Admin accounts cannot place bets.',
    $guard$
 IF bilbbet_private.is_admin()
 AND NOT (coalesce(p_recover_only,false) OR EXISTS (
  SELECT 1 FROM public.kv_store
  WHERE key='bilbbet2_placement:'||who||':'||p_request_id
 )) THEN
  RAISE EXCEPTION 'Admin accounts cannot place bets.' USING ERRCODE='42501';
 END IF;
$guard$),
   ('public.bilbbet_write(text,jsonb,boolean)',
    'Admin accounts cannot submit tips.',
    $guard$
 IF bilbbet_private.is_admin() AND NOT coalesce(p_delete,false)
 AND (left(p_key,length('bilbbet2_tips_'||who||'_R'))='bilbbet2_tips_'||who||'_R'
  OR p_key='bilbbet2_preseason_'||who) THEN
  RAISE EXCEPTION 'Admin accounts cannot submit tips.' USING ERRCODE='42501';
 END IF;
$guard$)
  ) AS guards(signature,marker,guard)
 LOOP
  IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'Required RPC missing: %',signature; END IF;
  definition:=replace(pg_get_functiondef(to_regprocedure(signature)),E'\r\n',E'\n');
  IF position(marker IN definition)>0 THEN CONTINUE; END IF;
  IF position('who text:=bilbbet_private.actor()' IN definition)=0
  OR position(E'\nBEGIN\n' IN definition)=0 THEN
   RAISE EXCEPTION 'RPC layout differs; no changes applied: %',signature;
  END IF;
  EXECUTE regexp_replace(definition,E'\nBEGIN\n',E'\nBEGIN\n'||guard);
 END LOOP;
END
$migration$;
