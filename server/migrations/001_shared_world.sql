BEGIN;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  auth_provider text NOT NULL,
  auth_subject text NOT NULL,
  display_name varchar(60) NOT NULL,
  avatar_url text,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'moderator', 'administrator')),
  publishing_suspended_until timestamptz,
  suspension_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE worlds (
  id uuid PRIMARY KEY,
  slug varchar(80) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  description varchar(500) NOT NULL DEFAULT '',
  coordinate_limit integer NOT NULL DEFAULT 1000000
    CHECK (coordinate_limit BETWEEN 128 AND 100000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope varchar(120) NOT NULL,
  operation_id uuid NOT NULL,
  request_sha256 char(64) NOT NULL,
  response_status smallint NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  PRIMARY KEY (actor_id, scope, operation_id)
);

CREATE INDEX idempotency_records_expiry_idx ON idempotency_records (expires_at);

CREATE TABLE regions (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  region_type text NOT NULL CHECK (region_type IN ('commons', 'gallery', 'event')),
  min_x integer NOT NULL,
  min_y integer NOT NULL,
  max_x integer NOT NULL,
  max_y integer NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  can_draw boolean NOT NULL,
  can_place_entities boolean NOT NULL,
  allowed_layers smallint[] NOT NULL DEFAULT ARRAY[0, 1, 2]::smallint[],
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_x <= max_x AND min_y <= max_y),
  CHECK (allowed_layers <@ ARRAY[0, 1, 2]::smallint[]),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

CREATE INDEX regions_world_priority_idx ON regions (world_id, priority DESC);
CREATE INDEX regions_world_bounds_idx ON regions (world_id, min_x, max_x, min_y, max_y);

CREATE TABLE assets (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL
    CHECK (status IN ('pending_upload', 'processing', 'ready', 'rejected', 'deleted')),
  declared_media_type text NOT NULL,
  verified_media_type text,
  original_file_name varchar(255) NOT NULL,
  original_storage_key text NOT NULL UNIQUE,
  processed_storage_key text UNIQUE,
  thumbnail_storage_key text UNIQUE,
  sha256 char(64),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 0 AND 8388608),
  width integer CHECK (width BETWEEN 1 AND 512),
  height integer CHECK (height BETWEEN 1 AND 512),
  frame_count integer CHECK (frame_count BETWEEN 1 AND 120),
  duration_ms integer CHECK (duration_ms BETWEEN 0 AND 12000),
  rejection_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  upload_expires_at timestamptz NOT NULL,
  ready_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX assets_owner_created_idx ON assets (owner_id, created_at DESC);
CREATE INDEX assets_cleanup_idx ON assets (status, upload_expires_at, deleted_at);

CREATE TABLE entities (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (
    entity_type IN (
      'creature',
      'structure',
      'sign',
      'hologram',
      'ambient_prop',
      'floating_object',
      'environmental_decoration',
      'gif_entity',
      'uploaded_custom'
    )
  ),
  name varchar(60) NOT NULL,
  description varchar(500) NOT NULL DEFAULT '',
  x integer NOT NULL,
  y integer NOT NULL,
  scale numeric(5, 2) NOT NULL CHECK (scale BETWEEN 0.20 AND 10.00),
  anchor text NOT NULL CHECK (anchor IN ('feet', 'center')),
  behavior text NOT NULL CHECK (
    behavior IN ('wander', 'stationary', 'follow_light', 'sleep', 'group', 'hide', 'float', 'sway')
  ),
  visual_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  moderation_state text NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible', 'hidden', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  restore_until timestamptz
);

CREATE INDEX entities_world_position_idx ON entities (world_id, x, y)
  WHERE deleted_at IS NULL AND moderation_state = 'visible';
CREATE INDEX entities_creator_created_idx ON entities (creator_id, created_at DESC);
CREATE INDEX entities_asset_idx ON entities (asset_id) WHERE asset_id IS NOT NULL;

CREATE TABLE chunks (
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  chunk_x integer NOT NULL,
  chunk_y integer NOT NULL,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  background_data bytea NOT NULL,
  main_data bytea NOT NULL,
  overlay_data bytea NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, chunk_x, chunk_y)
);

