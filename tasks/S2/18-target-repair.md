# S2-05.3 — Ручной target repair

Status: DONE
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

- [x] UI показывает, почему target не применился.
- [x] Пользователь выбирает новый element вручную.
- [x] Preview проверяет всю зависимую цепочку до сохранения.
- [x] Repair создаёт новую binding/operation revision.
- [x] Старый Release остаётся immutable и воспроизводимым.
- [x] Fuzzy rebind не применяется молча.

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

Final acceptance 2026-09-23: unit and browser recovery cover explicit target selection, dependent-chain preview, revision, save/reload and no silent fuzzy rebind. See the editor acceptance report.
