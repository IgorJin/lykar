# S2-01.2 — Строгий target resolution

Status: PLANNED
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

- [ ] Resolver возвращает ровно один из `unique/missing/ambiguous/invalid`.
- [ ] Два похожих CTA дают ambiguous и не мутируют первый candidate.
- [ ] Malformed locator даёт invalid; отсутствие кандидата — missing.
- [ ] Candidate search не выходит за разрешённый root.
- [ ] Evidence объясняет, почему target принят или отклонён.

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
