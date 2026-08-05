CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  public_key TEXT NOT NULL UNIQUE CHECK (public_key LIKE 'pk_%'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_origins (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, origin)
);

CREATE TABLE releases (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  base_release_id UUID REFERENCES releases(id),
  manifest JSONB NOT NULL CHECK (jsonb_typeof(manifest) = 'array'),
  manifest_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);

CREATE TABLE drafts (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  base_release_id UUID REFERENCES releases(id),
  published_release_id UUID REFERENCES releases(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'published', 'abandoned')),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE operations (
  id UUID PRIMARY KEY,
  operation_id TEXT NOT NULL,
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  ordinal BIGINT NOT NULL CHECK (ordinal > 0),
  draft_revision BIGINT NOT NULL CHECK (draft_revision > 0),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id, operation_id),
  UNIQUE (draft_id, ordinal)
);

CREATE TABLE environments (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name ~ '^[a-z][a-z0-9-]{0,31}$'),
  active_release_id UUID REFERENCES releases(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE TABLE release_activations (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  previous_release_id UUID REFERENCES releases(id),
  release_id UUID NOT NULL REFERENCES releases(id),
  reason TEXT NOT NULL CHECK (reason IN ('publish', 'rollback')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX drafts_project_status_idx ON drafts(project_id, status);
CREATE INDEX operations_draft_ordinal_idx ON operations(draft_id, ordinal);
CREATE INDEX releases_project_created_idx ON releases(project_id, created_at DESC);
CREATE INDEX activations_environment_created_idx ON release_activations(environment_id, created_at DESC);

CREATE FUNCTION prevent_immutable_row_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER releases_are_immutable
BEFORE UPDATE OR DELETE ON releases
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();

CREATE TRIGGER operations_are_immutable
BEFORE UPDATE OR DELETE ON operations
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
