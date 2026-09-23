CREATE TABLE draft_save_requests (
  id UUID PRIMARY KEY,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (actor_user_id, project_id, draft_id, idempotency_key)
);

CREATE INDEX draft_save_requests_expiry_idx ON draft_save_requests (expires_at);
CREATE INDEX draft_save_requests_draft_created_idx ON draft_save_requests (draft_id, created_at DESC);

COMMENT ON TABLE draft_save_requests IS
  'Completed append results. Retain for at least 30 days; expired rows may only be removed after the draft is closed.';
COMMENT ON COLUMN draft_save_requests.payload_hash IS
  'SHA-256 of canonical expectedRevision, operations, and sourceSnapshot JSON.';
