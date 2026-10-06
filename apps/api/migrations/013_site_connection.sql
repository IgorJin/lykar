-- Existing origins are not implicitly verified or assigned a new proof.
ALTER TABLE project_origins ADD COLUMN verification_method TEXT
  CHECK (verification_method IN ('dns-txt', 'local-development'));
CREATE TABLE origin_verification_challenges (
  id UUID PRIMARY KEY,
  origin_id UUID NOT NULL REFERENCES project_origins(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  checked_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX origin_verification_origin_idx ON origin_verification_challenges(origin_id);
CREATE TABLE site_connection_probes (
  id UUID PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  origin_id UUID NOT NULL REFERENCES project_origins(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  code TEXT,
  report JSONB,
  CHECK (expires_at > created_at),
  CHECK (report IS NULL OR jsonb_typeof(report) = 'object')
);
CREATE INDEX site_connection_latest_idx ON site_connection_probes(page_id, origin_id, created_at DESC);
