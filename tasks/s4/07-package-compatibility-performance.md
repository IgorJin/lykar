# s4-07 — Пакеты, совместимость и ресурсы

Status: DONE
Priority: P0
Depends on: s4-06
Parallel wave: W6
Can run in parallel with: None

## Goal

Проверенные tarballs, builds и support matrix.

## Problem solved

Workspace imports не доказывают installable npm artifacts.

## Enables

- Проверенные tarballs, builds и support matrix.

## Scope

- Packed consumer вне monorepo; TypeScript/SSR; Vite/esbuild plugin; browser timings/resource counters; отдельный S4 performance output.

## Parallel execution

Задача ждёт hard dependencies; общая интеграционная поверхность и групповой report имеют одного владельца.

## Acceptance criteria

- [x] Imports/exports/types работают из tarball; нет alias recursion; framework versions/builders записаны; cleanup не накапливает ресурсы.
- [x] Обязательные checks подтверждены evidence без скрытых skip.

## Checks

- `AGREED` — `PACKAGE`: packed consumer, TypeScript, SSR imports, автоматическая build integration и static/script regression.
- `AGREED` — `PERFORMANCE`: размеры/время/counters, bounded observer/retries, отсутствие накопления ресурсов; новые absolute latency/heap budgets PROPOSED.
- `AGREED` — `ENGINES`: все S4 scenarios в Chromium; ключевые conditional/SPA также Firefox/WebKit.

## Expected deliverables

- Packed consumer вне monorepo; TypeScript/SSR; Vite/esbuild plugin; browser timings/resource counters; отдельный S4 performance output.
- Machine evidence и групповой HTML report.

## Evidence and report

Report: `docs/verification/reports/s4/s4-delivery-performance.html`

## Notes

Пересмотр одобрен 2026-09-27; исполнение продолжается 2026-09-28. Точные commands/fixtures описаны в TEST-PLAN.md. Реализация не равна подтверждённому DONE.

## Final verification — 2026-09-29

Приёмка завершена на итоговом рабочем дереве: 205 unit checks, API 23/23 с PostgreSQL, browsers 62/62, packed consumers, typecheck и build. Групповой отчёт содержит support boundary, SHA-256 snapshot и machine evidence; историческое превышение editor size budget указано отдельно.
