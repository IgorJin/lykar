-- Do not import legacy environments: existing sites remain native until an explicit Deploy.
ALTER TABLE releases ADD CONSTRAINT releases_page_id_id_key UNIQUE (page_id, id);

CREATE TABLE page_deployment_activations (
  id UUID PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES pages(id),
  revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  previous_release_id UUID,
  release_id UUID,
  action TEXT NOT NULL CHECK (action IN ('deploy', 'disable', 'rollback')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,160}$'),
  payload_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (page_id, revision),
  UNIQUE (page_id, actor_user_id, idempotency_key),
  FOREIGN KEY (page_id, release_id) REFERENCES releases(page_id, id),
  FOREIGN KEY (page_id, previous_release_id) REFERENCES releases(page_id, id),
  CHECK ((action = 'disable' AND release_id IS NULL)
      OR (action IN ('deploy', 'rollback') AND release_id IS NOT NULL))
);

-- The latest append-only activation IS the pointer: no separately mutable state can drift.
CREATE TRIGGER page_deployment_activations_are_immutable
BEFORE UPDATE OR DELETE ON page_deployment_activations
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
