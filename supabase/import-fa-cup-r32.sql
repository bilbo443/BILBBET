-- Append the confirmed GW4 draw; preserve all prior fixtures and settings.
BEGIN;
DO $import$
DECLARE
 rounds jsonb := '{"4": [["BC UNITED ZEBRAS", "FROGBERT FOOTBALL"], ["JUSTICEFORMOON FC", "NANISTATE"], ["THE DRONE POLICE", "KALLO FC"], ["PAYNE IN THE NECK FC", "MANCHESTHAIR UTD"], ["DEER PARK UNITED", "SAUCE FC"], ["RIO''S RHINOS", "QUINTASENTIAL FC"], ["AARONGURDWOODREICH", "SILVERMAN''S XI"], ["DINKIN CRFC", "THE BEAU-CHAMPS"], ["CASUAL APPROACH", "HARVEY FREKES"], ["AFC BIG RED PORT", "ALBANIAN BOARS"], ["GIVE US WANG", "DW ABOUT IT FC"], ["LALAS LEVEN", "CONCEICAO"], ["ROTORUA UNITED", "GARRY WALLAH UNITED"], ["ALASKAN BULL WORMS", "VICTORYRULES"], ["DRUMMOYNE TERRIERS", "GARNCELONA"], ["GOT WOUD?", "LOAVES & FISHES"]]}'::jsonb;
 previous jsonb; existing jsonb; appended jsonb; pair jsonb;
BEGIN
 IF jsonb_array_length(rounds->'4')<>16 OR
    (SELECT count(DISTINCT name) FROM jsonb_array_elements(rounds->'4') p,
       LATERAL jsonb_array_elements_text(p) AS names(name))<>32 THEN
  RAISE EXCEPTION 'Draw must contain 32 unique teams';
 END IF;
 SELECT value INTO previous FROM public.kv_store WHERE key='bilbbet2_cup_fixtures' FOR UPDATE;
 previous:=coalesce(previous,'{}'::jsonb);
 SELECT coalesce(jsonb_agg(jsonb_build_array(f->>'teamA',f->>'teamB')),'[]'::jsonb)
 INTO existing FROM jsonb_array_elements(coalesce(previous->'FA CUP','[]'::jsonb)) f
 WHERE (f->>'round')::integer=4;
 IF jsonb_array_length(existing)>0 AND (jsonb_array_length(existing)<>16 OR NOT (existing @> (rounds->'4') AND (rounds->'4') @> existing)) THEN
  RAISE EXCEPTION 'Different Round 4 fixtures already exist; review manually';
 END IF;
 IF jsonb_array_length(existing)=0 THEN
  appended:=coalesce(previous->'FA CUP','[]'::jsonb);
  FOR pair IN SELECT value FROM jsonb_array_elements(rounds->'4') LOOP
   appended:=appended||jsonb_build_array(jsonb_build_object('round',4,'stage','Round Of 32','teamA',pair->>0,'teamB',pair->>1));
  END LOOP;
  INSERT INTO public.kv_store(key,value) VALUES('bilbbet2_cup_fixtures',jsonb_set(previous,'{FA CUP}',appended))
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 END IF;
 IF EXISTS (SELECT 1 FROM bilbbet_private.settings WHERE key='confirmed_fa_cup_rounds'
    AND value ? '4' AND value->'4' IS DISTINCT FROM rounds->'4') THEN
  RAISE EXCEPTION 'Different Round 4 allowlist already exists';
 END IF;
 INSERT INTO bilbbet_private.settings(key,value) VALUES('confirmed_fa_cup_rounds',rounds)
 ON CONFLICT(key) DO UPDATE SET value=bilbbet_private.settings.value||excluded.value;
END $import$;
COMMIT;
