# S0 — Проверенный baseline

Status: DONE
Planning date: 2026-09-21

## Goal

Зафиксировать воспроизводимое состояние проекта и подтвердить в настоящем
браузере путь login → editor → edit → save → reload → Release → share.

## Status legend

`PLANNED` — запланировано; `IN_PROGRESS` — выполняется; `BLOCKED` — заблокировано;
`DONE` — подтверждено; `CANCELLED` — отменено.

## Task order

| ID | Title | Status | Priority | Depends on | Task |
| --- | --- | --- | --- | --- | --- |
| S0-01 | Clean install | DONE | P0 | None | [01](./01-clean-install.md) |
| S0-02 | Workspace baseline | DONE | P0 | S0-01 | [02](./02-workspace-baseline.md) |
| S0-03 | Local stack and HTTP smoke | DONE | P0 | S0-02 | [03](./03-local-stack-http.md) |
| S0-04 | Browser E2E harness | DONE | P0 | S0-03 | [04](./04-browser-harness.md) |
| S0-05 | Login and editor launch | DONE | P0 | S0-04 | [05](./05-login-editor.md) |
| S0-06 | Edit to share flow | DONE | P0 | S0-05 | [06](./06-edit-to-share.md) |
| S0-07 | Blocking defects | DONE | P0 | S0-01, S0-06 | [07](./07-defects.md) |
| S0-08 | Documentation and acceptance | DONE | P1 | S0-01, S0-07 | [08](./08-acceptance.md) |

## Sprint goal

Другой разработчик должен суметь установить зависимости, поднять изолированный
стенд, пройти основной пользовательский flow и найти свежие evidence reports.

## Definition of done

- Clean install, build, typecheck, unit, PostgreSQL, HTTP smoke и browser E2E
  подтверждены на зафиксированном snapshot.
- Основной flow пройден автоматически и вручную в Chromium/Chrome.
- Открытые блокеры имеют regression cases или перенесены в следующий спринт.

## Checks

- `npm ci --offline`
- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:http`
- `npm run test:e2e:browser`
- `git diff --check`

## Evidence and reports

Существующие отчёты S0 сохранены в [docs/verification/reports](../../docs/verification/reports/).
Новые task paths ниже служат единым индексом; исходные HTML-файлы не перемещаются.

- [S0 review](../../docs/verification/reports/s0-review.html)
- [S0-01 report](../../docs/verification/reports/s0-01.html)
- [S0-08 report](../../docs/verification/reports/s0-08.html)
