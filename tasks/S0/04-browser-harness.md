# S0-04 — Browser E2E harness

Status: DONE
Priority: P0
Depends on: S0-03

## Goal

Добавить реальный Chromium harness, который сам поднимает и завершает изолированный
стенд и сохраняет диагностические артефакты при падении.

## Scope

- Playwright config, browser fixture и lifecycle integration.
- Изолированные owner/visitor contexts.
- Screenshot, trace, video и error context.

## Acceptance criteria

- [x] Browser suite запускается без ручной авторизации, cookies и profile.
- [x] Тесты используют реальные HTTP endpoints и browser events.
- [x] Ошибки сохраняют диагностику, а retries не скрывают нестабильность.

## Checks

- `npm run test:e2e:browser`
- `npx playwright install chromium`

## Expected deliverables

- Повторяемый browser command и fixture.

## Evidence and report

Report: `docs/verification/reports/S0/S0-04.html`

Existing evidence: `docs/verification/reports/s0-04.html`.

## Notes

Статус DONE подтверждён существующим S0 baseline report.
