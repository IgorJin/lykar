# s4-04 — SDK и conditional manifest playback

Status: DONE
Priority: P0
Depends on: s4-02, s4-03
Parallel wave: W3
Can run in parallel with: None

## Goal

Полноценное npm подключение обоих frameworks.

## Problem solved

Движок должен соблюдать page/access/abort lifecycle.

## Enables

- Полноценное npm подключение обоих frameworks.

## Scope

- Связать root registry и runtime, history navigation, cleanup/generations; расширить API persistence без изменения JSON DB schema.

## Parallel execution

Задача ждёт hard dependencies; общая интеграционная поверхность и групповой report имеют одного владельца.

## Acceptance criteria

- [x] A→B→A и back/forward не смешивают версии/права; после destroy нет mutations; rerender не перезапускает SDK/analytics.
- [x] Обязательные checks подтверждены evidence без скрытых skip.

## Checks

- `AGREED` — `UNIT`: baseline/own writes, group apply/remove, отмена устаревших операций, tombstone undo и cleanup.
- `AGREED` — `BROWSER`: React/Vue CSR и ordinary SSR/hydration; Waiting→Continue→Waiting, unchanged rerender, remount, duplicates, bursts, theme, routes.
- `AGREED` — `API`: реальная временная PostgreSQL, conditional persistence и legacy operations, page/access/consent/analytics regression.
- `AGREED` — `PACKAGE`: packed consumer, TypeScript, SSR imports, автоматическая build integration и static/script regression.

## Expected deliverables

- Связать root registry и runtime, history navigation, cleanup/generations; расширить API persistence без изменения JSON DB schema.
- Machine evidence и групповой HTML report.

## Evidence and report

Report: `docs/verification/reports/s4/s4-spa-integration.html`

## Notes

Пересмотр одобрен 2026-09-27; исполнение продолжается 2026-09-28. Точные commands/fixtures описаны в TEST-PLAN.md. Реализация не равна подтверждённому DONE.

## Final verification — 2026-09-29

Приёмка завершена на итоговом рабочем дереве: 205 unit checks, API 23/23 с PostgreSQL, browsers 62/62, packed consumers, typecheck и build. Групповой отчёт содержит support boundary, SHA-256 snapshot и machine evidence; историческое превышение editor size budget указано отдельно.
