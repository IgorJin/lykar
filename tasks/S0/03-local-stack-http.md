# S0-03 — Local stack and HTTP smoke

Status: DONE
Priority: P0
Depends on: S0-02

## Goal

Подтвердить запуск изолированного PostgreSQL/API/Admin/playground стенда,
повторный запуск, остановку и HTTP smoke.

## Scope

- `scripts/e2e-stack.mjs` и playground scripts.
- API integration tests, migrations, seed и readiness checks.
- Ошибки старта, занятие порта и Ctrl+C.

## Acceptance criteria

- [x] Admin, assets, API, playground и seeded pages доступны из одного запуска.
- [x] PostgreSQL tests проходят на временной БД без унаследованного URL.
- [x] Повторный seed сохраняет пользовательские drafts/releases.
- [x] Owned processes корректно освобождаются при успехе, ошибке и Ctrl+C.

## Checks

- `npm run dev:e2e`
- `npm run test:e2e:http`

## Expected deliverables

- Изолированный lifecycle стенда и HTTP smoke evidence.

## Evidence and report

Report: `docs/verification/reports/S0/S0-03.html`

Existing evidence: `docs/verification/reports/s0-03.html`.

## Notes

Статус DONE подтверждён существующим S0 baseline report.
