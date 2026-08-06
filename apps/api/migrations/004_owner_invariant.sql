CREATE FUNCTION ensure_project_has_active_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_project_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_project_id := OLD.project_id;
  ELSE
    affected_project_id := NEW.project_id;
  END IF;

  IF EXISTS (SELECT 1 FROM projects WHERE id = affected_project_id)
     AND NOT EXISTS (
       SELECT 1 FROM project_memberships
       WHERE project_id = affected_project_id AND role = 'owner' AND revoked_at IS NULL
     ) THEN
    RAISE EXCEPTION 'project % must have exactly one active owner', affected_project_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER project_requires_active_owner
AFTER INSERT OR UPDATE OR DELETE ON project_memberships
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ensure_project_has_active_owner();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM projects p
    WHERE NOT EXISTS (
      SELECT 1 FROM project_memberships m
      WHERE m.project_id = p.id AND m.role = 'owner' AND m.revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'every existing project must have an active owner';
  END IF;
END;
$$;
