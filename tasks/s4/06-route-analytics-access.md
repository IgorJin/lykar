# s4-06 — Сквозной workflow и изоляция

Status: DONE
Priority: P0
Depends on: s4-05
Parallel wave: W5
Can run in parallel with: None

## Goal

Проверенный owner/visitor сценарий React/Vue.

## Problem solved

Preview не доказывает release/share/persistence.

## Enables

- Проверенный owner/visitor сценарий React/Vue.

## Scope

- Editor→save→reload→immutable Release→share с PostgreSQL; page/access/consent/analytics regressions и engine matrix.

## Parallel execution

Задача ждёт hard dependencies; общая интеграционная поверхность и групповой report имеют одного владельца.

## Acceptance criteria

- [x] Share воспроизводит исходные условия; native/другая Page остаются без чужих edits; rerender не создаёт дубли exposure.
- [x] Обязательные checks подтверждены evidence без скрытых skip.

## Checks

- `AGREED` — `FLOW`: selection→text/style→save/reload→Release→share без ручных state/target/readiness hooks.
- `AGREED` — `API`: реальная временная PostgreSQL, conditional persistence и legacy operations, page/access/consent/analytics regression.
- `AGREED` — `BROWSER`: React/Vue CSR и ordinary SSR/hydration; Waiting→Continue→Waiting, unchanged rerender, remount, duplicates, bursts, theme, routes.
- `AGREED` — `ENGINES`: все S4 scenarios в Chromium; ключевые conditional/SPA также Firefox/WebKit.
- `AGREED` — `MANUAL`: desktop/mobile viewport: selection, controls, preview/save/reload, диагностика.

## Expected deliverables

- Editor→save→reload→immutable Release→share с PostgreSQL; page/access/consent/analytics regressions и engine matrix.
- Machine evidence и групповой HTML report.

## Evidence and report

Report: `docs/verification/reports/s4/s4-editor-analytics.html`

## Notes

Пересмотр одобрен 2026-09-27; исполнение продолжается 2026-09-28. Точные commands/fixtures описаны в TEST-PLAN.md. Реализация не равна подтверждённому DONE.

## Final verification — 2026-09-29

Приёмка завершена на итоговом рабочем дереве: 205 unit checks, API 23/23 с PostgreSQL, browsers 62/62, packed consumers, typecheck и build. Групповой отчёт содержит support boundary, SHA-256 snapshot и machine evidence; историческое превышение editor size budget указано отдельно.
