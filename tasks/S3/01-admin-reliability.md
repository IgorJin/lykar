# S3-01 — Admin loading, errors and conflict recovery

Status: DONE
Priority: P0
Depends on: S2
Evidence: report
Report group: S3-acceptance

## Goal

Keep Admin usable while sessions, projects and page data load or fail, and make
revision conflicts actionable without losing the current selection.

## Acceptance criteria

- [x] Session and page loads have visible loading, error and retry states.
- [x] Older project/page responses cannot replace newly selected state.
- [x] Mutating actions disable duplicate submission and surface failures.
- [x] A stale publish refreshes server state and explains the revision conflict.
- [x] The browser acceptance retries successfully after the refreshed revision.

## Checks

- S3 browser acceptance: Members, Pages, publish conflict and retry.
- `npm run build`, `npm run typecheck`.

## Evidence

See [S3 acceptance report](../../docs/verification/reports/S3/s3-acceptance.html).
