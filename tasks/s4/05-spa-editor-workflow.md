# s4-05 — Автоматический захват состояния в редакторе

Status: DONE
Priority: P0
Depends on: s4-04
Parallel wave: W4
Can run in parallel with: None

## Goal

Условные preview/save/reload/undo из прежнего editor UI.

## Problem solved

Пользователь не должен описывать условия компонента вручную.

## Enables

- Условные preview/save/reload/undo из прежнего editor UI.

## Scope

- Capture исходного отображения при selection; общий condition для text/style; preview, undo/redo/reset, saved tombstone undo, recovery.

## Parallel execution

Задача ждёт hard dependencies; общая интеграционная поверхность и групповой report имеют одного владельца.

## Acceptance criteria

- [x] Выбранное Continue становится Далее только в своём состоянии; стиль снимается к актуальному host значению; неоднозначный target отклоняется до создания правки.
- [x] Обязательные checks подтверждены evidence без скрытых skip.

## Checks

- `AGREED` — `UNIT`: baseline/own writes, group apply/remove, отмена устаревших операций, tombstone undo и cleanup.
- `AGREED` — `FLOW`: selection→text/style→save/reload→Release→share без ручных state/target/readiness hooks.
- `AGREED` — `BROWSER`: React/Vue CSR и ordinary SSR/hydration; Waiting→Continue→Waiting, unchanged rerender, remount, duplicates, bursts, theme, routes.
- `AGREED` — `MANUAL`: desktop/mobile viewport: selection, controls, preview/save/reload, диагностика.

## Expected deliverables

- Capture исходного отображения при selection; общий condition для text/style; preview, undo/redo/reset, saved tombstone undo, recovery.
- Machine evidence и групповой HTML report.

## Evidence and report

Report: `docs/verification/reports/s4/s4-editor-analytics.html`

## Notes

Пересмотр одобрен 2026-09-27; исполнение продолжается 2026-09-28. Точные commands/fixtures описаны в TEST-PLAN.md. Реализация не равна подтверждённому DONE.

## Final verification — 2026-09-29

Приёмка завершена на итоговом рабочем дереве: 205 unit checks, API 23/23 с PostgreSQL, browsers 62/62, packed consumers, typecheck и build. Групповой отчёт содержит support boundary, SHA-256 snapshot и machine evidence; историческое превышение editor size budget указано отдельно.
