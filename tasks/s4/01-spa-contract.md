# s4-01 — Автономный контракт React/Vue

Status: DONE
Priority: P0
Depends on: None
Parallel wave: W1
Can run in parallel with: None

## Goal

Зафиксированный контракт для runtime, editor и build integration.

## Problem solved

Ручная регистрация целей не соответствует требованиям.

## Enables

- Зафиксированный контракт для runtime, editor и build integration.

## Scope

- Формат2 для условных text/style; старый format1 сохранён. Исходный текст отделён от target identity. Автоматическая readiness после commit, не DOMContentLoaded. Ordinary SSR/CSR для React и Vue; Next/streaming/RSC/selective hydration отложены.

## Parallel execution

Задача ждёт hard dependencies; общая интеграционная поверхность и групповой report имеют одного владельца.

## Acceptance criteria

- [x] Валидатор отклоняет condition без format2 и неверные группы; контракт покрывает состояние, target, undo, limits и root lifecycle.
- [x] Обязательные checks подтверждены evidence без скрытых skip.

## Checks

- `AGREED` — `UNIT`: baseline/own writes, group apply/remove, отмена устаревших операций, tombstone undo и cleanup.
- `AGREED` — `API`: реальная временная PostgreSQL, conditional persistence и legacy operations, page/access/consent/analytics regression.
- `AGREED` — `BROWSER`: React/Vue CSR и ordinary SSR/hydration; Waiting→Continue→Waiting, unchanged rerender, remount, duplicates, bursts, theme, routes.

## Expected deliverables

- Формат2 для условных text/style; старый format1 сохранён. Исходный текст отделён от target identity. Автоматическая readiness после commit, не DOMContentLoaded. Ordinary SSR/CSR для React и Vue; Next/streaming/RSC/selective hydration отложены.
- Machine evidence и групповой HTML report.

## Evidence and report

Report: `docs/verification/reports/s4/s4-spa-integration.html`

## Notes

Пересмотр одобрен 2026-09-27; исполнение продолжается 2026-09-28. Точные commands/fixtures описаны в TEST-PLAN.md. Реализация не равна подтверждённому DONE.

## Implementation evidence

Format 2 contract, plain-text guard, atomic text/style group, tombstone undo, automatic build readiness and conservative target resolution are implemented. Protocol suite 19/19 PASS; final integrated snapshot follows in S4 acceptance report.

## Final verification — 2026-09-29

Приёмка завершена на итоговом рабочем дереве: 205 unit checks, API 23/23 с PostgreSQL, browsers 62/62, packed consumers, typecheck и build. Групповой отчёт содержит support boundary, SHA-256 snapshot и machine evidence; историческое превышение editor size budget указано отдельно.
