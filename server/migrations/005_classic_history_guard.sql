BEGIN;
-- Attribution-only metadata migrations must not duplicate an existing snapshot.
CREATE OR REPLACE FUNCTION capture_chunk_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.version IS DISTINCT FROM OLD.version THEN
    INSERT INTO chunk_history(world_id, chunk_x, chunk_y, version, zone, background_data, main_data, overlay_data, deleted_at, actor_id)
    VALUES(NEW.world_id, NEW.chunk_x, NEW.chunk_y, NEW.version, NEW.zone, NEW.background_data, NEW.main_data, NEW.overlay_data, NEW.deleted_at, NEW.updated_by);
  END IF;
  RETURN NEW;
END; $$;
-- Null attribution or gaps cannot prove that a legacy chunk had only one creator.
UPDATE chunks c SET owner_id=NULL,ownership_locked=true
WHERE c.deleted_at IS NULL AND c.owner_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM chunk_history h
  WHERE h.world_id=c.world_id AND h.chunk_x=c.chunk_x AND h.chunk_y=c.chunk_y
  GROUP BY h.world_id,h.chunk_x,h.chunk_y
  HAVING min(h.version)=1 AND max(h.version)=c.version
    AND count(*)=c.version AND count(h.actor_id)=count(*)
    AND count(DISTINCT h.actor_id)=1 AND bool_and(h.actor_id=c.owner_id)
);
COMMIT;
