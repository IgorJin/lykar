# S2-03.3 — Journal и compare-and-restore

Status: DONE
Priority: P0
Depends on: S2-03.2
Evidence: report
Report group: S2-replay-safety

## Goal

Компенсировать partial mutation безопасно и не затирать более поздние изменения host.

## Scope

- Before/after journal и in-memory inverse actions.
- Partial failure compensation.
- Session cleanup integration.
- Compare-and-restore ownership checks.

## Acceptance criteria

- [x] Partial mutation откатывается в пределах Lykar ownership contract.
- [x] Host change после Lykar mutation сохраняется при cleanup/undo.
- [x] Невозможная компенсация даёт diagnostic и reload guidance.
- [x] Executor не заменяет весь `document.body` для восстановления.
- [x] Отменённая session не запускает компенсацию в другом context.

## Checks

- `npm test`
- Failure injection unit tests
- Browser host-concurrent-mutation fixture
- Destroy during partial replay fixture

## Expected deliverables

- Before/after journal.
- Compare-and-restore implementation and diagnostics.

## Evidence and report

Report: `docs/verification/reports/S2/s2-replay-safety.html`

## Notes

Undo closures и node references остаются только в памяти editor/runtime.

Результат: `MutationJournal` хранит serializable before/after evidence и
in-memory inverses. PageSession cleanup компенсирует в обратном порядке;
compare-and-restore сохраняет более позднюю host mutation и выдаёт
`HOST_MUTATION_PRESERVED`/reload guidance. Failure injection подтверждает
локальный rollback без замены body.
