# S2-04.3 — Client recovery после lost response

Status: PLANNED
Priority: P0
Depends on: S2-04.2
Evidence: report
Report group: S2-persistence-recovery

## Goal

Восстановить saved/pending state после потери ответа, reload или повторной попытки
без дублей и потери новых локальных правок.

## Scope

- Persisted key, sent batch и pending operations до подтверждения.
- Retry с тем же key/payload.
- Backend reconciliation по operation IDs/result.
- Save-in-flight edits и reload recovery.

## Acceptance criteria

- [ ] Потерянный после commit ответ восстанавливает сохранённый result без дубля.
- [ ] Запрос, который не дошёл до сервера, безопасно повторяется с тем же payload.
- [ ] Правки, сделанные во время save, остаются pending.
- [ ] Reload восстанавливает saved и pending chain по правильному Page/Draft.
- [ ] Ошибка save не отмечает batch сохранённым.

## Checks

- `npm test`
- Browser lost-response fixture
- Save-in-flight edit and reload fixture
- `npm run test:e2e:http`

## Expected deliverables

- Client pending batch/recovery state.
- Lost-response regression evidence.

## Evidence and report

Report: `docs/verification/reports/S2/s2-persistence-recovery.html`

## Notes

Storage failure/offline handling получает пользовательское сообщение в S2-04.4.
