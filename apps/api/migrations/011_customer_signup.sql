-- New challenges bind to an email; a user is created only on successful verification.
-- Existing unconsumed user-bound tokens continue to work after upgrade.
ALTER TABLE login_tokens ADD COLUMN email TEXT
  CHECK (email = lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
ALTER TABLE login_tokens ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE login_tokens ADD CONSTRAINT login_tokens_identity_present
  CHECK (user_id IS NOT NULL OR email IS NOT NULL);
