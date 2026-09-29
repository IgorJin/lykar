# s4-08 — Финальная приёмка S4

Status: DONE
Priority: P0
Depends on: s4-07
Parallel wave: W7
Can run in parallel with: None

## Goal

Основание закрытия S4.

## Problem solved

Нужен один воспроизводимый snapshot и честные результаты.

## Enables

- Основание закрытия S4.

## Scope

- Последовательные build/typecheck/unit/HTTP/browser gates, manual desktop/mobile, package/performance evidence, support docs и групповые reports.

## Parallel execution

Задача ждёт hard dependencies; общая интеграционная поверхность и групповой report имеют одного владельца.

## Acceptance criteria

- [x] Все AGREED checks выполнены; отсутствующие/пропущенные tests не объявлены PASS; ограничения support matrix перечислены.
- [x] Обязательные checks подтверждены evidence без скрытых skip.

## Checks

- `AGREED` — `UNIT`: baseline/own writes, group apply/remove, отмена устаревших операций, tombstone undo и cleanup.
- `AGREED` — `API`: реальная временная PostgreSQL, conditional persistence и legacy operations, page/access/consent/analytics regression.
- `AGREED` — `BROWSER`: React/Vue CSR и ordinary SSR/hydration; Waiting→Continue→Waiting, unchanged rerender, remount, duplicates, bursts, theme, routes.
- `AGREED` — `FLOW`: selection→text/style→save/reload→Release→share без ручных state/target/readiness hooks.
- `AGREED` — `PACKAGE`: packed consumer, TypeScript, SSR imports, автоматическая build integration и static/script regression.
- `AGREED` — `PERFORMANCE`: размеры/время/counters, bounded observer/retries, отсутствие накопления ресурсов; новые absolute latency/heap budgets PROPOSED.
- `AGREED` — `ENGINES`: все S4 scenarios в Chromium; ключевые conditional/SPA также Firefox/WebKit.
- `AGREED` — `MANUAL`: desktop/mobile viewport: selection, controls, preview/save/reload, диагностика.
- `AGREED` — `PREPAINT`: после safe ready и загрузки правил text/style согласованы к следующему кадру; первый кадр при поздней загрузке отдельно.

## Expected deliverables

- Последовательные build/typecheck/unit/HTTP/browser gates, manual desktop/mobile, package/performance evidence, support docs и групповые reports.
- Machine evidence и групповой HTML report.

## Evidence and report

Report: `docs/verification/reports/s4/s4-acceptance.html`

## Notes

Пересмотр одобрен 2026-09-27; исполнение продолжается 2026-09-28. Точные commands/fixtures описаны в TEST-PLAN.md. Реализация не равна подтверждённому DONE.

## Final verification — 2026-09-29

Приёмка завершена на итоговом рабочем дереве: 205 unit checks, API 23/23 с PostgreSQL, browsers 62/62, packed consumers, typecheck и build. Групповой отчёт содержит support boundary, SHA-256 snapshot и machine evidence; историческое превышение editor size budget указано отдельно.
