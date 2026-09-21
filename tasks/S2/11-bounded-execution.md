# S2-03.4 — Bounded execution и protocol safety

Status: PLANNED
Priority: P0
Depends on: S2-03.3
Evidence: report
Report group: S2-replay-safety

## Goal

Ограничить размер и время replay, валидировать payload до mutation и защитить host
от unsafe commands и бесконечных observers/retries.

## Scope

- Manifest bytes, operation count/depth, replay work/time и retry limits.
- DOM read/write batching с сохранением dependency order.
- Root-scoped observer и игнорирование собственных/editor mutations.
- Unsafe HTML/URL/handlers/srcdoc/document-root removal.

## Acceptance criteria

- [ ] Invalid/unsafe payload отклоняется до DOM mutation.
- [ ] Limits завершают replay ограниченно и дают reason code.
- [ ] Batching не меняет порядок зависимых commands.
- [ ] Observer ограничен root и не создаёт self-triggered loop.
- [ ] Slow/oversized fixture не оставляет скрытую страницу.

## Checks

- `npm test`
- Oversized manifest and slow replay fixtures
- Unsafe payload unit tests
- Browser observer cleanup fixture

## Expected deliverables

- Numeric execution/retry limits.
- Safe bounded executor behavior and README notes.

## Evidence and report

Report: `docs/verification/reports/S2/s2-replay-safety.html`

## Notes

Численные limits сверяются с baseline S1-02.5.
