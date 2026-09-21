# S2-01.1 — Logical targets и versioned bindings

Status: DONE
Priority: P0
Depends on: None
Evidence: report
Report group: S2-target-lifecycle

## Goal

Ввести registry логических targets с устойчивой identity, scope и versioned bindings.

## Scope

- Stable target ID, project/page/root scope.
- Environment bindings и immutable binding version в Release.
- Совместимость с текущим TargetDescriptor.
- Protocol fields и migration/negotiation contract.

## Acceptance criteria

- [x] Target имеет stable ID и ограниченный project/page/root scope.
- [x] Release фиксирует binding/descriptor version, а не изменяемую последнюю binding.
- [x] Разрешённые environments различимы и не смешиваются.
- [x] Старый TargetDescriptor принимается через documented compatibility path.

## Checks

- `npm test`
- Protocol schema unit tests
- Target registry serialization fixture

## Expected deliverables

- TargetRegistry types и storage contract.
- Compatibility notes для старых descriptors.

## Evidence and report

Report: `docs/verification/reports/S2/s2-target-lifecycle.html`

## Notes

Внешняя prerequisite: принятый S1-02. Resolver policies реализуются следующими задачами.

Результат: `@lykar/protocol` экспортирует logical target/scope/root, append-only
binding storage contract, registry snapshot validators и точную ссылку
`targetId + environment + bindingVersion`. Manifest validation запрещает
cross-page scope, mixed environments и незамороженные bindings. Legacy locator
descriptors остаются валидным документированным compatibility path.

Проверено 2026-09-22: protocol serialization/validation fixtures, `npm test`,
`npm run typecheck`, `npm run build`; итоговый групповой report выпущен после
успешного lifecycle acceptance gate 7/7.
