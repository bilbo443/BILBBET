CREATE OR REPLACE FUNCTION bilbbet_private.assert_quote_books(p_quotes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO pg_catalog AS $fn$
BEGIN
 IF EXISTS (
  WITH raw AS (
   SELECT value q,string_to_array(value->>'id','|') p,
    (SELECT max(x::numeric) FROM jsonb_array_elements_text(value->'prices') x) odds
   FROM jsonb_array_elements(p_quotes)
   WHERE coalesce((value->>'bettable')::boolean,true)
  ), keyed AS (
   SELECT odds,
    CASE WHEN p[1]='H2H' AND p[2] LIKE 'res-%' THEN 'MATCH|'||p[3]||'|'||least(p[4],p[5])||'|'||greatest(p[4],p[5])
         WHEN p[1]='H2H' AND p[2] LIKE 'hcap-%' THEN 'HCAP|'||p[3]||'|'||p[4]||'|'||p[5]
         WHEN p[1]='FUT' AND p[3] ~ '^(roddy_)?(miss_)?top(3|5|10|_half)_pct$' THEN 'FINISH|'||p[2]||'|'||replace(p[3],'miss_top','top')||'|'||p[4]
         ELSE q->>'safetyGroup' END book,
    CASE WHEN p[1]='H2H' AND p[2]='res-a' THEN p[4]
         WHEN p[1]='H2H' AND p[2]='res-b' THEN p[5]
         WHEN p[1]='H2H' AND p[2]='res-draw' THEN 'DRAW'
         WHEN p[1]='H2H' AND p[2] LIKE 'hcap-%' THEN split_part(p[2],'-',2)
         WHEN p[1]='FUT' AND p[3] ~ '^(roddy_)?(miss_)?top(3|5|10|_half)_pct$' THEN CASE WHEN p[3] LIKE '%miss_top%' THEN 'miss' ELSE 'top' END
         ELSE q->>'safetyOutcome' END outcome,
    CASE WHEN p[1]='H2H' AND p[2] LIKE 'res-%' THEN 3
         WHEN p[1]='H2H' AND p[2] LIKE 'hcap-%' THEN 2
         WHEN p[1]='FUT' AND p[3] ~ '^(roddy_)?(miss_)?top(3|5|10|_half)_pct$' THEN 2
         ELSE (q->>'safetySize')::integer END expected
   FROM raw
  ), outcomes AS (SELECT book,outcome,max(odds) odds,max(expected) expected FROM keyed WHERE book IS NOT NULL GROUP BY 1,2)
  SELECT 1 FROM outcomes GROUP BY book HAVING count(*)=max(expected) AND sum(1/odds)<1
 ) THEN RAISE EXCEPTION 'Price board rejected: covering all outcomes would guarantee profit'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION bilbbet_private.assert_quote_books(jsonb) FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE source text; anchor text;
BEGIN
 source:=replace(pg_get_functiondef('public.bilbbet_publish_board(jsonb)'::regprocedure),chr(13),'');
 anchor:=' DELETE FROM bilbbet_private.quotes WHERE id IS NOT NULL;';
 IF position('bilbbet_private.assert_quote_books(p_quotes)' in source)=0 THEN
  IF (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Publisher differs; no changes applied'; END IF;
  EXECUTE replace(source,anchor,' PERFORM bilbbet_private.assert_quote_books(p_quotes);'||chr(10)||chr(10)||anchor);
 END IF;
END $patch$;
