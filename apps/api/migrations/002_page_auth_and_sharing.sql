CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_memberships (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (project_id, user_id)
);

CREATE UNIQUE INDEX project_one_active_member_mvp_idx
  ON project_memberships(project_id)
  WHERE revoked_at IS NULL;

CREATE TABLE login_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pages (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  pathname TEXT NOT NULL CHECK (pathname LIKE '/%' AND pathname NOT LIKE '%?%' AND pathname NOT LIKE '%#%'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, pathname)
);

INSERT INTO pages (id, project_id, name, pathname, created_at, updated_at)
SELECT md5(id::text || ':root-page')::uuid, id, 'Home', '/', created_at, updated_at
FROM projects;

ALTER TABLE releases DISABLE TRIGGER releases_are_immutable;
ALTER TABLE releases ADD COLUMN page_id UUID REFERENCES pages(id);
UPDATE releases r
SET page_id = p.id
FROM pages p
WHERE p.project_id = r.project_id AND p.pathname = '/';
ALTER TABLE releases ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE releases ENABLE TRIGGER releases_are_immutable;

ALTER TABLE drafts ADD COLUMN page_id UUID REFERENCES pages(id);
UPDATE drafts d
SET page_id = p.id
FROM pages p
WHERE p.project_id = d.project_id AND p.pathname = '/';
ALTER TABLE drafts ALTER COLUMN page_id SET NOT NULL;

ALTER TABLE environments ADD COLUMN page_id UUID REFERENCES pages(id);
UPDATE environments e
SET page_id = p.id
FROM pages p
WHERE p.project_id = e.project_id AND p.pathname = '/';
ALTER TABLE environments ALTER COLUMN page_id SET NOT NULL;

ALTER TABLE release_activations ADD COLUMN page_id UUID REFERENCES pages(id);
UPDATE release_activations a
SET page_id = p.id
FROM pages p
WHERE p.project_id = a.project_id AND p.pathname = '/';
ALTER TABLE release_activations ALTER COLUMN page_id SET NOT NULL;

ALTER TABLE releases DROP CONSTRAINT releases_project_id_version_key;
ALTER TABLE releases ADD CONSTRAINT releases_page_version_key UNIQUE (page_id, version);
ALTER TABLE environments DROP CONSTRAINT environments_project_id_name_key;
ALTER TABLE environments ADD CONSTRAINT environments_page_name_key UNIQUE (page_id, name);

DROP INDEX drafts_project_status_idx;
DROP INDEX releases_project_created_idx;
CREATE INDEX drafts_page_status_idx ON drafts(page_id, status);
CREATE INDEX releases_page_created_idx ON releases(page_id, created_at DESC);

CREATE TABLE editor_launch_codes (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE editor_sessions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE share_links (
  id UUID PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE share_exchange_codes (
  id UUID PRIMARY KEY,
  share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE share_sessions (
  id UUID PRIMARY KEY,
  share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX memberships_user_active_idx ON project_memberships(user_id, project_id) WHERE revoked_at IS NULL;
CREATE INDEX login_tokens_expiry_idx ON login_tokens(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX admin_sessions_user_active_idx ON admin_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX editor_sessions_token_active_idx ON editor_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX share_links_page_created_idx ON share_links(page_id, created_at DESC);
