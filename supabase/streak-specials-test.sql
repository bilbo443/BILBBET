-- Read-only validation assertions; no placement, balance or settlement calls.
DO $$
DECLARE q jsonb:='{"id":"STREAK|WIN|999|R5|R7","team_id":"999","team":"sample team","round":5,"type":"STREAK"}';
BEGIN
 PERFORM bilbbet_private.assert_streak_pick('{"selections":[{}]}'::jsonb,q,'different sample user');
 BEGIN
  PERFORM bilbbet_private.assert_streak_pick('{"selections":[{},{}]}'::jsonb,q,'different sample user');
  RAISE EXCEPTION 'Test failed: multi accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%singles only%' THEN RAISE; END IF;
 END;
 q:=q||'{"id":"STREAK|LOSS|999|R5|R7"}'::jsonb;
 BEGIN
  PERFORM bilbbet_private.assert_streak_pick('{"selections":[{}]}'::jsonb,q,'sample team');
  RAISE EXCEPTION 'Test failed: negative own-team outcome accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%negative streak%' THEN RAISE; END IF;
 END;
 q:=q||'{"id":"STREAK|LOSS|999|R5|NEVER"}'::jsonb;
 PERFORM bilbbet_private.assert_streak_pick('{"selections":[{}]}'::jsonb,q,'sample team');
 q:=q||'{"round":6}'::jsonb;
 BEGIN
  PERFORM bilbbet_private.assert_streak_pick('{"selections":[{}]}'::jsonb,q,'different sample user');
  RAISE EXCEPTION 'Test failed: bad lockout round accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Invalid streak quote%' THEN RAISE; END IF;
 END;
END $$;
SELECT position('PERFORM bilbbet_private.assert_streak_pick' IN pg_get_functiondef('bilbbet_private.place_with_prices(text,text,jsonb,integer,timestamptz,boolean)'::regprocedure))>0 AS streak_validation_installed;
DO $$
DECLARE safe jsonb:='[
 {"id":"STREAK|WIN|999|R5|R5","prices":[2.5],"safetyGroup":"test-streak","safetyOutcome":"R5","safetySize":3},
 {"id":"STREAK|WIN|999|R5|R6","prices":[2.5],"safetyGroup":"test-streak","safetyOutcome":"R6","safetySize":3},
 {"id":"STREAK|WIN|999|R5|NEVER","prices":[2.5],"safetyGroup":"test-streak","safetyOutcome":"NEVER","safetySize":3}]';
BEGIN
 PERFORM bilbbet_private.assert_quote_books(safe);
 BEGIN
  PERFORM bilbbet_private.assert_quote_books(replace(safe::text,'2.5','4.0')::jsonb);
  RAISE EXCEPTION 'Test failed: unsafe streak book accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%guarantee profit%' THEN RAISE; END IF;
 END;
END $$;
