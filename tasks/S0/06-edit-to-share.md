# S0-06 — Edit to share flow

Status: DONE
Priority: P0
Depends on: S0-05

## Goal

Подтвердить полный static flow: выбрать элемент, изменить текст, сохранить Draft,
перезагрузить, создать Release и открыть share в отдельном visitor context.

## Scope

- Editor UI action and backend save.
- Reload/reopen recovery.
- Release/share and native visitor isolation.

## Acceptance criteria

- [x] Изменение видно локально и сохраняется через UI.
- [x] Reload и повторное открытие восстанавливают сохранённый результат.
- [x] Release immutable, share без editor panel, visitor context изолирован.

## Checks

- `npm run test:e2e:browser`
- `npm run test:e2e:http`

## Expected deliverables

- Сквозной browser scenario и report.

## Evidence and report

Report: `docs/verification/reports/S0/S0-06.html`

Existing evidence: `docs/verification/reports/s0-06.html`.

## Notes

Статус DONE подтверждён существующим S0 baseline report.
