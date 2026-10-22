-- Review and run in Supabase SQL Editor AFTER merging the draw PR.
-- Installs official GW2 fixtures and the exact-pair server exception.
-- Does not reopen betting, publish prices, settle bets or change balances.
BEGIN;
DO $import$
DECLARE
 rounds jsonb := '{"2": [["KALLO FC", "SYDNEY OLEEE"], ["MANCHESTHAIR UTD", "CARNEGIE DACHSHUNDS"], ["VICTORY", "GOT WOUD?"], ["BIG MAC FC", "DEER PARK UNITED"], ["RUBY FC", "THE BEAU-CHAMPS"], ["GARNCELONA", "SPOONERS FC"], ["PAYNE IN THE NECK FC", "SHAQNADO 2: RETURN OF THE SHAQ"], ["LALAS LEVEN", "BORATVERYNICE"], ["RICKY DIACO FC", "DINKIN CRFC"], ["SAUCE FC", "FULLY SCICLUNA"], ["GIVE US WANG", "PAW PATROL UNITED"], ["ALASKAN BULL WORMS", "TOP KUOLITY"], ["DADDY VALKANIS & SONS", "DRUMMOYNE TERRIERS"], ["THE DRONE POLICE", "X2 STRANGE"], ["HARVEY FREKES", "THE GARUCCI-SHOW"], ["MONGREL GARDEN", "LOAVES & FISHES"], ["FOR VUCK''S SAKE FC", "ALBANIAN BOARS"], ["JARVIS ZEBRAS", "BC UNITED ZEBRAS"], ["PAIN IN DIAS", "AFC BIG RED PORT"], ["CONCEICAO", "BALLERS"], ["DW ABOUT IT FC", "INTER MILANOVIC"], ["KRANSKY FC", "JUSTICEFORMOON FC"], ["FROGBERT FOOTBALL", "JUAN EL MAGICO FC"], ["THE WAINE TRAIN", "NANISTATE"], ["SILVERMAN''S XI", "STAIRWAY TO EVANS"], ["SILVO''S SQUAD", "VICTORYRULES"], ["E/MELB SUCCULENT CHINESE MEAL", "ROTORUA UNITED"], ["MACCA''S STARS", "RIO''S RHINOS"], ["AARONGURDWOODREICH", "3DOGS"], ["SK STURM MELBOURNE", "GARRY WALLAH UNITED"], ["CASUAL APPROACH", "BREXIT LADS"], ["QUINTASENTIAL FC", "TBCFC"]]}'::jsonb;
 previous jsonb; existing jsonb; appended jsonb; pair jsonb;
 source text; anchor text; replacement text;
BEGIN
 IF jsonb_array_length(rounds->'2')<>32 OR
    (SELECT count(DISTINCT name) FROM jsonb_array_elements(rounds->'2') p,
       LATERAL jsonb_array_elements_text(p) AS names(name))<>64 THEN
  RAISE EXCEPTION 'Draw must contain 64 unique teams';
 END IF;
 SELECT value INTO previous FROM public.kv_store WHERE key='bilbbet2_cup_fixtures' FOR UPDATE;
 previous:=coalesce(previous,'{}'::jsonb);
 SELECT coalesce(jsonb_agg(jsonb_build_array(f->>'teamA',f->>'teamB')),'[]'::jsonb)
 INTO existing FROM jsonb_array_elements(coalesce(previous->'FA CUP','[]'::jsonb)) f
 WHERE (f->>'round')::integer=2;
 IF jsonb_array_length(existing)>0 AND (jsonb_array_length(existing)<>32 OR NOT (existing @> (rounds->'2') AND (rounds->'2') @> existing)) THEN
  RAISE EXCEPTION 'Different Round 2 fixtures already exist; review manually';
 END IF;
 IF jsonb_array_length(existing)=0 THEN
  appended:=coalesce(previous->'FA CUP','[]'::jsonb);
  FOR pair IN SELECT value FROM jsonb_array_elements(rounds->'2') LOOP
   appended:=appended||jsonb_build_array(jsonb_build_object('round',2,'stage','Round Of 64','teamA',pair->>0,'teamB',pair->>1));
  END LOOP;
  INSERT INTO public.kv_store(key,value) VALUES('bilbbet2_cup_fixtures',jsonb_set(previous,'{FA CUP}',appended))
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 END IF;
 INSERT INTO bilbbet_private.settings(key,value) VALUES('confirmed_fa_cup_rounds',rounds)
 ON CONFLICT(key) DO UPDATE SET value=bilbbet_private.settings.value||excluded.value;
 source:=replace(pg_get_functiondef('bilbbet_private.place_with_controls(text,text,jsonb,integer,timestamp with time zone,boolean)'::regprocedure),chr(13),'');
 anchor:=$old$   IF partial AND parts[1]='H2H'
   AND NOT EXISTS ($old$;
 replacement:=$new$   IF partial AND parts[1]='H2H'
   AND NOT EXISTS (
    SELECT 1 FROM bilbbet_private.settings s,
    LATERAL jsonb_array_elements(coalesce(s.value->r::text,'[]'::jsonb)) pair
    WHERE s.key='confirmed_fa_cup_rounds' AND array_length(parts,1)=5
    AND ((pair->>0=parts[4] AND pair->>1=parts[5]) OR (pair->>0=parts[5] AND pair->>1=parts[4]))
   )
   AND NOT EXISTS ($new$;
 IF position('confirmed_fa_cup_rounds' in source)=0 THEN
  IF (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 THEN
   RAISE EXCEPTION 'Fixture guard differs; no changes applied';
  END IF;
  EXECUTE replace(source,anchor,replacement);
 END IF;
END $import$;
SELECT count(*) AS round_2_cup_fixtures
FROM public.kv_store k,LATERAL jsonb_array_elements(k.value->'FA CUP') f
WHERE k.key='bilbbet2_cup_fixtures' AND (f->>'round')::integer=2;
COMMIT;
