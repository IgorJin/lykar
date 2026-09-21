# S0-02 — Workspace baseline

Status: DONE
Priority: P0
Depends on: S0-01

## Goal

Проверить build, typecheck и unit suites всех workspaces и зафиксировать причины
пропусков или ошибок.

## Scope

- Protocol, runtime, editor bridge, API, Admin, playground и legacy library.
- Workspace scripts и существующие unit tests.

## Acceptance criteria

- [x] Корневые build, typecheck и test проходят на snapshot.
- [x] PostgreSQL tests без URL явно направлены в S0-03, а не считаются PASS.
- [x] Ошибки не скрыты исключением workspace или ослаблением проверок.

## Checks

- `npm run build`
- `npm run typecheck`
- `npm test`

## Expected deliverables

- Таблица результатов по workspaces в baseline report.

## Evidence and report

Report: `docs/verification/reports/S0/S0-02.html`

Existing evidence: `docs/verification/reports/s0-02.html`.

## Notes

Статус DONE подтверждён существующим S0 baseline report.
