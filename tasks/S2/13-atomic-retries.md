# S2-04.2 — Атомарная запись и retries

Status: DONE
Priority: P0
Depends on: S2-04.1
Evidence: report
Report group: S2-persistence-recovery

## Goal

Сохранить operations, revision и idempotency result одной транзакцией и сделать
повтор запроса детерминированным.

## Scope

- Capability/actor checks на каждом save/retry.
- Atomic operations + revision + idempotency result transaction.
- Same key/payload replay after commit.
- Different payload conflict и concurrent duplicate request.

## Acceptance criteria

- [x] Повтор same key/payload возвращает исходный result без второй operation.
- [x] Same key/different payload возвращает conflict.
- [x] Concurrent identical saves дают один effect.
- [x] Transaction failure не оставляет operations без result или наоборот.
- [x] Retry снова проверяет actor/project/draft capability.

## Checks

- `npm test`
- PostgreSQL transaction/concurrency tests
- HTTP authorization/conflict tests

## Expected deliverables

- Atomic save service/repository implementation.
- Retry/idempotency regression suite.

## Evidence and report

Report: `docs/verification/reports/S2/s2-persistence-recovery.html`

## Notes

Нельзя применять last-write-wins для stale expected revision.

Result: draft lock, operation append, revision update and saved result run in a
single transaction. PostgreSQL tests prove deterministic replay, concurrent
deduplication, rollback, stale-revision rejection and authorization recheck.
