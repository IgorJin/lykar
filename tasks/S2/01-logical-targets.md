# S2-01.1 — Logical targets и versioned bindings

Status: PLANNED
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

- [ ] Target имеет stable ID и ограниченный project/page/root scope.
- [ ] Release фиксирует binding/descriptor version, а не изменяемую последнюю binding.
- [ ] Разрешённые environments различимы и не смешиваются.
- [ ] Старый TargetDescriptor принимается через documented compatibility path.

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
