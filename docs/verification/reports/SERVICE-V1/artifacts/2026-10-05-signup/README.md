# SERVICE-V1-06 evidence — 2026-10-05

Final checks: 36/36 API/PostgreSQL tests (no skipped), real HTTP smoke, 18/18 browser tests
(6 each Chromium/Firefox/WebKit, no retries), full monorepo typecheck.
`api-http` builds the Admin, SDK and API and migrates a fresh temporary PostgreSQL.
The dedicated signup migration test installs 001–010 first, seeds a legacy user/token/session,
checks rollback of 011, then verifies preserved legacy access and new signup.

`run-check.py` records exact commands, exit codes and timings. Logs redact token query values
and share credentials. Raw test email capture files, cookies and traces are not copied here.
`source.json` identifies the final source/config snapshot, including preexisting working changes.
Screenshots are actual browser captures; mobile empty and invalid-link states visually inspected.

Earlier attempts: one sandbox loopback restriction (rerun with authorized local test access),
a TypeScript target mismatch in new test code (`Array.at`, fixed), then 15/18 browser cases passed
and 3 failed due to invalid fault injection (`unroute` before `fulfill`). The final test uses
`times:1`; all 18 cases passed. The compact first browser result is retained separately.

Limits/provider routing prototype was removed on the user's instruction. Its future requirements
are in task 07. No real provider credentials, external emails, deployment or production migration
were used. Full external onboarding (07–09) remains open.
