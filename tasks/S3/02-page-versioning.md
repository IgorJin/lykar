# S3-02 — Draft, release and independent Page versions

Status: DONE
Priority: P0
Depends on: S2
Evidence: report
Report group: S3-acceptance

## Goal

Complete the Admin-to-editor path for immutable releases and verify optimistic
revision behavior and independent versions across Pages.

## Acceptance criteria

- [x] An Admin Page opens its editor Draft; a saved edit survives into a release.
- [x] Publish returns a conflict for stale revision, refreshes Admin and permits
  a deliberate retry.
- [x] A second Page starts its own version sequence and can be published without
  changing the first Page's history.
- [x] Partial variant updates preserve omitted release/description fields;
  explicit `null` continues to clear nullable fields.

## Checks

- S3 browser acceptance and full browser regression suite.
- PostgreSQL-backed variant PATCH regression in `npm run test:e2e:http`.
- `npm test`, `npm run typecheck`.

## Evidence

See [S3 acceptance report](../../docs/verification/reports/S3/s3-acceptance.html).
