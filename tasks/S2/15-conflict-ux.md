# S2-04.4 — Conflict UX и две вкладки

Status: PLANNED
Priority: P0
Depends on: S2-04.3
Evidence: report
Report group: S2-persistence-recovery

## Goal

Показать revision conflict и сохранить pending edits при конкурентном сохранении
из двух вкладок.

## Scope

- Stale expected revision response.
- Two-tab conflict/review/retry UI.
- Corrupt/unavailable session storage и offline state.
- Access revoke during retry.

## Acceptance criteria

- [ ] Одна вкладка сохраняет batch, вторая получает conflict.
- [ ] Вторая вкладка не теряет pending operations после reload.
- [ ] UI не выполняет silent rebase или last-write-wins.
- [ ] Новый payload получает новый key только после решения конфликта.
- [ ] Offline/storage/capability errors не показываются как success.
- [ ] Чужой actor/project/page не получает чужой saved result.

## Checks

- `npm test`
- Two-tab browser fixture
- Offline/storage failure fixture
- Access revoke retry fixture

## Expected deliverables

- Conflict/review UX.
- S2 save/recovery contract report.

## Evidence and report

Report: `docs/verification/reports/S2/s2-persistence-recovery.html`

## Notes

После этой задачи persistence считается готовым для интеграции с полным editor UI.