CREATE TABLE edit_operations (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  operation_kind text NOT NULL
    CHECK (operation_kind IN ('draw', 'erase', 'fill', 'undo', 'moderator_restore', 'legacy_import')),
  undo_of_operation_id uuid REFERENCES edit_operations(id) ON DELETE SET NULL,
  request_sha256 char(64) NOT NULL,
  affected_pixel_count integer NOT NULL CHECK (affected_pixel_count BETWEEN 0 AND 10000),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX edit_operations_world_time_idx ON edit_operations (world_id, accepted_at DESC);
CREATE INDEX edit_operations_actor_time_idx ON edit_operations (actor_id, accepted_at DESC);
CREATE INDEX edit_operations_expiry_idx ON edit_operations (expires_at);

CREATE TABLE edit_operation_chunks (
  operation_id uuid NOT NULL REFERENCES edit_operations(id) ON DELETE CASCADE,
  world_id uuid NOT NULL,
  chunk_x integer NOT NULL,
  chunk_y integer NOT NULL,
  previous_version bigint NOT NULL CHECK (previous_version >= 0),
  resulting_version bigint NOT NULL CHECK (resulting_version = previous_version + 1),
  affected_pixel_count integer NOT NULL CHECK (affected_pixel_count > 0),
  forward_patch bytea NOT NULL,
  inverse_patch bytea NOT NULL,
  PRIMARY KEY (operation_id, chunk_x, chunk_y),
  FOREIGN KEY (world_id, chunk_x, chunk_y)
    REFERENCES chunks(world_id, chunk_x, chunk_y)
    ON DELETE CASCADE
);

CREATE INDEX edit_operation_chunks_lookup_idx
  ON edit_operation_chunks (world_id, chunk_x, chunk_y, resulting_version DESC);

CREATE TABLE reports (
  id uuid PRIMARY KEY,
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('entity', 'region')),
  target_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  target_world_id uuid REFERENCES worlds(id) ON DELETE CASCADE,
  target_min_x integer,
  target_min_y integer,
  target_max_x integer,
  target_max_y integer,
  category text NOT NULL CHECK (
    category IN ('illegal', 'harassment', 'sexual_content', 'personal_information', 'spam', 'vandalism', 'other')
  ),
  explanation varchar(1000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (
    (target_type = 'entity' AND target_entity_id IS NOT NULL)
    OR
    (
      target_type = 'region'
      AND target_world_id IS NOT NULL
      AND target_min_x IS NOT NULL
      AND target_min_y IS NOT NULL
      AND target_max_x IS NOT NULL
      AND target_max_y IS NOT NULL
      AND target_min_x <= target_max_x
      AND target_min_y <= target_max_y
    )
  )
);

CREATE INDEX reports_queue_idx ON reports (status, created_at);
CREATE INDEX reports_reporter_idx ON reports (reporter_id, created_at DESC);

CREATE TABLE moderation_audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (
    action IN ('hide_entity', 'restore_entity', 'restore_region', 'suspend_publishing', 'reinstate_publishing')
  ),
  reason varchar(1000) NOT NULL,
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  target jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_audit_actor_time_idx
  ON moderation_audit_events (actor_id, created_at DESC);
CREATE INDEX moderation_audit_time_idx ON moderation_audit_events (created_at DESC);

CREATE TABLE member_limit_overrides (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  strokes_per_minute integer CHECK (strokes_per_minute > 0),
  pixels_per_day integer CHECK (pixels_per_day > 0),
  entities_per_day integer CHECK (entities_per_day > 0),
  active_entities integer CHECK (active_entities > 0),
  expires_at timestamptz,
  reason varchar(500) NOT NULL,
  granted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER worlds_set_updated_at
BEFORE UPDATE ON worlds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER regions_set_updated_at
BEFORE UPDATE ON regions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER entities_set_updated_at
BEFORE UPDATE ON entities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'moderation audit events are immutable';
END;
$$;

CREATE TRIGGER moderation_audit_no_update
BEFORE UPDATE OR DELETE ON moderation_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

INSERT INTO worlds (id, slug, name, description)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'forgotten-network',
  'Forgotten Network',
  'A living digital civilization.'
);

INSERT INTO regions (
  id,
  world_id,
  name,
  region_type,
  min_x,
  min_y,
  max_x,
  max_y,
  can_draw,
  can_place_entities,
  allowed_layers
)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'The Commons',
  'commons',
  -1000000,
  -1000000,
  1000000,
  1000000,
  true,
  true,
  ARRAY[0, 1, 2]::smallint[]
);

COMMIT;
