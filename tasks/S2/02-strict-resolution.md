# S2-01.2 — Строгий target resolution

Status: DONE
Priority: P0
Depends on: S2-01.1
Evidence: report
Report group: S2-target-lifecycle

## Goal

Разрешать target только при однозначном результате и возвращать диагностическое
evidence для unique/missing/ambiguous/invalid.

## Scope

- Marker, semantic/contextual признаки и CSS/XPath fallbacks.
- Root-scoped candidate search.
- Invalid selectors, duplicate candidates и first-match prohibition.
- Reason codes и resolution evidence.

## Acceptance criteria

- [x] Resolver возвращает ровно один из `unique/missing/ambiguous/invalid`.
- [x] Два похожих CTA дают ambiguous и не мутируют первый candidate.
- [x] Malformed locator даёт invalid; отсутствие кандидата — missing.
- [x] Candidate search не выходит за разрешённый root.
- [x] Evidence объясняет, почему target принят или отклонён.

## Checks

- `npm test`
- Resolver unit tests
- Browser duplicate CTA, missing и invalid fixtures

## Expected deliverables

- Strict resolver implementation.
- Diagnostic reason/evidence model.

## Evidence and report

Report: `docs/verification/reports/S2/s2-target-lifecycle.html`

## Notes

Автоматический выбор первого совпадения запрещён даже если он позволяет продолжить replay.

Результат: resolver агрегирует marker/CSS/XPath candidates внутри root,
дедуплицирует их, применяет fingerprint и возвращает status/reason/attempt
evidence. Executor отображает outcomes в `TARGET_NOT_FOUND`,
`TARGET_AMBIGUOUS` и `TARGET_INVALID`; мутация возможна только для `unique`.

Проверено 2026-09-22: resolver/runtime unit fixtures и реальный Chromium fixture
для duplicate CTA, missing и malformed CSS; `npm test`, `npm run typecheck`,
`npm run build`; итоговый групповой report выпущен после успешного lifecycle
acceptance gate 7/7.
