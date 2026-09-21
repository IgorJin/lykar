# S2-02.1 — PageSession ownership

Status: PLANNED
Priority: P0
Depends on: S2-01.4
Evidence: report
Report group: S2-target-lifecycle

## Goal

Создать PageSession, которая владеет project/page/root, generation и очередью replay.

## Scope

- Session state and `AbortController`.
- Public `start/navigate/refresh/destroy` wiring.
- Serialized replay per root.
- Concurrent start protection.

## Acceptance criteria

- [ ] Session хранит project/page/root/generation.
- [ ] В одном root нет пересекающихся replay.
- [ ] Повторный start не создаёт вторую session или overlay.
- [ ] Lifecycle methods имеют описанную idempotent semantics.

## Checks

- `npm test`
- Lifecycle unit tests
- Public SDK repeated start fixture

## Expected deliverables

- PageSession core и lifecycle adapter.
- Session ownership contract для executor/editor.

## Evidence and report

Report: `docs/verification/reports/S2/s2-target-lifecycle.html`

## Notes

Компенсация partial DOM changes подключается в S2-03.
