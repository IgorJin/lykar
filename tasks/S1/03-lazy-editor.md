# S1-01.3 — Lazy editor и границы доступа

Status: DONE
Priority: P0
Depends on: S1-01.2
Evidence: report
Report group: S1-sdk-structure

## Goal

Загрузить editor только после успешной проверки capability и сохранить fail-open
поведение host page.

## Scope

- Лёгкий access/exchange client без editor UI.
- Trusted editor asset origin и проверка project/page/origin scope.
- Structured errors для editor asset, origin и CSP failures.
- Отсутствие editor/analytics network work в обычном visitor flow.

## Acceptance criteria

- [x] Native visitor не скачивает editor bundle.
- [x] Editor загружается только после валидной page-bound capability.
- [x] Public project key не выдаёт edit rights.
- [x] Invalid, expired, revoked или mismatched access оставляет native page.
- [x] Editor asset URL нельзя заменить input/query/DOM значением.
- [x] Сбой lazy load не скрывает и не ломает host page.

## Checks

- `npm test`
- `npm run test:e2e:browser`
- Browser network assertions для native/editor contexts

## Expected deliverables

- Lazy editor loader и capability boundary.
- Access failure diagnostics и regression cases.

## Evidence and report

Report: `docs/verification/reports/S1/s1-sdk-structure.html`

## Notes

Причины отказа bearer token не должны раскрываться обычному публичному посетителю.

Результат: editor bridge загружается динамически только после capability
exchange; origin/page/project checks, timeout и fail-open проверены unit и
browser flow.
