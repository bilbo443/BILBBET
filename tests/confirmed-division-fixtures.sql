-- Run after the migration; read-only assertions, no test bets.
DO $test$
BEGIN
 IF (SELECT count(*) FROM bilbbet_private.settings s,LATERAL jsonb_array_elements(s.value) f WHERE s.key='confirmed_division_fixtures' AND NOT bilbbet_private.division_fixture_confirmed((f->>'round')::integer,f->>'a',f->>'b'))<>0 THEN RAISE EXCEPTION 'Fixture rejection'; END IF;
 IF (SELECT count(*) FROM bilbbet_private.settings s,LATERAL jsonb_array_elements(s.value) f WHERE s.key='confirmed_division_fixtures' AND NOT bilbbet_private.division_fixture_confirmed((f->>'round')::integer,f->>'b',f->>'a'))<>0 THEN RAISE EXCEPTION 'Reverse rejection'; END IF;
 IF bilbbet_private.division_fixture_confirmed(6,'UNKNOWN','OTHER') OR bilbbet_private.division_fixture_confirmed(0,'BC UNITED ZEBRAS','HARVEY FREKES') OR bilbbet_private.division_fixture_confirmed(6,'BC UNITED ZEBRAS','BC UNITED ZEBRAS') THEN RAISE EXCEPTION 'Invalid pair accepted'; END IF;
 IF bilbbet_private.round_closed(6) THEN RAISE EXCEPTION 'GW6 closed'; END IF;
 IF NOT bilbbet_private.round_closed(5) THEN RAISE EXCEPTION 'GW5 open'; END IF;
END $test$;