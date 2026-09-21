# S2-01.4 — Compatibility fixtures и repair primitives

Status: PLANNED
Priority: P0
Depends on: S2-01.3
Evidence: report
Report group: S2-target-lifecycle

## Goal

Сохранить replay старых manifests и подготовить данные для ручного rebind без
изменения опубликованного Release.

## Scope

- Old manifest compatibility fixtures.
- DOM reorder, repeated targets и повторный replay.
- Failed operation, candidate list и manual rebind data.
- New binding/revision semantics.

## Acceptance criteria

- [ ] Старые descriptors/manifests проходят compatibility replay.
- [ ] Reordered DOM не приводит к молчаливому выбору похожего target.
- [ ] Failed operation возвращает target, candidates и reason для UI.
- [ ] New binding/revision не переписывает старый Release bytes/hash.
- [ ] Incompatible schema отвергается до mutation.

## Checks

- `npm test`
- Old/new manifest replay fixtures
- Browser reorder and rebind data fixture

## Expected deliverables

- Compatibility fixture set.
- Resolver output для будущего manual repair.

## Evidence and report

Report: `docs/verification/reports/S2/s2-target-lifecycle.html`

## Notes

Полный repair UI выполняется в S2-05.3.
