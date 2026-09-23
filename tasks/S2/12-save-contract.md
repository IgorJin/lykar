# S2-04.1 — Save contract и idempotency storage

Status: DONE
Priority: P0
Depends on: S2-03.4
Evidence: report
Report group: S2-persistence-recovery

## Goal

Определить серверный контракт сохранения Draft с idempotency key, payload hash,
expected revision и сохранённым result.

## Scope

- `apps/api/src/domain/versioning.ts`, repository/routes и forward migration.
- Actor/project/draft scoped idempotency key.
- Canonical payload hash и result retention/recovery policy.
- Constraints без переписывания старых migrations.

## Acceptance criteria

- [x] Key scope включает actor, project и draft.
- [x] Payload hash и expected revision входят в проверяемый save contract.
- [x] Retention/expiry persisted result документированы.
- [x] Migration forward-only и сохраняет старые данные.
- [x] Contract различает повтор того же payload и key с другим payload.

## Checks

- `npm test`
- API/domain contract tests
- PostgreSQL migration check

## Expected deliverables

- Save/idempotency schema and types.
- Forward migration and API contract notes.

## Evidence and report

Report: `docs/verification/reports/S2/s2-persistence-recovery.html`

## Notes

Атомарная реализация транзакции выполняется в S2-04.2.

Result: migration `009_draft_save_idempotency.sql`, canonical SHA-256 contract,
scoped unique key and persisted 30-day result retention are implemented and
covered by domain/PostgreSQL tests.
