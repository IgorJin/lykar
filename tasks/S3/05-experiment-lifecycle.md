# S3-05 — A/B lifecycle and sticky assignment

Status: DONE
Priority: P0
Depends on: S3-02
Evidence: report
Report group: S3-acceptance

## Goal

Run a native control against an immutable-release treatment, preserve visitor
assignment across reloads and complete a winner without deployment side effects.

## Acceptance criteria

- [x] Admin creates and activates a two-variant experiment: A is native, B is a
  published release.
- [x] An A/B entry link resolves to either eligible variant.
- [x] A visitor keeps the same variant after reload.
- [x] Admin completes the experiment with B recorded as winner metadata.
- [x] The ordinary Page URL still renders the native source page.

## Checks

- S3 browser acceptance and API integration coverage for experiment lifecycle.
- `npm run test:e2e:browser`.

## Evidence

See [S3 acceptance report](../../docs/verification/reports/S3/s3-acceptance.html).
