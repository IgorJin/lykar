# S1-01.4 — Playground compatibility bridge

Status: DONE
Priority: P0
Depends on: S1-01.3
Evidence: report
Report group: S1-sdk-structure

## Goal

Перевести playground на SDK и оставить в нём только fixture/UI, сохранив основной
S0 browser flow и старые поддерживаемые entry points.

## Scope

- `apps/playground/public/playground.js` и config integration.
- Compatibility bridge для текущих runtime/editor globals.
- Login → editor → edit → save → reload → Release → share через SDK.
- Reload isolation для API, Page и capability.

## Acceptance criteria

- [x] Playground не копирует launch/share orchestration.
- [x] S0 flow проходит через публичный SDK.
- [x] Повторный static start не создаёт второй overlay, exchange или listener.
- [x] Reload не переносит capability на другую API/Page.
- [x] Старые поддерживаемые entry points проходят compatibility fixtures.

## Checks

- `npm run build`
- `npm run test:e2e:http`
- `npm run test:e2e:browser`

## Expected deliverables

- Playground compatibility bridge.
- Browser regression для S0 flow и repeated start.

## Evidence and report

Report: `docs/verification/reports/S1/s1-sdk-structure.html`

## Notes

После этой задачи можно собирать независимые package artifacts без playground glue.

Результат: playground загружает только sdk.iife.js и playground.js, а editor
asset приходит через SDK; HTTP smoke и 6/6 browser E2E прошли.
