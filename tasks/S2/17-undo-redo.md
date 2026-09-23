# S2-05.2 — Undo/redo и сохранённые изменения

Status: DONE
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

- [x] Pending undo/redo меняет preview и history предсказуемо.
- [x] Undo saved change создаёт новый operation ID и не удаляет старую operation.
- [x] Старый Release/hash не изменяется.
- [x] Более позднее host value не затирается при undo/cleanup.
- [x] Undo → save → reload воспроизводит ожидаемое состояние.

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

Final acceptance 2026-09-23: unit and browser persistence recovery cover pending and saved undo, revision append, ownership checks, reload and immutable release behavior. See the editor acceptance report.
