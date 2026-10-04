BEGIN;

CREATE TABLE request_limits (bucket char(64) PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX request_limits_expiry ON request_limits (expires_at);
ALTER TABLE repository_entities ADD COLUMN hidden_at timestamptz;
ALTER TABLE repository_assets ADD COLUMN storage_key text;
ALTER TABLE repository_assets ALTER COLUMN media_data DROP NOT NULL;
ALTER TABLE repository_assets ADD COLUMN verified boolean NOT NULL DEFAULT false;
ALTER TABLE chunks ADD COLUMN deleted_at timestamptz;

CREATE TABLE chunk_history (
  id bigserial PRIMARY KEY, world_id uuid NOT NULL REFERENCES worlds(id),
  chunk_x integer NOT NULL, chunk_y integer NOT NULL, version bigint NOT NULL,
  zone varchar(40) NOT NULL, background_data bytea NOT NULL, main_data bytea NOT NULL,
  overlay_data bytea NOT NULL, deleted_at timestamptz, actor_id uuid REFERENCES users(id),
  captured_at timestamptz NOT NULL DEFAULT now(), UNIQUE(world_id, chunk_x, chunk_y, version)
);
CREATE INDEX chunk_history_lookup ON chunk_history(world_id, chunk_x, chunk_y, captured_at DESC);
INSERT INTO chunk_history(world_id, chunk_x, chunk_y, version, zone, background_data, main_data, overlay_data, deleted_at, actor_id)
SELECT world_id, chunk_x, chunk_y, version, zone, background_data, main_data, overlay_data, deleted_at, updated_by FROM chunks;
CREATE FUNCTION capture_chunk_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO chunk_history(world_id, chunk_x, chunk_y, version, zone, background_data, main_data, overlay_data, deleted_at, actor_id)
  VALUES(NEW.world_id, NEW.chunk_x, NEW.chunk_y, NEW.version, NEW.zone, NEW.background_data, NEW.main_data, NEW.overlay_data, NEW.deleted_at, NEW.updated_by);
  RETURN NEW;
END; $$;
CREATE TRIGGER chunks_history AFTER INSERT OR UPDATE ON chunks FOR EACH ROW EXECUTE FUNCTION capture_chunk_version();
CREATE TABLE entity_history (
  id bigserial PRIMARY KEY, world_id uuid NOT NULL REFERENCES worlds(id), entity_id varchar(120) NOT NULL,
  state jsonb NOT NULL, actor_id uuid REFERENCES users(id), captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE safety_reports (
  id uuid PRIMARY KEY, world_id uuid NOT NULL REFERENCES worlds(id), reporter_id uuid REFERENCES users(id),
  entity_id varchar(120), chunk_x integer, chunk_y integer, reason varchar(1000) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((entity_id IS NOT NULL) <> (chunk_x IS NOT NULL AND chunk_y IS NOT NULL))
);
CREATE TABLE safety_audit (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL,
  reason varchar(1000) NOT NULL, target jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER safety_audit_immutable BEFORE UPDATE OR DELETE ON safety_audit
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

COMMIT;
