# S2-06.1 — P0: отдельная конфигурация полного редактора стилей

Status: PLANNED
Priority: P0
Depends on: None
Evidence: report
Report group: S2-style-editor

## Goal

Зафиксировать требование владельца от 2026-09-21: пользователь выбирает элемент
и редактирует любое поддерживаемое браузером CSS-свойство через панель уровня
GrapesJS. Каталог не является закрытым allowlist. Реализацию этого блока начинать
в начале S2; номер 06 сохраняет существующие ID и не означает низкий приоритет.

## Scope

- Создать отдельный `packages/editor-ui/src/styles/styles-config.ts`: секции,
  определения свойств, подписи, типы полей, options, units, min/max/step,
  подсказки, keywords, составные группы и ссылки на codecs. Компоненты не
  содержат собственных списков CSS-свойств.
- Типы вынести в `styles/types.ts`; renderer, состояние и codecs держать отдельно.
  Определение поля содержит UI id и реальное CSS property в kebab-case,
  discriminated union `input | select | color | number-unit | composite | stack`.
  Для select описать preset options и возможность произвольного CSS-значения.
- Отдельно описать UI default/placeholder: они не записываются в DOM при выборе
  элемента или раскрытии секции. Виртуальные поля вроде shadow-x не становятся
  CSS properties и не сериализуются самостоятельными операциями.
- Сверить весь `STYLES_LIST` и вложенные поля старого `lykar-lib`, включая
  закомментированные секции. Для каждого ключа указать новый control/codec,
  alias либо причину, почему это виртуальное поле. Ничего не потерять молча.
- Секции: Layout (display, flex, grid, gap, overflow); Size (все min/max);
  Space (margin/padding, физические и логические стороны); Position (inset,
  z-index); Typography; Background; Borders; Effects (opacity, shadows,
  transform, filter, transitions, animations); Advanced/custom properties.
- Пользовательские стили за пределами каталога доступны через добавление
  свойства и текстовое поле. Не тянуть полный CSS database в runtime.
- Определить `StyleFieldState`: authored/override value, computed value,
  priority, dirty, validation, affected properties, applicability hint.

## Acceptance criteria

- [ ] Добавление свойства/секции в конфигурацию не требует изменения renderer.
- [ ] Все прежние ключи имеют проверяемое соответствие новому каталогу.
- [ ] Font/color/flex/grid/spacing/size доступны явно, а не только через Advanced.
- [ ] Для неизвестного каталогу свойства предусмотрен text fallback; CSS custom
  properties сохраняют регистр. «Любой» означает CSS-декларации, поддерживаемые
  целевым браузером; неподдерживаемое значение получает объяснение.
- [ ] `flex-grow`, `order`, `opacity` не получают px; alias `borderRadiusC`
  сопоставлен с реальным `border-radius`, а не отдельным CSS-свойством.
- [ ] Реестр описывает UI и применимость, но не заменяет protocol/runtime validation.

## Checks

- `npm run typecheck`
- Schema/coverage test: соответствие legacy keys, уникальность id, корректность
  ссылок секций, отсутствие сериализации виртуальных полей.

## Expected deliverables

- Отдельная конфигурация, типы и матрица покрытия legacy → new editor.
- Описание расширения каталога одним свойством с input/select/color примерами.

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Notes

GrapesJS — ориентир возможностей панели, не обязательная зависимость. В этом
блоке редактируется выбранный элемент в текущем контексте. Селекторы классов,
псевдосостояния, media rules и создание @keyframes — отдельные контексты CSS,
а не дополнительные свойства; они остаются отдельным расширением roadmap.
Существующие animation-name и любые обычные animation properties доступны.
