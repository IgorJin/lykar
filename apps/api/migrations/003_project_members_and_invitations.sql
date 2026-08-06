DROP INDEX project_one_active_member_mvp_idx;

ALTER TABLE project_memberships DROP CONSTRAINT project_memberships_role_check;
ALTER TABLE project_memberships
  ADD CONSTRAINT project_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer'));
ALTER TABLE project_memberships
  ADD COLUMN invited_by UUID REFERENCES users(id),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX project_one_active_owner_idx
  ON project_memberships(project_id)
  WHERE role = 'owner' AND revoked_at IS NULL;

CREATE TABLE project_invitations (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (email = lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_by UUID NOT NULL REFERENCES users(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((accepted_at IS NULL AND accepted_by IS NULL) OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL))
);

CREATE UNIQUE INDEX project_one_pending_invitation_idx
  ON project_invitations(project_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX project_invitations_token_active_idx
  ON project_invitations(token_hash, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE projects ADD COLUMN created_by UUID REFERENCES users(id);
ALTER TABLE pages ADD COLUMN created_by UUID REFERENCES users(id);
ALTER TABLE drafts ADD COLUMN created_by UUID REFERENCES users(id);
ALTER TABLE operations ADD COLUMN created_by UUID REFERENCES users(id);
ALTER TABLE releases ADD COLUMN published_by UUID REFERENCES users(id);
ALTER TABLE release_activations ADD COLUMN created_by UUID REFERENCES users(id);

UPDATE projects p
SET created_by = owner.user_id
FROM project_memberships owner
WHERE owner.project_id = p.id AND owner.role = 'owner' AND owner.revoked_at IS NULL;

UPDATE pages pg
SET created_by = p.created_by
FROM projects p
WHERE p.id = pg.project_id;

UPDATE drafts d
SET created_by = p.created_by
FROM projects p
WHERE p.id = d.project_id;

UPDATE release_activations a
SET created_by = p.created_by
FROM projects p
WHERE p.id = a.project_id;
