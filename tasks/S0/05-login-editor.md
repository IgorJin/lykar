# S0-05 — Login and editor launch

Status: DONE
Priority: P0
Depends on: S0-04

## Goal

Проверить локальный и magic-link вход, открытие editor через реальный Admin click
и корректное поведение при отсутствии editor capability.

## Scope

- Admin login and session reload.
- One-use magic link.
- Popup/editor launch and playground recovery link.

## Acceptance criteria

- [x] Local owner login и reload сохраняют рабочую сессию.
- [x] Magic link создаёт сессию и повторно не используется.
- [x] Admin click открывает видимую editor panel.
- [x] Отсутствие capability ведёт на рабочую Admin login page.

## Checks

- `npm run test:e2e:browser`
- `npm run test:e2e:http`

## Expected deliverables

- Browser regression cases для login/editor launch.

## Evidence and report

Report: `docs/verification/reports/S0/S0-05.html`

Existing evidence: `docs/verification/reports/s0-05.html`.

## Notes

Статус DONE подтверждён существующим S0 baseline report.
