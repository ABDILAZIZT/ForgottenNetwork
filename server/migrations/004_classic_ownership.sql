BEGIN;
ALTER TABLE chunks ADD COLUMN owner_id uuid REFERENCES users(id);
ALTER TABLE chunks ADD COLUMN ownership_locked boolean NOT NULL DEFAULT false;
-- Historic snapshots cannot prove per-pixel attribution. Only single-author,
-- complete history can safely inherit ownership. Ambiguous chunks stay visible.
UPDATE chunks c SET owner_id=c.updated_by
WHERE c.updated_by IS NOT NULL AND EXISTS (
  SELECT 1 FROM chunk_history h
  WHERE h.world_id=c.world_id AND h.chunk_x=c.chunk_x AND h.chunk_y=c.chunk_y
  GROUP BY h.world_id,h.chunk_x,h.chunk_y
  HAVING min(h.version)=1 AND count(DISTINCT h.actor_id)=1
    AND bool_and(h.actor_id=c.updated_by)
);
UPDATE chunks SET ownership_locked=true WHERE owner_id IS NULL AND deleted_at IS NULL;
COMMIT;
