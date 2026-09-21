# S2-06.8 — P0: приёмка полного визуального редактирования стилей

Status: PLANNED
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

- [ ] Все legacy styles учтены; основные секции доступны визуально без ввода
  названий CSS вручную. Остальные поддерживаемые свойства доступны в Advanced.
- [ ] Для каждой группы есть browser evidence, для каждого типа control —
  полный путь сохранения и повторного воспроизведения.
- [ ] Произвольное свойство вне конфигурации, CSS variable и многослойный стиль
  проходят reload/share без подмены или потери значения.
- [ ] UI не ограничивается property/value; есть специализированные select,
  input, color, number-unit и composite/stack controls.
- [ ] Screenshots показывают общий panel, раскрытые секции и changed/reset state.
- [ ] Измеренный size/dependency report подтверждает выбранный лёгкий UI kit.
- [ ] S2-06.1…S2-06.7 выполнены; ограничения по target/browser и отдельным
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

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Notes

Планирование не является реализацией: все задачи остаются PLANNED до evidence.
Полный page builder (blocks/layers/DnD), class-wide rules, pseudo/media contexts
не маскируются статусом «все стили»: это отдельные продуктовые возможности.
