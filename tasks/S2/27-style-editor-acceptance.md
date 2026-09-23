# S2-06.8 — P0: приёмка полного визуального редактирования стилей

Status: DONE
Priority: P0
Depends on: S2-06.6, S2-06.7
Evidence: report
Report group: S2-style-editor

## Goal

Подтвердить требование владельца через пользовательский сценарий. Наличие
setStyle API, пары property/value или только unit tests не закрывает редактор.

## Scope

- Browser matrix связывает каждую группу styles-config с видимыми controls и
  каждый тип поля с preview/undo/redo/reset/save/reload. Отдельно доказать
  произвольное свойство вне каталога, custom variables и raw fallback.
- Fixture: heading, link, image, inline span, flex/grid, вложенный контейнер,
  исходные inline !important, inherited values, multi-shadow/background,
  SVG styling и элементы с отсутствующим/удалённым target.
- Пройти штатный script и npm SDK launch; проверка старого standalone lib не
  заменяет проверку активного editor bundle.
- Сценарии: открыть → выбрать → увидеть значения → изменить типографику,
  размер, spacing, фон, границы, эффекты → undo/redo → сохранить → reload →
  Release/share в чистом visitor context.
- Accessibility/host compatibility: keyboard-only, labels, focus, Escape,
  zoom, narrow viewport, nested scroll, hostile CSS, selection race, restore
  error/retry. Не объявлять поддержку непроверенных framework roots.
- Проверить lossless handoff simple ↔ raw controls, invalid input, каскад,
  ownership conflict и полное отсутствие mutations при чтении панели.
- Итоговый budget/dependency audit на production assets, включая изменение
  веса после S2-06.6. Один групповой HTML report; не создавать report на поле.

## Acceptance criteria

- [x] Все legacy styles учтены; основные секции доступны визуально без ввода
  названий CSS вручную. Остальные поддерживаемые свойства доступны в Advanced.
- [x] Для каждой группы есть browser evidence, для каждого типа control —
  полный путь сохранения и повторного воспроизведения.
- [x] Произвольное свойство вне конфигурации, CSS variable и многослойный стиль
  проходят reload/share без подмены или потери значения.
- [x] UI не ограничивается property/value; есть специализированные select,
  input, color, number-unit и composite/stack controls.
- [x] Screenshots показывают общий panel, раскрытые секции и changed/reset state.
- [x] Измеренный size/dependency report подтверждает выбранный лёгкий UI kit.
- [x] S2-06.1…S2-06.7 выполнены; ограничения по target/browser и отдельным
  CSS-rule contexts перечислены явно. Итоговая S2-05.4 зависит от этой задачи.

## Checks

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:http`
- `npm run test:e2e:browser`
- Ручной проход style editor на настоящем SDK и итоговый production budget audit.

## Expected deliverables

- Style editor acceptance matrix, browser suite и screenshots.
- Групповой report с coverage, bundle cost, совместимостью и оставшимися рисками.

## Prepared browser scaffold

`tests/e2e/style-editor-acceptance.spec.ts` drives the active SDK panel on the
seeded `/pricing` page and creates an isolated draft for the run. The matrix is
representative across every configured section and each distinct control shape;
it is not evidence that the full acceptance gate has passed.

| Section | Representative control / behavior |
| --- | --- |
| Layout | `display` select with live preview |
| Size | `width` number-unit field; Escape cancel, Enter commit, undo/redo/reset |
| Space | Top margin composite part |
| Position | `position` select |
| Typography | Color swatch plus raw `var(--BrandAccent)` value |
| Background | Raw gradient field |
| Borders | Per-corner radius composite |
| Effects | Multi-layer shadow edit preserving the other layer |
| Advanced | Catalog select, arbitrary `hyphens`, case-sensitive custom variable |

The scenario changes selection between the heading, its parent, and a link,
then back to the heading; it applies host-page CSS that attempts to override
native controls, checks the panel at 360px width, saves and reloads the draft,
publishes it, and opens the share in a separate visitor context. It rechecks
the representative declarations after reload and in the visitor. On a
successful run, Playwright attaches these visual states:
`style-editor-overall.png`,
`style-editor-typography-section.png`, `style-editor-width-changed.png`, and
`style-editor-width-reset.png`.

The focused scenario passed in Chromium on 2026-09-23, including save, reload,
publish and visitor share; Playwright attached all four planned screenshots.
This is representative coverage, while S2-06.6 transaction/persistence
acceptance and S2-06.7 delivery/budget evidence remain prerequisites. Keep this
task `PLANNED` until the complete cross-browser/SDK matrix and shared report
are produced.

The focused scenario runs with
`npm run test:e2e:browser -- tests/e2e/style-editor-acceptance.spec.ts`; when
prerequisites are ready, run the full acceptance commands above. The existing
`tests/e2e/style-editor.spec.ts` remains complementary coverage.

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Notes

Final acceptance 2026-09-23: script and ESM acceptance plus composite/style/host matrix passed in Chromium, Firefox and WebKit; all screenshots and production budget measurements are linked in the group report.
