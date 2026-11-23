-- Worker-only write path. The public browser cannot supply result payloads to it.
CREATE OR REPLACE FUNCTION public.bilbbet_apply_published_scores(p_league jsonb, p_dates jsonb, p_fingerprint text, p_fixtures jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE ctx jsonb; result_fixtures jsonb; projected jsonb:='[]'; item jsonb; schedule jsonb; dates jsonb; finished integer:=0;
 existing integer:=0; expected integer; teams integer; total integer; r integer; n integer; amount jsonb; rec record;
BEGIN
 IF jsonb_typeof(p_fixtures) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Published official fixtures missing'; END IF;
 IF jsonb_typeof(p_league) IS DISTINCT FROM 'object' OR length(p_fingerprint)<>64 THEN RAISE EXCEPTION 'Invalid source snapshot'; END IF;
 SELECT value INTO dates FROM bilbbet_private.settings WHERE key='round_dates';
 SELECT value INTO schedule FROM bilbbet_private.settings WHERE key='round_results_schedule';
 IF dates IS DISTINCT FROM p_dates THEN RAISE EXCEPTION 'Published and server calendars differ'; END IF;
 SELECT value INTO ctx FROM bilbbet_private.settings WHERE key='reward_context' FOR UPDATE;
 IF jsonb_typeof(ctx->'fixtures') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Fixture context missing'; END IF;
 SELECT count(*) INTO teams FROM jsonb_object_keys(p_league);
 IF teams<>66 THEN RAISE EXCEPTION 'Expected the confirmed 66-team score field'; END IF;
 FOR rec IN SELECT key,value FROM jsonb_each(p_league) LOOP
  IF jsonb_typeof(rec.value) IS DISTINCT FROM 'array' OR jsonb_array_length(rec.value)<>26 THEN RAISE EXCEPTION 'Invalid score array'; END IF;
  FOR amount IN SELECT value FROM jsonb_array_elements(rec.value) LOOP
   IF amount<>'null'::jsonb AND (jsonb_typeof(amount)<>'number' OR (amount::text)::numeric NOT BETWEEN 0 AND 200 OR trunc((amount::text)::numeric)<>(amount::text)::numeric) THEN RAISE EXCEPTION 'Invalid score'; END IF;
  END LOOP;
 END LOOP;
 SELECT count(*) INTO teams FROM (SELECT DISTINCT t FROM (
  SELECT f->>'a' t FROM jsonb_array_elements(ctx->'fixtures') f WHERE f->>'section' IN('ELIZA','DIV2','DIV3') AND NOT coalesce((f->>'median')::boolean,false)
  UNION ALL SELECT f->>'b' FROM jsonb_array_elements(ctx->'fixtures') f WHERE f->>'section' IN('ELIZA','DIV2','DIV3') AND NOT coalesce((f->>'median')::boolean,false)
 ) names WHERE t<>'AVERAGE TEAM') field;
 IF teams<>66 THEN RAISE EXCEPTION 'Server fixture field is incomplete'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_fixtures) LOOP
  IF item->>'section' IN('ELIZA','DIV2','DIV3') THEN
   IF NOT(p_league ? (item->>'a')) OR NOT(p_league ? (item->>'b')) THEN RAISE EXCEPTION 'Fixture identity differs from publication'; END IF;
   r:=(item->>'round')::integer;
   IF r NOT BETWEEN 1 AND 26 THEN RAISE EXCEPTION 'Invalid fixture round'; END IF;
   item:=item||jsonb_build_object('sa',p_league->(item->>'a')->(r-1),'sb',p_league->(item->>'b')->(r-1));
  END IF;
  projected:=projected||jsonb_build_array(item);
 END LOOP;
 FOR r IN 1..26 LOOP
  IF (schedule->'rounds'->r::text->>'last_fixture_date')::date>(now() AT TIME ZONE 'Australia/Sydney')::date THEN CONTINUE; END IF;
  SELECT count(*),count(*) FILTER(WHERE jsonb_typeof(f->'sa')='number' AND jsonb_typeof(f->'sb')='number') INTO total,n
   FROM jsonb_array_elements(projected) f WHERE (f->>'round')::integer=r AND f->>'section' IN('ELIZA','DIV2','DIV3') AND NOT coalesce((f->>'median')::boolean,false);
  SELECT coalesce(sum(value::integer),0) INTO expected FROM jsonb_each_text(schedule->'rounds'->r::text->'expected_league_fixtures');
  IF expected=0 OR total<>expected OR n<>total THEN EXIT; END IF;
  -- No missing earlier league week can be jumped over.
  finished:=r;
 END LOOP;
 SELECT coalesce((value->>'round')::integer,0) INTO existing FROM bilbbet_private.settings WHERE key='confirmed_finalised_round' AND dates->>(value->>'round')=value->>'round_date';
 existing:=coalesce(existing,0);
 IF finished<existing THEN RETURN jsonb_build_object('status','stale_publication','current_round',bilbbet_private.current_round(),'finalised_round',existing); END IF;
 IF finished=0 THEN RETURN jsonb_build_object('status','no_completed_round','current_round',bilbbet_private.current_round()); END IF;
 -- Preserve the same validated official fixtures for betting eligibility.
 INSERT INTO bilbbet_private.settings(key,value) VALUES('confirmed_division_fixtures',p_fixtures)
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 -- Write only completed league rounds; all unrelated context fields/fixtures remain unchanged.
 SELECT jsonb_agg(CASE WHEN (old->>'round')::integer<=finished AND old->>'section' IN('ELIZA','DIV2','DIV3') AND NOT coalesce((old->>'median')::boolean,false)
  THEN old||jsonb_build_object('sa',p_league->(old->>'a')->((old->>'round')::integer-1),'sb',p_league->(old->>'b')->((old->>'round')::integer-1)) ELSE old END ORDER BY ordinal)
 INTO projected FROM jsonb_array_elements(ctx->'fixtures') WITH ORDINALITY AS entry(old,ordinal);
 UPDATE bilbbet_private.settings SET value=jsonb_set(ctx,'{fixtures}',projected) WHERE key='reward_context';
 INSERT INTO bilbbet_private.settings(key,value) VALUES('confirmed_finalised_round',jsonb_build_object('round',finished,'round_date',dates->>finished::text,'reason','Validated published main-branch scores and complete futures snapshot','fingerprint',p_fingerprint)) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 INSERT INTO bilbbet_private.settings(key,value) VALUES('published_result_sync',jsonb_build_object('checked_at',now(),'finalised_round',finished,'fingerprint',p_fingerprint)) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 RETURN jsonb_build_object('status','synced','finalised_round',finished,'current_round',bilbbet_private.current_round());
END $function$
;
REVOKE ALL ON FUNCTION public.bilbbet_apply_published_scores(jsonb,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bilbbet_apply_published_scores(jsonb,jsonb,text,jsonb) TO service_role;
