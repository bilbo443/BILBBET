-- Derive the active round from synced, completed league results as well as the calendar.
CREATE OR REPLACE FUNCTION bilbbet_private.completed_league_round(fixtures jsonb, schedule jsonb, checked_at timestamptz)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(max(r),0) FROM (
  SELECT (f->>'round')::integer r
  FROM jsonb_array_elements(coalesce(fixtures,'[]'::jsonb)) f
  WHERE f->>'section' IN ('ELIZA','DIV2','DIV3')
    AND NOT coalesce((f->>'median')::boolean,false)
  GROUP BY (f->>'round')::integer
  HAVING bool_and(jsonb_typeof(f->'sa') IS NOT DISTINCT FROM 'number'
              AND jsonb_typeof(f->'sb') IS NOT DISTINCT FROM 'number')
 ) completed
 WHERE r BETWEEN 1 AND 26 AND schedule->'rounds'->r::text->>'results_check_date' IS NOT NULL
 AND checked_at >= (((schedule->'rounds'->r::text->>'results_check_date')::date+time '12:30') AT TIME ZONE 'Australia/Sydney');
$$;
REVOKE ALL ON FUNCTION bilbbet_private.completed_league_round(jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION bilbbet_private.current_round()
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE dates jsonb; schedule jsonb; fixtures jsonb; r integer; override integer; finished integer;
BEGIN
 SELECT (value #>> '{}')::integer INTO override FROM public.kv_store WHERE key='bilbbet2_current_round_override';
 IF override IS NOT NULL THEN RETURN override; END IF;
 SELECT value INTO dates FROM bilbbet_private.settings WHERE key='round_dates';
 IF dates IS NULL THEN RAISE EXCEPTION 'Server calendar not installed'; END IF;
 SELECT max(key::integer) INTO r FROM jsonb_each_text(dates) WHERE value::date <= (now() AT TIME ZONE 'Australia/Sydney')::date;
 SELECT value INTO schedule FROM bilbbet_private.settings WHERE key='round_results_schedule';
 SELECT value->'fixtures' INTO fixtures FROM bilbbet_private.settings WHERE key='reward_context';
 finished:=bilbbet_private.completed_league_round(fixtures,schedule,now());
 RETURN least(26,greatest(coalesce(r,1),finished+1));
END $$;
CREATE OR REPLACE FUNCTION public.bilbbet_current_round()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT bilbbet_private.current_round();
$$;
REVOKE ALL ON FUNCTION public.bilbbet_current_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_current_round() TO anon,authenticated;

INSERT INTO bilbbet_private.settings(key,value) VALUES('round_results_schedule','{"season": "2026-27", "timezone": "Australia/Sydney", "source": "User-supplied A-League fixture CSV, 16 October 2026", "note": "Dates are planned; revise for postponements. No automatic final-results declaration.", "rounds": {"1": {"first_fixture_date": "2026-10-16", "last_fixture_date": "2026-10-18", "results_check_date": "2026-10-19", "split_round": false}, "2": {"first_fixture_date": "2026-10-23", "last_fixture_date": "2026-10-25", "results_check_date": "2026-10-26", "split_round": false}, "3": {"first_fixture_date": "2026-10-30", "last_fixture_date": "2026-11-01", "results_check_date": "2026-11-02", "split_round": false}, "4": {"first_fixture_date": "2026-11-06", "last_fixture_date": "2026-11-08", "results_check_date": "2026-11-09", "split_round": false}, "5": {"first_fixture_date": "2026-11-20", "last_fixture_date": "2026-11-22", "results_check_date": "2026-11-23", "split_round": false}, "6": {"first_fixture_date": "2026-11-27", "last_fixture_date": "2026-12-06", "results_check_date": "2026-12-07", "split_round": true}, "7": {"first_fixture_date": "2026-12-11", "last_fixture_date": "2026-12-15", "results_check_date": "2026-12-16", "split_round": false, "fixture_change": {"home": "Adelaide United", "away": "Brisbane Roar", "moved_from_round": 1, "kickoff_date": "2026-12-15", "kickoff_time": "19:30", "kickoff_timezone": "Awaiting confirmation: Adelaide or Sydney local time"}}, "8": {"first_fixture_date": "2026-12-18", "last_fixture_date": "2026-12-21", "results_check_date": "2026-12-22", "split_round": false}, "9": {"first_fixture_date": "2026-12-26", "last_fixture_date": "2026-12-30", "results_check_date": "2026-12-31", "split_round": false}, "10": {"first_fixture_date": "2026-12-31", "last_fixture_date": "2027-01-03", "results_check_date": "2027-01-04", "split_round": false}, "11": {"first_fixture_date": "2027-01-08", "last_fixture_date": "2027-01-10", "results_check_date": "2027-01-11", "split_round": false}, "12": {"first_fixture_date": "2027-01-14", "last_fixture_date": "2027-01-19", "results_check_date": "2027-01-20", "split_round": false}, "13": {"first_fixture_date": "2027-01-22", "last_fixture_date": "2027-01-26", "results_check_date": "2027-01-27", "split_round": false}, "14": {"first_fixture_date": "2027-01-29", "last_fixture_date": "2027-01-31", "results_check_date": "2027-02-01", "split_round": false}, "15": {"first_fixture_date": "2027-02-05", "last_fixture_date": "2027-02-07", "results_check_date": "2027-02-08", "split_round": false}, "16": {"first_fixture_date": "2027-02-13", "last_fixture_date": "2027-02-21", "results_check_date": "2027-02-22", "split_round": true}, "17": {"first_fixture_date": "2027-02-26", "last_fixture_date": "2027-02-28", "results_check_date": "2027-03-01", "split_round": false}, "18": {"first_fixture_date": "2027-03-05", "last_fixture_date": "2027-03-07", "results_check_date": "2027-03-08", "split_round": false}, "19": {"first_fixture_date": "2027-03-12", "last_fixture_date": "2027-03-14", "results_check_date": "2027-03-15", "split_round": false}, "20": {"first_fixture_date": "2027-03-19", "last_fixture_date": "2027-03-21", "results_check_date": "2027-03-22", "split_round": false}, "21": {"first_fixture_date": "2027-04-02", "last_fixture_date": "2027-04-04", "results_check_date": "2027-04-05", "split_round": false}, "22": {"first_fixture_date": "2027-04-09", "last_fixture_date": "2027-04-11", "results_check_date": "2027-04-12", "split_round": false}, "23": {"first_fixture_date": "2027-04-16", "last_fixture_date": "2027-04-18", "results_check_date": "2027-04-19", "split_round": false}, "24": {"first_fixture_date": "2027-04-23", "last_fixture_date": "2027-04-26", "results_check_date": "2027-04-27", "split_round": false}, "25": {"first_fixture_date": "2027-04-30", "last_fixture_date": "2027-05-02", "results_check_date": "2027-05-03", "split_round": false}, "26": {"first_fixture_date": "2027-05-07", "last_fixture_date": "2027-05-09", "results_check_date": "2027-05-10", "split_round": false}}}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
