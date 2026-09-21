# S2-05.3 — Ручной target repair

Status: PLANNED
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
