-- Only opaque bucket digests and safe delivery metadata belong in these tables.
-- Expired reservations are pruned per bucket by the store; retention jobs can
-- additionally use the expiry/creation indexes without holding request locks.
CREATE TABLE email_budget_reservations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket_key TEXT NOT NULL CHECK (length(bucket_key) BETWEEN 1 AND 256 AND bucket_key ~ '^[A-Za-z0-9_:-]+$'),
  reserved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > reserved_at)
);
CREATE INDEX email_budget_reservations_bucket_time_idx
  ON email_budget_reservations (bucket_key, reserved_at);
CREATE INDEX email_budget_reservations_expiry_idx
  ON email_budget_reservations (expires_at);

CREATE TABLE email_deliveries (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 256 AND id ~ '^[A-Za-z0-9_/-]+$'),
  kind TEXT NOT NULL CHECK (kind IN ('login', 'invitation')),
  provider_id TEXT CHECK (provider_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'unknown')),
  provider_message_id TEXT CHECK (provider_message_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  safe_code TEXT CHECK (safe_code ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  CHECK ((status = 'pending' AND finished_at IS NULL
    AND provider_message_id IS NULL AND safe_code IS NULL)
    OR (status <> 'pending' AND finished_at IS NOT NULL)),
  CHECK (updated_at >= created_at),
  CHECK (finished_at IS NULL OR finished_at >= created_at)
);
CREATE INDEX email_deliveries_created_idx ON email_deliveries (created_at);
CREATE INDEX email_deliveries_pending_idx ON email_deliveries (created_at)
  WHERE status = 'pending';
