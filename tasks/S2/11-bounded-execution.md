# S2-03.4 — Bounded execution и protocol safety

Status: DONE
Priority: P0
Depends on: S2-03.3
Evidence: report
Report group: S2-replay-safety

## Goal

Ограничить размер и время replay, валидировать payload до mutation и защитить host
от unsafe commands и бесконечных observers/retries.

## Scope

- Manifest bytes, operation count/depth, replay work/time и retry limits.
- DOM read/write batching с сохранением dependency order.
- Root-scoped observer и игнорирование собственных/editor mutations.
- Unsafe HTML/URL/handlers/srcdoc/document-root removal.

## Acceptance criteria

- [x] Invalid/unsafe payload отклоняется до DOM mutation.
- [x] Limits завершают replay ограниченно и дают reason code.
- [x] Batching не меняет порядок зависимых commands.
- [x] Observer ограничен root и не создаёт self-triggered loop.
- [x] Slow/oversized fixture не оставляет скрытую страницу.

## Checks

- `npm test`
- Oversized manifest and slow replay fixtures
- Unsafe payload unit tests
- Browser observer cleanup fixture

## Expected deliverables

- Numeric execution/retry limits.
- Safe bounded executor behavior and README notes.

## Evidence and report

Report: `docs/verification/reports/S2/s2-replay-safety.html`

## Notes

Численные limits сверяются с baseline S1-02.5.

Результат: protocol/runtime проверяют bytes, count, depth, node count,
dependency count, retry count и replay time. Pipeline остаётся последовательно
упорядоченным по dependency graph; root observer игнорирует Lykar/editor-owned
mutations. Unsafe tree/attribute/root command отклоняется preflight, а timeout
компенсирует уже применённые операции.
