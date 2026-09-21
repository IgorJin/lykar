# S0-08 — Documentation and acceptance

Status: DONE
Priority: P1
Depends on: S0-01, S0-07

## Goal

Закрыть cold-start instructions, verification reports и ручную приёмку основного
flow в обычном Chrome.

## Scope

- README, E2E README, S0 report и ограничения baseline.
- Точные версии среды, команды, exit codes и evidence links.
- Ручной login → editor → edit → save → reload → Release → share.

## Acceptance criteria

- [x] Другой разработчик может повторить установку и локальный стенд.
- [x] Отдельно описаны unit, PostgreSQL, HTTP smoke и browser E2E.
- [x] Автоматический и ручной Chromium/Chrome проходы подтверждены.
- [x] S1 обозначен следующей задачей без выдачи плана за реализацию.

## Checks

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:http`
- `npm run test:e2e:browser`

## Expected deliverables

- S0 baseline, review report и обновлённые инструкции.

## Evidence and report

Report: `docs/verification/reports/S0/S0-08.html`

Existing evidence: `docs/verification/reports/s0-08.html`.

## Notes

Статус DONE подтверждён существующим S0 review report.
