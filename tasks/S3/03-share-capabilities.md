# S3-03 — Share preview, scoped exchange and revoke

Status: DONE
Priority: P0
Depends on: S3-02
Evidence: report
Report group: S3-acceptance

## Goal

Let an owner preview a published release through a one-time share URL and let a
visitor read only the Page and release granted by that link.

## Acceptance criteria

- [x] Admin exposes the new share URL for copying, including when clipboard
  access is denied.
- [x] Share exchange rejects a mismatched Page and succeeds for the bound Page.
- [x] A separate visitor context renders the release without an editor panel.
- [x] The share capability cannot read the second Page's manifest.
- [x] Revoking the link makes its public share URL stop resolving.

## Checks

- S3 browser acceptance; API requests assert mismatch `401` and revoked URL `404`.
- Full `npm run test:e2e:browser` regression.

## Evidence

See [S3 acceptance report](../../docs/verification/reports/S3/s3-acceptance.html).
