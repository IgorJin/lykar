# s4-02 — Движок условных правок

Status: DONE
Priority: P0
Depends on: s4-01
Parallel wave: W2
Can run in parallel with: s4-03

## Goal

Общий синхронный движок preview и playback.

## Problem solved

Разовое replay теряет связь с состоянием после rerender.

## Enables

- Общий синхронный движок preview и playback.

## Scope

- MutationObserver, host baseline, own-write accounting, атомарные группы, Text node identity, remount/duplicates, latest-host cleanup, bounded work.

## Parallel execution

W2 после заморозки контракта: s4-02 владеет runtime/protocol, s4-03 — framework adapters/fixtures и единолично lockfile/harness. Общие builds/dist и test stand используются последовательно.

## Acceptance criteria

- [x] Waiting→Continue→Waiting включает/снимает text+color совместно; два состояния одной кнопки независимы; нет бесконечных циклов и утечек.
- [x] Обязательные checks подтверждены evidence без скрытых skip.

## Checks

- `AGREED` — `UNIT`: baseline/own writes, group apply/remove, отмена устаревших операций, tombstone undo и cleanup.
- `AGREED` — `BROWSER`: React/Vue CSR и ordinary SSR/hydration; Waiting→Continue→Waiting, unchanged rerender, remount, duplicates, bursts, theme, routes.
- `AGREED` — `PERFORMANCE`: размеры/время/counters, bounded observer/retries, отсутствие накопления ресурсов; новые absolute latency/heap budgets PROPOSED.
- `AGREED` — `PREPAINT`: после safe ready и загрузки правил text/style согласованы к следующему кадру; первый кадр при поздней загрузке отдельно.

## Expected deliverables

- MutationObserver, host baseline, own-write accounting, атомарные группы, Text node identity, remount/duplicates, latest-host cleanup, bounded work.
- Machine evidence и групповой HTML report.

## Evidence and report

Report: `docs/verification/reports/s4/s4-spa-integration.html`

## Notes

Пересмотр одобрен 2026-09-27; исполнение продолжается 2026-09-28. Точные commands/fixtures описаны в TEST-PLAN.md. Реализация не равна подтверждённому DONE.

## Final verification — 2026-09-29

Приёмка завершена на итоговом рабочем дереве: 205 unit checks, API 23/23 с PostgreSQL, browsers 62/62, packed consumers, typecheck и build. Групповой отчёт содержит support boundary, SHA-256 snapshot и machine evidence; историческое превышение editor size budget указано отдельно.
