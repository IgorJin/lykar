# S1-01.1 — Публичный API и матрица совместимости

Status: DONE
Priority: P0
Depends on: None
Evidence: report
Report group: S1-sdk-structure

## Goal

Зафиксировать минимальный публичный API SDK и границы совместимости script/npm,
не выдавая ещё не реализованный S2 lifecycle за готовый.

## Scope

- Constructor/options и lifecycle signatures `start/navigate/refresh/destroy`.
- Unified report, diagnostics, `track/consent` и access mode types.
- Сопоставление текущих `Lykar`, `LykarRuntime`, `init` и globals с SDK entry.
- Матрица поддерживаемых entry points, manifests и границ S2/S4.

## Acceptance criteria

- [x] Public types экспортируются из SDK и описывают supported/unsupported modes.
- [x] Constructor не делает network request или DOM mutation.
- [x] Compatibility matrix связывает старые entry points с новым API.
- [x] Версии protocol, SDK и Page Release различаются в контракте.

## Checks

- `npm run typecheck`
- `npm test`

## Expected deliverables

- SDK public types и README API.
- Compatibility matrix и migration notes.

## Evidence and report

Report: `docs/verification/reports/S1/s1-sdk-structure.html`

## Notes

Внешняя prerequisite: S0-08 уже DONE. Полное поведение PageSession реализуется в S2.

Результат: packages/sdk/src/types.ts, public README и
packages/sdk/COMPATIBILITY.md; SSR-safe constructor подтверждён unit/consumer
проверками.
