-- Confirm the audited GW4 results without pinning the platform to GW5.
-- The date check prevents this marker leaking into a later season.
DO $patch$
DECLARE src text; anchor text; replacement text;
BEGIN
 src:=pg_get_functiondef('bilbbet_private.current_round()'::regprocedure);
 anchor:='finished:=bilbbet_private.completed_league_round(fixtures,schedule,now());';
 replacement:=anchor||chr(10)||$code$
 finished:=greatest(finished,coalesce((
   SELECT (value->>'round')::integer FROM bilbbet_private.settings
   WHERE key='confirmed_finalised_round'
     AND dates->>(value->>'round')=value->>'round_date'
 ),0));
$code$;
 IF position('confirmed_finalised_round' in src)=0 THEN
  IF position(anchor in src)=0 THEN RAISE EXCEPTION 'Round function differs; no changes made'; END IF;
  EXECUTE replace(src,anchor,replacement);
 END IF;
 INSERT INTO bilbbet_private.settings(key,value)
 VALUES('confirmed_finalised_round','{"round":4,"round_date":"2026-11-06","reason":"Validated 66-team GW4 results; user confirmed finalisation"}'::jsonb)
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
END $patch$;