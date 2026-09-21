# S1-02.4 — Dependency audit

Status: DONE
Priority: P1
Depends on: S1-02.1
Evidence: machine
Report group: S1-distribution

## Goal

Проверить зависимости library artifacts и зафиксировать устранимые и остаточные
риски до дальнейшей поставки.

## Scope

- Свежий audit с датой и источником advisory data.
- Разделение visitor/runtime/editor/dev dependencies.
- Обновление устранимых findings и lockfile verification.
- Regression checks после обновления.

## Acceptance criteria

- [x] Audit result записан с командой, датой и классификацией findings.
- [x] Runtime bundle не получает dev/test-only dependency.
- [x] Устранимые findings обновлены или имеют объяснённую причину исключения.
- [x] Нерешённые findings явно отражены в S1 report.
- [x] Clean install и затронутые browser/consumer checks проходят после обновлений.

## Checks

- `npm audit --offline`
- `npm ci --offline`
- `npm run build`
- `npm test`

## Expected deliverables

- Audit snapshot и dependency decisions.
- Lockfile diff/reason и regression result.

## Evidence and report

Evidence: machine
Report: `docs/verification/reports/S1/s1-distribution.html`

## Notes

Offline audit без advisory data нельзя выдавать за полноценное подтверждение отсутствия рисков.

Результат: docs/verification/artifacts/s1-dependency-audit.json фиксирует PASS
и нулевые findings в локальном advisory cache; ограничение offline audit
вынесено в distribution report.
