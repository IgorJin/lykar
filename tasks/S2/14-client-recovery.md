# S2-04.3 — Client recovery после lost response

Status: DONE
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

- [x] Потерянный после commit ответ восстанавливает сохранённый result без дубля.
- [x] Запрос, который не дошёл до сервера, безопасно повторяется с тем же payload.
- [x] Правки, сделанные во время save, остаются pending.
- [x] Reload восстанавливает saved и pending chain по правильному Page/Draft.
- [x] Ошибка save не отмечает batch сохранённым.

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

Result: recovery envelope v2 persists the exact in-flight batch before fetch,
reuses it after failure/reload, reconciles committed operation IDs and keeps
newer local edits pending. Unit and Chromium lost-response fixtures pass.
