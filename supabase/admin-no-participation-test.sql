-- Rollback-only integration tests. Ephemeral sessions are never returned.
BEGIN;
DO $test$
DECLARE admin_name text; player_name text; token text; key text; message text; blocked boolean;
BEGIN
 SELECT c.username INTO admin_name FROM bilbbet_private.credentials c
 JOIN public.kv_store k ON k.key='bilbbet2_user:'||c.username
 WHERE c.administrator AND coalesce(k.value->>'status','APPROVED') NOT IN ('RESET','REJECTED','KICKED') LIMIT 1;
 SELECT c.username INTO player_name FROM bilbbet_private.credentials c
 JOIN public.kv_store k ON k.key='bilbbet2_user:'||c.username
 WHERE NOT c.administrator AND k.value->>'status'='APPROVED' LIMIT 1;
 IF admin_name IS NULL OR player_name IS NULL THEN RAISE EXCEPTION 'Test needs one existing admin and ordinary approved account'; END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO bilbbet_private.sessions(token_hash,username,expires_at)
 VALUES(encode(extensions.digest(token,'sha256'),'hex'),admin_name,now()+interval '5 minutes');
 PERFORM set_config('request.headers',jsonb_build_object('x-bilbbet-session',token)::text,true);
 IF NOT bilbbet_private.is_admin() THEN RAISE EXCEPTION 'Admin test session failed'; END IF;
 blocked:=false;
 BEGIN
  PERFORM public.bilbbet_place_bets('admin-participation-probe',admin_name,'[]',1,NULL,false);
 EXCEPTION WHEN insufficient_privilege THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message<>'Admin accounts cannot place bets.' THEN RAISE; END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Admin bet guard missing'; END IF;
 FOREACH key IN ARRAY ARRAY['bilbbet2_tips_'||admin_name||'_R5_official_26-27','bilbbet2_tips_'||admin_name||'_R1_median_26-27','bilbbet2_preseason_'||admin_name] LOOP
  blocked:=false;
  BEGIN
   PERFORM public.bilbbet_write(key,'{"picks":{}}',false);
  EXCEPTION WHEN insufficient_privilege THEN
   GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   IF message<>'Admin accounts cannot submit tips.' THEN RAISE; END IF;
   blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Admin tip guard missing'; END IF;
 END LOOP;
 -- Management writes still work; roll back this isolated probe immediately.
 BEGIN
  IF NOT public.bilbbet_write('bilbbet2_admin_participation_probe','true',false) THEN RAISE EXCEPTION 'Admin management write failed'; END IF;
  RAISE EXCEPTION 'Rollback management probe' USING ERRCODE='Z0001';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 -- Recover-only must never place a new bet, even for an admin.
 blocked:=false;
 BEGIN
  PERFORM public.bilbbet_place_bets('admin-recovery-probe',admin_name,'[]',1,NULL,true);
  RAISE EXCEPTION 'Unexpected recovery success';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message='Admin accounts cannot place bets.' OR message='Unexpected recovery success' THEN RAISE; END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Recovery test failed'; END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO bilbbet_private.sessions(token_hash,username,expires_at)
 VALUES(encode(extensions.digest(token,'sha256'),'hex'),player_name,now()+interval '5 minutes');
 PERFORM set_config('request.headers',jsonb_build_object('x-bilbbet-session',token)::text,true);
 IF bilbbet_private.is_admin() THEN RAISE EXCEPTION 'Player test session failed'; END IF;
 -- Invalid empty input exercises existing validation without accepting a bet.
 BEGIN
  PERFORM public.bilbbet_place_bets('ordinary-player-probe',player_name,'[]',1,NULL,false);
  RAISE EXCEPTION 'Unexpected empty bet success';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message LIKE 'Admin accounts%' OR message='Unexpected empty bet success' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.bilbbet_write('bilbbet2_admin_participation_probe','true',false);
  RAISE EXCEPTION 'Ordinary account changed admin state';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message LIKE 'Admin accounts%' OR message='Ordinary account changed admin state' THEN RAISE; END IF;
 END;
END
$test$;
SELECT 'PASS: admin betting and weekly/preseason tipping blocked; management and ordinary validation preserved; all probes rolled back.' AS result;
ROLLBACK;
