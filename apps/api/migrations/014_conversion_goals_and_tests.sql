ALTER TABLE experiments ADD COLUMN conversion_event_name TEXT
  CHECK (char_length(conversion_event_name) BETWEEN 1 AND 120 AND conversion_event_name NOT LIKE '$%');

CREATE TABLE analytics_conversion_totals (
  assignment_id UUID NOT NULL REFERENCES experiment_assignments(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  conversion_count BIGINT NOT NULL CHECK (conversion_count > 0),
  PRIMARY KEY (assignment_id, event_name)
);
INSERT INTO analytics_conversion_totals (assignment_id, event_name, conversion_count)
SELECT assignment_id, event_name, COUNT(*) FROM analytics_events
WHERE event_type = 'conversion' GROUP BY assignment_id, event_name;

CREATE TABLE analytics_tests (
  id UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  consent TEXT CHECK (consent IN ('pending', 'granted', 'denied')),
  event_received BOOLEAN NOT NULL DEFAULT FALSE,
  last_received_at TIMESTAMPTZ
);
CREATE TABLE analytics_test_events (
  client_event_id UUID PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES analytics_tests(id) ON DELETE CASCADE
);
