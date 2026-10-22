-- Already applied to BILBBET on 22 October 2026. Idempotent repair.
-- Retains admin authorization, quote validation and cash-out publication stamps.
DO $patch$
DECLARE
 src text;
 old text:='DELETE FROM bilbbet_private.quotes;';
 replacement text:='DELETE FROM bilbbet_private.quotes WHERE id IS NOT NULL;';
BEGIN
 src:=pg_get_functiondef('public.bilbbet_publish_board(jsonb)'::regprocedure);
 IF position(replacement in src)>0 THEN RETURN; END IF;
 IF (length(src)-length(replace(src,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'Publisher differs; no changes made';
 END IF;
 -- quotes.id is the primary key, so this preserves complete board replacement.
 EXECUTE replace(src,old,replacement);
END $patch$;
