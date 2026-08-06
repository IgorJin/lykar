ALTER TABLE drafts ADD COLUMN source_snapshot JSONB;

ALTER TABLE releases DISABLE TRIGGER releases_are_immutable;
ALTER TABLE releases ADD COLUMN source_snapshot JSONB;
ALTER TABLE releases ENABLE TRIGGER releases_are_immutable;

DROP TABLE release_activations;
DROP TABLE environments;

CREATE TABLE experiments (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_by UUID NOT NULL REFERENCES users(id),
  activated_by UUID REFERENCES users(id),
  paused_by UUID REFERENCES users(id),
  completed_by UUID REFERENCES users(id),
  first_activated_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX experiments_one_active_per_page_idx
  ON experiments(page_id)
  WHERE status = 'active';
CREATE INDEX experiments_page_created_idx ON experiments(page_id, created_at DESC);

CREATE TABLE experiment_variants (
  id UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL CHECK (variant_key IN ('A', 'B')),
  release_id UUID REFERENCES releases(id),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (experiment_id, variant_key)
);

CREATE TABLE experiment_variant_links (
  id UUID PRIMARY KEY,
  variant_id UUID NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_hint TEXT NOT NULL CHECK (char_length(token_hint) BETWEEN 4 AND 16),
  created_by UUID NOT NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX experiment_variant_links_active_idx
  ON experiment_variant_links(token_hash)
  WHERE revoked_at IS NULL;
