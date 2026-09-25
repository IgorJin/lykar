# S3-04 — Member screens and permission boundaries

Status: DONE
Priority: P0
Depends on: S3-01
Evidence: report
Report group: S3-acceptance

## Goal

Verify that the Members screen reflects the authenticated project role and that
member capabilities obey server-side ownership and permission invariants.

## Acceptance criteria

- [x] Admin exposes the Members screen and renders the project Owner row.
- [x] Invitation, role change, revoke and ownership transfer constraints pass
  PostgreSQL-backed membership integration checks.
- [x] A page-scoped share capability cannot cross the Page boundary.
- [x] Browser-visible visitor content has no editor capability or panel.

## Checks

- S3 browser acceptance.
- Membership PostgreSQL integration tests in `npm run test:e2e:http`.

## Evidence

See [S3 acceptance report](../../docs/verification/reports/S3/s3-acceptance.html).
