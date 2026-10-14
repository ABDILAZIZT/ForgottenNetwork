BEGIN;

CREATE TABLE safety_auto_hidden_entities (
  world_id uuid NOT NULL REFERENCES worlds(id),
  entity_id varchar(120) NOT NULL,
  report_count integer NOT NULL CHECK (report_count >= 3),
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, entity_id)
);

COMMIT;
