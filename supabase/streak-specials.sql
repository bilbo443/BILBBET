-- Validation only: no quote publication, account changes or settlement.
CREATE OR REPLACE FUNCTION bilbbet_private.assert_streak_pick(b jsonb,q jsonb,who text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'pg_catalog' AS $$
DECLARE parts text[]:=string_to_array(q->>'id','|'); negative boolean;
BEGIN
 IF jsonb_array_length(b->'selections')<>1 THEN
  RAISE EXCEPTION 'First-win/first-loss specials are singles only';
 END IF;
 IF coalesce(q->>'id','') !~ '^STREAK[|](WIN|LOSS)[|][0-9]{3}[|]R([1-9]|1[0-9]|2[0-6])[|](R([1-9]|1[0-9]|2[0-6])|NEVER)$'
 OR (q->>'round')::integer IS DISTINCT FROM substring(parts[4] FROM 2)::integer
 OR q->>'team_id' IS DISTINCT FROM parts[3] THEN
  RAISE EXCEPTION 'Invalid streak quote; refresh the price board';
 END IF;
 IF parts[5]<>'NEVER' AND substring(parts[5] FROM 2)::integer<substring(parts[4] FROM 2)::integer THEN
  RAISE EXCEPTION 'Streak outcome precedes its offering round';
 END IF;
 negative:=(parts[2]='LOSS' AND parts[5]<>'NEVER') OR (parts[2]='WIN' AND parts[5]='NEVER');
 IF negative AND (lower(q->>'team')=who OR EXISTS(
   SELECT 1 FROM bilbbet_private.team_accounts a WHERE lower(a.username)=who AND a.team_id=parts[3]
 )) THEN RAISE EXCEPTION 'You cannot back a negative streak outcome for your own team'; END IF;
END $$;
REVOKE ALL ON FUNCTION bilbbet_private.assert_streak_pick(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
DO $migration$
DECLARE definition text; marker text:='   IF q->>''exclusive'' IS NOT NULL THEN';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='bilbbet_private' AND p.proname='place_with_prices';
 IF position('PERFORM bilbbet_private.assert_streak_pick' IN definition)>0 THEN RETURN; END IF;
 IF (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 THEN
  RAISE EXCEPTION 'Quote validation code differs; no changes made';
 END IF;
 EXECUTE replace(definition,marker,
  E'   IF q->>''type''=''STREAK'' THEN\n    PERFORM bilbbet_private.assert_streak_pick(b,q,who);\n   END IF;\n\n'||marker);
END $migration$;
