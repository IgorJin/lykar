# S1-02.5 — Метрики, budgets и приёмка

Status: DONE
Priority: P1
Depends on: S1-02.3, S1-02.4
Evidence: report
Report group: S1-performance

## Goal

Измерить стоимость delivery/replay и зафиксировать проверяемые size, request и
network deadline budgets для следующих спринтов.

## Scope

- Raw/compressed bundle size и число requests.
- Replay duration на versioned fixtures с разным числом operations/nodes.
- Native/editor/analytics network behavior.
- Timeout/fail-open checks и S1 verification report.

## Acceptance criteria

- [x] Baseline содержит среду, fixture, число прогонов и метод сравнения.
- [x] Size/replay/request budgets имеют численные пороги и automated check.
- [x] Network deadline измерен и документирован.
- [x] Медленный manifest/API failure оставляет host видимым и работоспособным.
- [x] Script и npm consumer прошли одинаковый acceptance flow.
- [x] S1 report фиксирует ограничения и непроверенные browser/framework modes.

## Checks

- `npm run build`
- `npm run test:e2e:browser`
- Performance measurement script
- Slow network/API failure fixture
- `git diff --check`

## Expected deliverables

- Performance baseline and budget check.
- S1 installation/upgrade notes and final report.

## Evidence and report

Report: `docs/verification/reports/S1/s1-performance.html`

## Notes

Численные budgets выбираются после измерения, а не задаются предположением.

Результат: performance artifact показывает PASS; SDK IIFE 69.4 KB raw /
15.1 KB gzip, editor IIFE 57.5 KB raw, replay p95 58.362 ms на 500 nodes /
100 operations. Полный browser flow — 6/6.
