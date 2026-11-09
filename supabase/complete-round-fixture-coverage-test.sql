-- Isolated calls to the pure helper; no persisted fixtures or account writes.
DO $test$
DECLARE schedule jsonb:='{"rounds":{"5":{"results_check_date":"2026-11-23","expected_league_fixtures":{"ELIZA":1,"DIV2":1,"DIV3":1}},"6":{"results_check_date":"2026-12-07","expected_league_fixtures":{"ELIZA":1,"DIV2":1,"DIV3":1}}}}';
 fixtures jsonb:='[{"round":5,"section":"ELIZA","key":"ELIZA|0","a":"A","b":"B","sa":80,"sb":70},{"round":5,"section":"DIV2","key":"DIV2|0","a":"C","b":"D","sa":50,"sb":60},{"round":5,"section":"DIV3","key":"DIV3|0","a":"E","b":"F","sa":65,"sb":65}]';
 split jsonb; missing jsonb;
BEGIN
 IF bilbbet_private.completed_league_round(fixtures,schedule,'2026-11-23 12:29 Australia/Sydney')<>0 THEN RAISE EXCEPTION 'Premature completion before check time'; END IF;
 IF bilbbet_private.completed_league_round(fixtures,schedule,'2026-11-23 12:30 Australia/Sydney')<>5 THEN RAISE EXCEPTION 'Complete round did not qualify'; END IF;
 IF bilbbet_private.completed_league_round(jsonb_build_array(fixtures->0),schedule,'2026-11-23 12:30 Australia/Sydney')<>0 THEN RAISE EXCEPTION 'Single fixture incorrectly completed the round'; END IF;
 missing:=jsonb_set(fixtures,'{2,sb}','null');
 IF bilbbet_private.completed_league_round(missing,schedule,'2026-11-23 12:30 Australia/Sydney')<>0 THEN RAISE EXCEPTION 'Missing score incorrectly completed the round'; END IF;
 IF bilbbet_private.completed_league_round(fixtures||jsonb_build_array(fixtures->0),schedule,'2026-11-23 12:30 Australia/Sydney')<>0 THEN RAISE EXCEPTION 'Duplicate fixture accepted'; END IF;
 missing:=jsonb_set(fixtures,'{2,a}','"A"');
 IF bilbbet_private.completed_league_round(missing,schedule,'2026-11-23 12:30 Australia/Sydney')<>0 THEN RAISE EXCEPTION 'Repeated team accepted'; END IF;
 SELECT jsonb_agg(jsonb_set(f,'{round}','6')) INTO split FROM jsonb_array_elements(fixtures) f;
 IF bilbbet_private.completed_league_round(split,schedule,'2026-11-30 12:30 Australia/Sydney')<>0 THEN RAISE EXCEPTION 'Split round completed after first week'; END IF;
 IF bilbbet_private.completed_league_round(split,schedule,'2026-12-07 12:30 Australia/Sydney')<>6 THEN RAISE EXCEPTION 'Complete split round did not qualify'; END IF;
 IF bilbbet_private.completed_league_round(fixtures,'{}','2026-11-23 12:30 Australia/Sydney')<>0 THEN RAISE EXCEPTION 'Missing schedule accepted'; END IF;
END $test$;
SELECT true AS isolated_fixture_coverage_tests_passed;
