# S1-02.1 — Rollup artifact entries

Status: DONE
Priority: P1
Depends on: S1-01.4
Evidence: report
Report group: S1-distribution

## Goal

Собрать независимые IIFE, ESM, declarations и lazy editor entries для script/npm delivery.

## Scope

- Rollup build entries для SDK runtime и editor.
- `index.js`, `index.d.ts`, `lykar.iife.js`, `editor.iife.js` и ESM chunks.
- Package `exports`, `files`, CSS/assets и source maps.
- Исключение framework UI и Playwright из visitor bundle.

## Acceptance criteria

- [x] IIFE запускается без bundler.
- [x] ESM и declarations доступны через package exports.
- [x] Editor собран отдельным lazy asset/entry.
- [x] Visitor bundle не содержит React/Vue/Preact/Playwright.
- [x] Build set воспроизводимо создаётся из чистого checkout.

## Checks

- `npm run build`
- `npm run typecheck`
- Artifact manifest inspection
- Bundle dependency inspection

## Expected deliverables

- Rollup config и artifact output.
- Обновлённые package manifests.

## Evidence and report

Report: `docs/verification/reports/S1/s1-distribution.html`

## Notes

Сборка Admin/API может сохранить собственный инструмент; эта задача покрывает library distribution.

Результат: packages/sdk/rollup.config.mjs собирает ESM/IIFE, declarations и
source maps; visitor bundle проверен по dependency/build inspection.
