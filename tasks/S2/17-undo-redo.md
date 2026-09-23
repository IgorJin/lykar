# S2-05.2 — Undo/redo и сохранённые изменения

Status: IN_PROGRESS
Priority: P1
Depends on: S2-05.1
Evidence: report
Report group: S2-editor-acceptance

## Goal

Связать local history с ledger/journal так, чтобы undo/redo и undo сохранённой
правки сохраняли корректную Draft semantics.

## Scope

- Pending undo/redo.
- Undo уже сохранённой operation как новая pending operation.
- Journal/ownership checks при compensation.
- Release immutability и повторный save/reload.

## Acceptance criteria

- [ ] Pending undo/redo меняет preview и history предсказуемо.
- [ ] Undo saved change создаёт новый operation ID и не удаляет старую operation.
- [ ] Старый Release/hash не изменяется.
- [ ] Более позднее host value не затирается при undo/cleanup.
- [ ] Undo → save → reload воспроизводит ожидаемое состояние.

## Checks

- `npm test`
- Editor history tests
- Browser undo/redo and save/reload fixture

## Expected deliverables

- Saved undo/redo implementation.
- History/recovery diagnostics.

## Evidence and report

Report: `docs/verification/reports/S2/s2-editor-acceptance.html`

## Notes

Arbitrary DOM restore через замену body запрещён.

Implementation 2026-09-22: pending undo/redo now uses compare-and-restore;
saved undo appends a fresh operation with `revision.reason=undo`, ownership
preconditions preserve later host values, and structural node references replay
after reload. Unit regressions pass; the authored browser save/reload fixture is
still awaiting an allowed local E2E run.
