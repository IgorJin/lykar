# S2-05.1 — Полный command workflow и Change Tree

Status: DONE
Priority: P1
Depends on: S2-04.4
Evidence: report
Report group: S2-editor-acceptance

## Goal

Связать UI с executor для всех поддержанных команд и сделать Change Tree главным
объяснением результата replay.

## Scope

- Text/style/attribute и structural add/remove/move/copy actions.
- Copy как безопасный `insertNode`.
- Ordered Change Tree с ID, target, status и reason.
- Dummy proposal validation/preview/explicit accept.
- Подключение единого session API для полного Style Manager S2-06.3/06.6:
  этот task не должен создавать конкурирующий style renderer или историю.

## Acceptance criteria

- [x] Все protocol kinds проходят preview → save → reload через UI.
- [x] Change Tree показывает ID, kind, target, applied/skipped/error и reason.
- [x] Replay continues after independent error.
- [x] Ambiguous, unsafe и dependency failure видны пользователю.
- [x] Proposal не применяется без explicit human confirmation.
- [x] Command contract поддерживает style adapter S2-06; прохождение setStyle
  через ручное property/value не считается приёмкой полноценного Style Manager.

## Checks

- `npm test`
- Editor component tests
- `npm run test:e2e:browser`

## Expected deliverables

- Integrated command UI и Change Tree.
- Command browser regression suite.

## Evidence and report

Report: `docs/verification/reports/S2/s2-editor-acceptance.html`

## Notes

Final acceptance 2026-09-23: editor unit and full Chromium browser suite cover command preview, Change Tree, explicit proposal acceptance, independent replay failures, save/reload and the shared style adapter. See the editor acceptance report.
