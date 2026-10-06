# Deployment backend acceptance — 2026-10-03

[Group E2 report](../../deployment.html) records SERVICE-V1-03 only. SDK delivery
and Admin integration are still SERVICE-V1-04/05; document screenshots are HTML
layout QA, not application browser acceptance.

`api-postgres.json` contains the exact command and UTC timestamps. Its sanitized
log records the real migration CLI, all 31 API/unit/PostgreSQL tests with zero
skips, HTTP smoke and temporary database shutdown. `test-summary.json` enumerates
the cases. `api-build` is the preliminary build; the HTTP harness rebuilt final
tests, and `api-typecheck` passed afterward. `source.json` identifies the final
55 API/config files over the existing dirty working tree.

To reproduce, run `npm run test:e2e:http` from the monorepo root, preserving this
dated evidence and capturing the new run separately. The harness owns a temporary
PostgreSQL cluster; do not substitute a production database. Its tests include
isolated schemas for fresh install, upgrade with existing data, and transactional
failure/rollback. The schema tests reproduce per-file SQL/ledger transaction
semantics; they do not cover migration CLI advisory-lock contention.

API typecheck: `npm run typecheck --workspace lykar-lib-server`.
All shared builds/database runs were serialized. No external infrastructure,
provider, email delivery or deployment was created. Existing editor changes and
historical S0–S4 evidence were preserved. New operational budgets are still open.
