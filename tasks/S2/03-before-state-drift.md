# S2-01.3 — Before-state, desired-state и drift

Status: PLANNED
Priority: P0
Depends on: S2-01.2
Evidence: report
Report group: S2-target-lifecycle

## Goal

Разделить признаки исходного target и ожидаемое состояние после операции, чтобы
изменение текста не ломало адресацию и drift не выдавался за visual proof.

## Scope

- Before-state и desired-state fields в target/precondition model.
- Structural fingerprint до Lykar replay.
- Исключение editor/service markers.
- CSS-only drift и неизвестная baseline.

## Acceptance criteria

- [ ] После setText locator не требует прежнего текста.
- [ ] Fingerprint снимается до mutation и не содержит raw HTML/полный page text.
- [ ] CSS-only change не объявляется доказанной visual compatibility.
- [ ] Lykar-mutated DOM не становится новой source baseline.
- [ ] Отсутствующая чистая baseline даёт `unknown`, а не ложный PASS.

## Checks

- `npm test`
- Text change and CSS-only drift fixtures
- Source snapshot browser check

## Expected deliverables

- Before/desired state model.
- Drift diagnostic tests и snapshot policy.

## Evidence and report

Report: `docs/verification/reports/S2/s2-target-lifecycle.html`

## Notes

Structural fingerprint остаётся diagnostic signal; visual/computed validation относится к X2.
