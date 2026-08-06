ALTER TABLE experiments
  ADD COLUMN winner_variant_key TEXT CHECK (winner_variant_key IN ('A', 'B'));

ALTER TABLE experiment_variants
  ADD COLUMN weight_bps INTEGER NOT NULL DEFAULT 5000
    CHECK (weight_bps BETWEEN 1 AND 9999);

ALTER TABLE experiment_variants
  ADD CONSTRAINT experiment_variants_experiment_id_id_key UNIQUE (experiment_id, id);

CREATE TABLE experiment_links (
  id UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_hint TEXT NOT NULL CHECK (char_length(token_hint) BETWEEN 4 AND 16),
  created_by UUID NOT NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX experiment_links_active_idx
  ON experiment_links(token_hash)
  WHERE revoked_at IS NULL;

CREATE TABLE experiment_assignments (
  id UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  first_exposed_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (experiment_id, visitor_hash),
  FOREIGN KEY (experiment_id, variant_id)
    REFERENCES experiment_variants(experiment_id, id) ON DELETE CASCADE
);

CREATE INDEX experiment_assignments_variant_idx
  ON experiment_assignments(variant_id);

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY,
  client_event_id UUID NOT NULL UNIQUE,
  assignment_id UUID NOT NULL REFERENCES experiment_assignments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('exposure', 'conversion')),
  event_name TEXT NOT NULL CHECK (char_length(event_name) BETWEEN 1 AND 120),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(properties) = 'object')
);

CREATE INDEX analytics_events_assignment_received_idx
  ON analytics_events(assignment_id, received_at DESC);
CREATE INDEX analytics_events_retention_idx ON analytics_events(received_at);
