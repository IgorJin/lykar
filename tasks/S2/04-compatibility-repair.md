# S2-01.4 — Compatibility fixtures и repair primitives

Status: DONE
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

- [x] Старые descriptors/manifests проходят compatibility replay.
- [x] Reordered DOM не приводит к молчаливому выбору похожего target.
- [x] Failed operation возвращает target, candidates и reason для UI.
- [x] New binding/revision не переписывает старый Release bytes/hash.
- [x] Incompatible schema отвергается до mutation.

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

Результат: добавлен frozen legacy-manifest fixture, immutable
`appendTargetBindingV1` для новой environment-specific binding revision и
candidate evidence в runtime/editor reports. Reorder/repeated candidates дают
ambiguous без мутации; schema mismatch отклоняется до replay.

Проверено 2026-09-22: old/new manifest, immutable hash, editor diagnostics и
browser reorder/rebind-data fixtures; `npm run typecheck`, `npm test`,
`npm run build`. Полный repair UI остаётся в S2-05.3; итоговый групповой report
выпущен после успешного lifecycle acceptance gate 7/7.
