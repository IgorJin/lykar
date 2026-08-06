ALTER TABLE experiment_assignments
  ADD COLUMN exposure_count BIGINT NOT NULL DEFAULT 0 CHECK (exposure_count >= 0),
  ADD COLUMN conversion_count BIGINT NOT NULL DEFAULT 0 CHECK (conversion_count >= 0),
  ADD COLUMN first_converted_at TIMESTAMPTZ;

UPDATE experiment_assignments assignment
SET exposure_count = totals.exposure_count,
    conversion_count = totals.conversion_count,
    first_converted_at = totals.first_converted_at
FROM (
  SELECT assignment_id,
         COUNT(*) FILTER (WHERE event_type = 'exposure') AS exposure_count,
         COUNT(*) FILTER (WHERE event_type = 'conversion') AS conversion_count,
         MIN(occurred_at) FILTER (WHERE event_type = 'conversion') AS first_converted_at
  FROM analytics_events
  GROUP BY assignment_id
) totals
WHERE totals.assignment_id = assignment.id;
