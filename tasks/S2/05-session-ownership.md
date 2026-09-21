# S2-02.1 — PageSession ownership

Status: DONE
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

- [x] Session хранит project/page/root/generation.
- [x] В одном root нет пересекающихся replay.
- [x] Повторный start не создаёт вторую session или overlay.
- [x] Lifecycle methods имеют описанную idempotent semantics.

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

Результат: публичный `PageSession` владеет scope, generation,
`AbortController`, serialized replay и cleanup registry. SDK `start` разделяет
один in-flight replay; `refresh`, `navigate`, `destroy` имеют идемпотентную
generation semantics. Добавлен journal cleanup hook для S2-03.

Проверено 2026-09-22: lifecycle unit fixtures, repeated/concurrent start,
start/destroy/start, полный workspace и Chromium lifecycle matrix 8/8.
