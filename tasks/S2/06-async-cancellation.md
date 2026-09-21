# S2-02.2 — Async cancellation и generation checks

Status: PLANNED
Priority: P0
Depends on: S2-02.1
Evidence: report
Report group: S2-target-lifecycle

## Goal

Отменять устаревшие fetch/readiness/retry/editor tasks и не допускать mutation из
старого route context.

## Scope

- Fetch abort, DOM readiness wait и bounded target retry.
- Generation/page/root checks before mutation/report/event.
- Late transport completion, даже если abort не остановил сам transport.
- Editor bootstrap cancellation.

## Acceptance criteria

- [ ] Поздний ответ Page A после перехода на B не меняет B и не отправляет report.
- [ ] Capability Page A не используется для Page B.
- [ ] Readiness/retry завершаются abort или bounded diagnostic.
- [ ] Late completion с устаревшей generation не вызывает mutation/event.

## Checks

- `npm test`
- Controlled response ordering unit tests
- Browser A→B late response fixture

## Expected deliverables

- Abort/generation guards.
- Regression cases для route race.

## Evidence and report

Report: `docs/verification/reports/S2/s2-target-lifecycle.html`

## Notes

Каждая async task проверяет актуальность непосредственно перед side effect.
