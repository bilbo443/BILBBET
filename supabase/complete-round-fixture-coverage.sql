-- Pure helper only: no balances, reward credit, results or current-round override writes.
CREATE OR REPLACE FUNCTION bilbbet_private.completed_league_round(fixtures jsonb, schedule jsonb, checked_at timestamptz)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 WITH league AS (
  SELECT (f->>'round')::integer r,f
  FROM jsonb_array_elements(coalesce(fixtures,'[]'::jsonb)) f
  WHERE f->>'section' IN ('ELIZA','DIV2','DIV3')
    AND NOT coalesce((f->>'median')::boolean,false)
 ), completed AS (
  SELECT r,count(*) matches FROM league GROUP BY r
  HAVING bool_and(jsonb_typeof(f->'sa') IS NOT DISTINCT FROM 'number'
              AND jsonb_typeof(f->'sb') IS NOT DISTINCT FROM 'number'
              AND coalesce(f->>'key','')<>'')
     AND count(DISTINCT (f->>'section',f->>'key'))=count(*)
 )
 SELECT coalesce(max(r),0) FROM completed c
 WHERE r BETWEEN 1 AND 26
 AND jsonb_typeof(schedule->'rounds'->r::text->'expected_league_fixtures')='object'
 AND (schedule->'rounds'->r::text->'expected_league_fixtures') ?& ARRAY['ELIZA','DIV2','DIV3']
 AND NOT EXISTS (
  SELECT 1 FROM jsonb_each_text(schedule->'rounds'->r::text->'expected_league_fixtures') e
  WHERE (SELECT count(*) FROM league l WHERE l.r=c.r AND l.f->>'section'=e.key)<e.value::integer
 )
 AND (SELECT count(DISTINCT team) FROM (
   SELECT f->>'a' team FROM league WHERE league.r=c.r
   UNION ALL SELECT f->>'b' team FROM league WHERE league.r=c.r
 ) teams)=2*c.matches
 AND checked_at >= (((schedule->'rounds'->r::text->>'results_check_date')::date+time '12:30') AT TIME ZONE 'Australia/Sydney');
$$;
REVOKE ALL ON FUNCTION bilbbet_private.completed_league_round(jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
