# S2-05.4 — Overlay, accessibility и итоговая editor acceptance

Status: BLOCKED
Priority: P0
Depends on: S2-05.3, S2-06.8
Evidence: report
Report group: S2-editor-acceptance

## Goal

Закрыть browser acceptance полного editor workflow и подтвердить, что panel/overlay
безопасны для host page в заявленной static/SSR matrix.

## Scope

- Shadow DOM/style isolation.
- Hover/selection, focus, keyboard, resize, zoom и nested scroll.
- Desktop/mobile viewport fixtures.
- Copy/add limitation messaging и full edit-to-share regression.
- Приоритетный Style Manager из S2-06: отдельный каталог, все типы полей,
  произвольный CSS, reset, save/reload и lightweight lazy delivery.

## Acceptance criteria

- [ ] Editor nodes не становятся targets и не входят в source snapshot.
- [ ] Panel работает при host CSS, resize, zoom, keyboard navigation и nested scroll.
- [ ] Desktop/mobile evidence фиксирует проверенные viewport sizes.
- [ ] Copy/add объясняют отсутствие handlers, component state и business logic.
- [ ] Full edit → save → reload → Release → share проходит с чистым visitor context.
- [ ] Race, partial failure, lost response, conflict и repair regressions повторены.
- [ ] Непроверенные framework/browser режимы явно перечислены в S2 report.
- [ ] S2-06.8 принят: полный Style Manager доступен в script/npm SDK, а не
  только пара property/value или старый standalone editor.
- [ ] Итоговый editor report ссылается на style coverage/budget evidence;
  без него S2 не получает DONE.

## Checks

- `npm test`
- `npm run test:e2e:http`
- `npm run test:e2e:browser`
- Manual Chrome command/repair/keyboard pass

## Expected deliverables

- Final editor browser suite and evidence.
- S2 verification report and updated limitations.

## Evidence and report

Report: `docs/verification/reports/S2/s2-editor-acceptance.html`

## Notes

React/Vue reconciliation и cooperative integration выполняются в S4; X2 validator остаётся отдельной веткой.

Blocked 2026-09-22: Shadow DOM isolation, responsive panel semantics, keyboard
labels, editor-root exclusion and static copy/add limitations are implemented.
Final acceptance cannot be claimed while required dependency S2-06.8 remains
PLANNED, and the local Chromium suite still needs an approved 127.0.0.1 run.
