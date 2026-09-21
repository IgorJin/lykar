# S0-01 — Clean install

Status: DONE
Priority: P0
Depends on: None

## Goal

Зафиксировать snapshot и подтвердить чистую установку зависимостей без глобальных
пакетов и старых `node_modules`/`dist`.

## Scope

- Версии ОС, Node.js, npm и PostgreSQL CLI.
- `package.json`, `package-lock.json` и cold-start инструкция.
- Изолированная рабочая копия для установки.

## Acceptance criteria

- [x] `npm ci` проходит на проверяемом snapshot.
- [x] Lockfile не изменяется от установки.
- [x] PostgreSQL CLI prerequisites записаны.

## Checks

- `npm ci --offline`
- `git diff --check`

## Expected deliverables

- Baseline snapshot и версии среды.
- Инструкция установки в `docs/verification/s0-baseline.md`.

## Evidence and report

Report: `docs/verification/reports/S0/S0-01.html`

Existing evidence: `docs/verification/reports/s0-01.html`.

## Notes

Статус DONE подтверждён существующим S0 baseline report.
