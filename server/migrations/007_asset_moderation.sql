BEGIN;

ALTER TABLE repository_assets
  ADD COLUMN moderation_state text NOT NULL DEFAULT 'pending'
  CHECK (moderation_state IN ('pending', 'approved', 'rejected'));

CREATE INDEX repository_assets_review_queue_idx
  ON repository_assets (created_at)
  WHERE moderation_state = 'pending';

COMMIT;
