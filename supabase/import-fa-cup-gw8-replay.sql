-- Append the confirmed GW8 replay; preserve all prior fixtures and settings.
BEGIN;
DO $import$
DECLARE
 rounds jsonb := '{"8": [["JUSTICEFORMOON FC", "NANISTATE"]]}'::jsonb;
 previous jsonb; existing jsonb; appended jsonb; pair jsonb;
BEGIN
 IF jsonb_array_length(rounds->'8')<>1 OR
    (SELECT count(DISTINCT name) FROM jsonb_array_elements(rounds->'8') p,
       LATERAL jsonb_array_elements_text(p) AS names(name))<>2 THEN
  RAISE EXCEPTION 'Draw must contain 2 unique teams';
 END IF;
 SELECT value INTO previous FROM public.kv_store WHERE key='bilbbet2_cup_fixtures' FOR UPDATE;
 previous:=coalesce(previous,'{}'::jsonb);
 SELECT coalesce(jsonb_agg(jsonb_build_array(f->>'teamA',f->>'teamB')),'[]'::jsonb)
 INTO existing FROM jsonb_array_elements(coalesce(previous->'FA CUP','[]'::jsonb)) f
 WHERE (f->>'round')::integer=8;
 IF jsonb_array_length(existing)>0 AND (jsonb_array_length(existing)<>1 OR NOT (existing @> (rounds->'8') AND (rounds->'8') @> existing)) THEN
  RAISE EXCEPTION 'Different Round 8 fixtures already exist; review manually';
 END IF;
 IF jsonb_array_length(existing)=0 THEN
  appended:=coalesce(previous->'FA CUP','[]'::jsonb);
  FOR pair IN SELECT value FROM jsonb_array_elements(rounds->'8') LOOP
   appended:=appended||jsonb_build_array(jsonb_build_object('round',8,'stage','Round Of 32 Replay','teamA',pair->>0,'teamB',pair->>1));
  END LOOP;
  INSERT INTO public.kv_store(key,value) VALUES('bilbbet2_cup_fixtures',jsonb_set(previous,'{FA CUP}',appended))
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 END IF;
 IF EXISTS (SELECT 1 FROM bilbbet_private.settings WHERE key='confirmed_fa_cup_rounds'
    AND value ? '8' AND value->'8' IS DISTINCT FROM rounds->'8') THEN
  RAISE EXCEPTION 'Different Round 8 allowlist already exists';
 END IF;
 INSERT INTO bilbbet_private.settings(key,value) VALUES('confirmed_fa_cup_rounds',rounds)
 ON CONFLICT(key) DO UPDATE SET value=bilbbet_private.settings.value||excluded.value;
END $import$;
COMMIT;
