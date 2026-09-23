# S2-03.2 — Dependency-aware replay

Status: DONE
Priority: P0
Depends on: S2-03.1
Evidence: report
Report group: S2-replay-safety

## Goal

Обеспечить явные prerequisites между командами и не применять зависимую команду
к случайному fallback target после ошибки.

## Scope

- Dependency graph/order и prerequisite statuses.
- `DEPENDENCY_UNAVAILABLE` reason.
- Независимые operations after skip/error.
- Protocol version negotiation при добавлении serialized dependency fields.

## Acceptance criteria

- [x] Failed insertion/move выдаёт dependent operations `DEPENDENCY_UNAVAILABLE`.
- [x] Независимые operations продолжаются и имеют собственный result.
- [x] Fallback не выбирается молча для зависимой operation.
- [x] Изменение protocol dependency fields совместимо со старыми manifests.

## Checks

- `npm test`
- Dependency graph unit tests
- Partial chain browser fixture

## Expected deliverables

- Dependency-aware executor contract.
- Reason codes и compatibility fixtures.

## Evidence and report

Report: `docs/verification/reports/S2/s2-replay-safety.html`

## Notes

Replay сохраняет ordered semantics даже при независимых skip/error.

Результат: manifest validator запрещает unknown/forward/implicit dependencies,
а executor использует ordered outcomes. `nodeRef` не имеет selector fallback;
legacy manifests без новых optional fields продолжают проходить protocol v1.
