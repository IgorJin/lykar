# S2-05.3 — Ручной target repair

Status: IN_PROGRESS
Priority: P1
Depends on: S2-05.2
Evidence: report
Report group: S2-editor-acceptance

## Goal

Дать пользователю безопасно исправить drift/missing/ambiguous target через новый
binding/revision и preview полной цепочки.

## Scope

- Failed operation, reason и candidate presentation.
- Manual element selection и new binding.
- Preview dependent chain before save.
- New Draft/Release без переписывания старого Release.

## Acceptance criteria

- [ ] UI показывает, почему target не применился.
- [ ] Пользователь выбирает новый element вручную.
- [ ] Preview проверяет всю зависимую цепочку до сохранения.
- [ ] Repair создаёт новую binding/operation revision.
- [ ] Старый Release остаётся immutable и воспроизводимым.
- [ ] Fuzzy rebind не применяется молча.

## Checks

- `npm test`
- Browser missing/ambiguous repair fixture
- Old/new Release comparison

## Expected deliverables

- Manual repair UI и data contract.
- Repair browser evidence.

## Evidence and report

Report: `docs/verification/reports/S2/s2-editor-acceptance.html`

## Notes

Page fingerprint mismatch сам по себе не блокирует независимые совместимые operations.

Implementation 2026-09-22: the Change Tree presents failure reasons and
ambiguity candidates, explicit element selection appends a target-repair
revision, and nodeRef/dependency descendants are rewritten and previewed as a
chain without changing the failed operation. Unit regressions pass; browser
save/reload evidence is authored but has not run because local port binding was
not approved in this environment.
