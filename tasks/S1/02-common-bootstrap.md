# S1-01.2 — Общий bootstrap и access modes

Status: DONE
Priority: P0
Depends on: S1-01.1
Evidence: report
Report group: S1-sdk-structure

## Goal

Перенести выбор режима и URL/access orchestration из playground в единый SDK bootstrap.

## Scope

- Нормализация pathname и выбор native/visitor/editor/share/variant/experiment.
- Editor launch и share exchange, URL cleanup и capability context.
- Явная обработка взаимоисключающих URL selectors.
- Сохранение protected version и существующих share/experiment semantics.

## Acceptance criteria

- [x] Script и manual npm initialization вызывают один bootstrap.
- [x] Одновременные selectors возвращают `ambiguous mode`, а не случайный режим.
- [x] One-time code удаляется из URL после exchange.
- [x] Share остаётся read-only и не открывает editor panel.
- [x] Обычный native URL в `links-only` не запрашивает manifest.

## Checks

- `npm test`
- `npm run test:e2e:http`
- Browser mode selection and URL cleanup fixture

## Expected deliverables

- Общий bootstrap module.
- Access mode tests и diagnostics.

## Evidence and report

Report: `docs/verification/reports/S1/s1-sdk-structure.html`

## Notes

Editor lifecycle и строгие target checks остаются следующими спринтами.

Результат: access exchange, mode selection, fragment cleanup и share/version
semantics перенесены в packages/sdk/src/access.ts и sdk.ts; HTTP и browser
проверки прошли.
