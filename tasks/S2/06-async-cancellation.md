# S2-02.2 — Async cancellation и generation checks

Status: DONE
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

- [x] Поздний ответ Page A после перехода на B не меняет B и не отправляет report.
- [x] Capability Page A не используется для Page B.
- [x] Readiness/retry завершаются abort или bounded diagnostic.
- [x] Late completion с устаревшей generation не вызывает mutation/event.

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

Результат: signal/generation проходят через access exchange, manifest,
readiness, target retry, runtime report/analytics и editor bootstrap. Guard стоит
непосредственно перед DOM/storage/URL/report/event side effects; transport,
игнорирующий abort, не получает право на mutation.

Проверено 2026-09-22: controlled A→B ordering, late editor capability,
abort/readiness/retry fixtures, HTTP smoke 21/21 и Chromium 8/8.
