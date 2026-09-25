# S3 — Admin, releases, sharing, experiments and reports

Status: DONE
Planning date: 2026-09-23
Completion date: 2026-09-23
Review fixes: 2026-09-25

S3 closes the owner path from Admin through page-scoped immutable releases and
share links to an A/B report. The browser acceptance checks the actual Admin,
editor, visitor and playground flows against the PostgreSQL-backed API. Scoped
capabilities are checked across pages; visitors never receive an editor panel.

## Task order

| ID | Title | Status | Depends on | Task |
| --- | --- | --- | --- | --- |
| S3-01 | Admin loading, errors and conflict recovery | DONE | S2 | [01](./01-admin-reliability.md) |
| S3-02 | Draft, release and independent Page versions | DONE | S2 | [02](./02-page-versioning.md) |
| S3-03 | Share preview, scoped exchange and revoke | DONE | S3-02 | [03](./03-share-capabilities.md) |
| S3-04 | Member screens and permission boundaries | DONE | S3-01 | [04](./04-members-and-permissions.md) |
| S3-05 | A/B lifecycle and sticky assignment | DONE | S3-02 | [05](./05-experiment-lifecycle.md) |
| S3-06 | Consent-gated analytics and winner metadata | DONE | S3-05 | [06](./06-analytics-report.md) |

## Definition of done

- Admin shows loading, empty, retryable error and action-conflict feedback; stale
  async responses cannot replace the selected project or Page.
- An editor publishes immutable releases; each Page has its own version
  sequence. A stale publish refreshes revision and can be retried.
- Share links preview a specific release, exchange a one-time code for a
  page-scoped read capability, expose no editor panel, and stop resolving after
  revoke. A capability for one Page cannot read another Page.
- The Members screen renders project membership and roles. PostgreSQL tests
  exercise invitation, role, revoke and owner invariants.
- Experiment A can stay native while B uses an immutable release. Link
  assignment persists through reload and completing a winner does not deploy it
  to the ordinary URL. New experiment and variant links keep opaque tokens in URL fragments;
  runtime sends variant capabilities in Authorization headers.
- Pending or denied consent records no exposure/conversion. Explicit consent
  enables the hand-entered conversion; report totals and CVR match those events.
  Revoked experiment links and completed experiments reject new events.
- Reports and task records describe the shipped contracts and limits.

## Checks

- `npx playwright test tests/e2e/s3-acceptance.spec.ts tests/e2e/s3-admin-recovery.spec.ts --project=chromium`
- `npm run test:e2e:browser` — 34 checks across Chromium, Firefox and WebKit
- `npm run test:e2e:http` — PostgreSQL-backed API tests and HTTP smoke
- `npm test`
- `npm run build`
- `npm run typecheck`
- `git diff --check`

## Evidence

The full acceptance and screenshots are in the [S3 report](../../docs/verification/reports/S3/s3-acceptance.html).

The browser fixture creates uniquely-scoped `/__e2e__/s3-*` Pages under the
seed project. The playground serves its existing Home or Pricing page shell for
those fixture paths so the acceptance does not alter either shared fixture.

## Scope that continues in later sprints

S3 does not configure a production email provider, automated retention/pruning
jobs, statistical-significance claims, or deployment/rollback. Production
operations remain in S5/S6. A completed experiment stores a winner as metadata;
deployment stays explicit.
