-- Add controls for new miss-top futures only; retain authentication and existing placement rules.
DO $patch$
DECLARE source text; anchor text; replacement text;
BEGIN
 source:=replace(pg_get_functiondef('bilbbet_private.place_with_prices(text,text,jsonb,integer,timestamptz,boolean)'::regprocedure),chr(13),'');
 anchor:=$old$   IF q->>'exclusive' IS NOT NULL THEN$old$;
 replacement:=$new$   -- miss_top placement controls: correlated finishes and betting against own team.
   IF split_part(s->>'id','|',1)='FUT' AND split_part(s->>'id','|',3) LIKE '%miss_top%' THEN
    IF EXISTS (
     SELECT 1 FROM bilbbet_private.team_accounts a JOIN bilbbet_private.teams t ON t.id=a.team_id
     WHERE lower(a.username)=who AND lower(t.name)=lower(q->>'team')
    ) OR lower(q->>'team')=who THEN
     RAISE EXCEPTION 'You cannot back your own team to miss a finish target';
    END IF;
    IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(b->'selections') other
     JOIN bilbbet_private.quotes prior ON prior.id=other->>'id'
     WHERE other->>'id'<>s->>'id'
       AND prior.value->>'event'=q->>'event'
    ) THEN
     RAISE EXCEPTION 'Related finish bets on the same team must be placed as separate singles';
    END IF;
   END IF;

   IF q->>'exclusive' IS NOT NULL THEN$new$;
 IF position('miss_top placement controls' in source)=0 THEN
  IF (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 THEN
   RAISE EXCEPTION 'Placement function differs; no changes applied';
  END IF;
  EXECUTE replace(source,anchor,replacement);
 END IF;
END $patch$;
