# S3-06 — Consent-gated analytics and winner metadata

Status: DONE
Priority: P0
Depends on: S3-05
Evidence: report
Report group: S3-acceptance

## Goal

Ensure analytics starts only after explicit consent and that the report matches
known visitor, view and conversion events without claiming statistical
significance or changing delivery.

## Acceptance criteria

- [x] Playground does not grant analytics consent by default.
- [x] Pending consent returns `CONSENT_REQUIRED`; denied consent returns
  `CONSENT_DENIED`; neither state adds report events.
- [x] Granted consent accepts an explicit conversion event.
- [x] Report visitors/views/conversions/CVR match the manual control events.
- [x] Winner selection is metadata; the plain URL remains native.

## Checks

- S3 browser acceptance; report begins at zero, then converges to the expected
  one visitor, one view and one conversion.
- `npm run test:e2e:http` and `npm test`.

## Evidence

See [S3 acceptance report](../../docs/verification/reports/S3/s3-acceptance.html).
