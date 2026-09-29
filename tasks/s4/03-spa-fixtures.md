# s4-03 — Build adapters и fixtures React/Vue

Status: DONE
Priority: P0
Depends on: s4-01
Parallel wave: W2
Can run in parallel with: s4-02

## Goal

Автоматическая readiness и реальные CSR/SSR потребители.

## Problem solved

DOM-only fixtures не доказывают framework compatibility.

## Enables

- Автоматическая readiness и реальные CSR/SSR потребители.

## Scope

- @lykar/frameworks: React createRoot/hydrateRoot и Vue createApp/createSSRApp wrappers, build plugins, реальные fixtures, harness/browser discovery.

## Parallel execution

W2 после заморозки контракта: s4-02 владеет runtime/protocol, s4-03 — framework adapters/fixtures и единолично lockfile/harness. Общие builds/dist и test stand используются последовательно.

## Acceptance criteria

- [x] Компоненты не содержат Lykar hooks/markers/state bindings; root ready приходит из автоматической инструментации; обе hydration без новых warnings.
- [x] Обязательные checks подтверждены evidence без скрытых skip.

## Checks

- `AGREED` — `BROWSER`: React/Vue CSR и ordinary SSR/hydration; Waiting→Continue→Waiting, unchanged rerender, remount, duplicates, bursts, theme, routes.
- `AGREED` — `ENGINES`: все S4 scenarios в Chromium; ключевые conditional/SPA также Firefox/WebKit.
- `AGREED` — `PACKAGE`: packed consumer, TypeScript, SSR imports, автоматическая build integration и static/script regression.
- `AGREED` — `MANUAL`: desktop/mobile viewport: selection, controls, preview/save/reload, диагностика.

## Expected deliverables

- @lykar/frameworks: React createRoot/hydrateRoot и Vue createApp/createSSRApp wrappers, build plugins, реальные fixtures, harness/browser discovery.
- Machine evidence и групповой HTML report.

## Evidence and report

Report: `docs/verification/reports/s4/s4-spa-integration.html`

## Notes

Пересмотр одобрен 2026-09-27; исполнение продолжается 2026-09-28. Точные commands/fixtures описаны в TEST-PLAN.md. Реализация не равна подтверждённому DONE.

## Final verification — 2026-09-29

Приёмка завершена на итоговом рабочем дереве: 205 unit checks, API 23/23 с PostgreSQL, browsers 62/62, packed consumers, typecheck и build. Групповой отчёт содержит support boundary, SHA-256 snapshot и machine evidence; историческое превышение editor size budget указано отдельно.
