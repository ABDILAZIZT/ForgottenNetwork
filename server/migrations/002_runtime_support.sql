BEGIN;

ALTER TABLE chunks
  ADD COLUMN zone varchar(40) NOT NULL DEFAULT 'static';

CREATE TABLE repository_entities (
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  id varchar(120) NOT NULL,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (world_id, id)
);

CREATE INDEX repository_entities_world_visible_idx
  ON repository_entities (world_id, updated_at DESC)
  WHERE deleted_at IS NULL;

INSERT INTO users (id, auth_provider, auth_subject, display_name, role)
VALUES (
  '00000000-0000-4000-8000-000000000011',
  'system',
  'forgotten-network',
  'System',
  'administrator'
)
ON CONFLICT (auth_provider, auth_subject) DO NOTHING;

INSERT INTO repository_entities (world_id, id, creator_id, state)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'system_first_resident',
  '00000000-0000-4000-8000-000000000011',
  '{
    "id": "system_first_resident",
    "type": "wandering_creature",
    "wx": 0,
    "wy": 0,
    "color": "#00ffcc",
    "createdAt": 1788825600000,
    "behavior": "wander",
    "layers": [
      {"name": "body", "color": "#00ccaa", "scale": 1.2, "breathing": true},
      {"name": "head", "color": "#00ffcc", "offsetY": -12, "bobbing": true},
      {"name": "eyes", "color": "#000000", "offsetY": -14, "scale": 0.2}
    ],
    "vfx": {"glow": true}
  }'::jsonb
)
ON CONFLICT (world_id, id) DO NOTHING;

CREATE TABLE repository_assets (
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  id varchar(120) NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  media_type varchar(80) NOT NULL,
  media_data bytea NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, id)
);

CREATE TABLE user_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);

COMMIT;
