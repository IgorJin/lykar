# S0-07 — Blocking defects

Status: DONE
Priority: P0
Depends on: S0-01, S0-06

## Goal

Устранить дефекты, блокирующие установку, запуск, вход, edit, save, reload или
share, и закрепить regression cases.

## Scope

- Дефекты, найденные в S0-01…S0-06.
- Auth, persistence, runtime, Admin и popup fixes по фактическому влиянию.

## Acceptance criteria

- [x] Открытых блокеров принятого S0 flow нет.
- [x] Каждый исправленный блокер имеет значимый regression case.
- [x] Затронутые проверки повторены после исправления.

## Checks

- `npm test`
- `npm run test:e2e:http`
- `npm run test:e2e:browser`

## Expected deliverables

- Реестр S0-BUG и regression evidence.

## Evidence and report

Report: `docs/verification/reports/S0/S0-07.html`

Existing evidence: `docs/verification/reports/s0-07.html`.

## Notes

Статус DONE подтверждён существующим S0 baseline report.
