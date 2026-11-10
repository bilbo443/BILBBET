-- New admin-only RPC. Draw and group quotes commit together; other quote
-- books, accepted bets, accounts, carry corrections and balances are untouched.
CREATE OR REPLACE FUNCTION public.bilbbet_commit_ecl_draw(
 p_groups jsonb,p_quotes jsonb,p_field jsonb,p_expected_groups jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE current_groups jsonb; paused jsonb; g text; teams jsonb; q jsonb; f jsonb; ids text[]; total integer:=0; complete text[]:=ARRAY[]::text[];
BEGIN
 IF NOT bilbbet_private.is_admin() THEN RAISE EXCEPTION 'Administrator sign-in required'; END IF;
 IF jsonb_typeof(p_groups) IS DISTINCT FROM 'object' OR jsonb_typeof(p_quotes) IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_field) IS DISTINCT FROM 'array' OR jsonb_array_length(p_field)<>12
 OR (SELECT count(*) FROM jsonb_object_keys(p_groups))<>3 OR NOT p_groups ?& ARRAY['A','B','C'] THEN
  RAISE EXCEPTION 'Invalid ECL draw';
 END IF;
 SELECT array_agg(x->>'id' ORDER BY x->>'id') INTO ids FROM jsonb_array_elements(p_field) x;
 IF ids IS DISTINCT FROM ARRAY['002','020','021','022','026','030','041','050','056','069','075','085']
 OR (SELECT count(DISTINCT x->>'name') FROM jsonb_array_elements(p_field) x)<>12
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_field) x WHERE coalesce(x->>'name','')='' OR position('|' IN x->>'name')>0) THEN
  RAISE EXCEPTION 'ECL field must contain the 12 confirmed team IDs';
 END IF;
 FOREACH g IN ARRAY ARRAY['A','B','C'] LOOP
  teams:=p_groups->g;
  IF jsonb_typeof(teams) IS DISTINCT FROM 'array' OR jsonb_array_length(teams)>4
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(teams) t WHERE jsonb_typeof(t) NOT IN ('string','null'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(teams) t WHERE t IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_field) x WHERE x->>'name'=t)) THEN RAISE EXCEPTION 'Invalid ECL group'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_field) x WHERE teams ? (x->>'name') AND x->>'id'=ANY(ARRAY['075','069','085']))>1
  OR (SELECT count(*) FROM jsonb_array_elements(p_field) x WHERE teams ? (x->>'name') AND x->>'id'<>ALL(ARRAY['075','069','085']))>3 THEN
   RAISE EXCEPTION 'Each group needs one Pot 1 and three Pot 2 teams';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(teams) WITH ORDINALITY t(name,slot) JOIN jsonb_array_elements(p_field) x ON x->>'name'=t.name WHERE (slot=1) IS DISTINCT FROM (x->>'id'=ANY(ARRAY['075','069','085']))) THEN RAISE EXCEPTION 'Incorrect draw slot for pot'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements_text(teams) t WHERE t IS NOT NULL)=4 THEN complete:=array_append(complete,g); END IF;
  total:=total+(SELECT count(*) FROM jsonb_array_elements_text(teams) t WHERE t IS NOT NULL);
 END LOOP;
 IF (SELECT count(DISTINCT t) FROM jsonb_each(p_groups) e CROSS JOIN LATERAL jsonb_array_elements_text(e.value) t)<>total THEN RAISE EXCEPTION 'Duplicate ECL entrant'; END IF;
 IF jsonb_array_length(p_quotes)<>4*cardinality(complete)
 OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_quotes) x)<>jsonb_array_length(p_quotes) THEN RAISE EXCEPTION 'Each completed group needs four unique prices'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p_quotes) LOOP
  g:=split_part(q->>'id','|',2);
  IF NOT g=ANY(complete) OR split_part(q->>'id','|',1)<>'ECLGROUP'
  OR NOT (p_groups->g) ? split_part(q->>'id','|',3)
  OR cardinality(string_to_array(q->>'id','|'))<>3
  OR jsonb_typeof(q->'prices') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'prices')<>1
  OR jsonb_typeof(q->'prices'->0) IS DISTINCT FROM 'number'
  OR (q->'prices'->>0)::numeric<=1 OR (q->'prices'->>0)::numeric>1001
  OR (q->>'type') IS DISTINCT FROM 'ECLGROUP' OR (q->>'category') IS DISTINCT FROM ('ECLGROUP|'||g)
  OR (q->>'safetyGroup') IS DISTINCT FROM ('ECLGROUP|'||g) OR (q->>'safetySize') IS DISTINCT FROM '4'
  OR (q->>'safetyOutcome') IS DISTINCT FROM split_part(q->>'id','|',3)
  OR (q->'odds') IS DISTINCT FROM (q->'prices'->0) THEN RAISE EXCEPTION 'Invalid ECL group price'; END IF;
 END LOOP;
 PERFORM bilbbet_private.assert_quote_books(p_quotes);
 PERFORM pg_advisory_xact_lock(hashtext('bilbbet-live-ecl-draw'));
 SELECT value INTO current_groups FROM public.kv_store WHERE key='bilbbet2_ecl_groups' FOR UPDATE;
 current_groups:=coalesce(current_groups,'{"A":[],"B":[],"C":[]}'::jsonb);
 IF current_groups IS DISTINCT FROM p_expected_groups THEN RAISE EXCEPTION 'Draw changed in another session. Refresh before committing.'; END IF;
 SELECT value INTO paused FROM public.kv_store WHERE key='bilbbet2_paused_categories' FOR UPDATE;
 paused:=coalesce(paused,'{}'::jsonb);
 IF p_groups IS DISTINCT FROM current_groups THEN
  paused:=paused||'{"ECL|reach_knockout_pct":true,"ECL|reach_sf_pct":true,"ECL|reach_final_pct":true,"ECL|win_pct":true}'::jsonb;
 END IF;
 FOREACH g IN ARRAY ARRAY['A','B','C'] LOOP paused:=jsonb_set(paused,ARRAY['ECLGROUP|'||g],to_jsonb(NOT g=ANY(complete))); END LOOP;
 DELETE FROM bilbbet_private.quotes WHERE id LIKE 'ECLGROUP|%';
 INSERT INTO bilbbet_private.quotes SELECT x->>'id',x FROM jsonb_array_elements(p_quotes) x;
 INSERT INTO public.kv_store(key,value) VALUES('bilbbet2_ecl_groups',p_groups),('bilbbet2_paused_categories',paused)
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 INSERT INTO bilbbet_private.settings(key,value) VALUES('ecl_draw_snapshot',jsonb_build_object('groups',p_groups,'field',p_field,'published_at',clock_timestamp()))
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 RETURN jsonb_build_object('groups',p_groups,'published_groups',to_jsonb(complete),'quotes',jsonb_array_length(p_quotes));
END $function$;
REVOKE ALL ON FUNCTION public.bilbbet_commit_ecl_draw(jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_commit_ecl_draw(jsonb,jsonb,jsonb,jsonb) TO anon,authenticated;

-- Bounded public draw snapshot: at most 12 group quotes, without fetching
-- the full season price board on every live-draw poll.
CREATE OR REPLACE FUNCTION public.bilbbet_ecl_draw_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $view$
 SELECT jsonb_build_object(
  'groups',coalesce((SELECT value FROM public.kv_store WHERE key='bilbbet2_ecl_groups'),'{"A":[],"B":[],"C":[]}'::jsonb),
  'paused_categories',coalesce((SELECT value FROM public.kv_store WHERE key='bilbbet2_paused_categories'),'{}'::jsonb),
  'fixtures',coalesce((SELECT value->'ECL' FROM public.kv_store WHERE key='bilbbet2_cup_fixtures'),'[]'::jsonb),
  'quotes',coalesce((SELECT jsonb_agg(value ORDER BY id) FROM bilbbet_private.quotes WHERE id LIKE 'ECLGROUP|%'),'[]'::jsonb)
 );
$view$;
REVOKE ALL ON FUNCTION public.bilbbet_ecl_draw_view() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bilbbet_ecl_draw_view() TO anon,authenticated;
