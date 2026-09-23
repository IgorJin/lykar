# S2-06.5 — P0: произвольный CSS, сброс и диагностика применения

Status: IN_PROGRESS
Priority: P0
Depends on: S2-06.4, S2-03.4
Evidence: report
Report group: S2-style-editor

## Goal

Сделать требование «любой возможный стиль» проверяемым: каталог предоставляет
удобные controls, но не ограничивает набор поддерживаемых CSS-деклараций.

## Scope

- Advanced: поиск по каталогу, добавление property/value вне каталога, список
  authored overrides, редактирование/removal custom properties. Известные поля
  и Advanced используют одно состояние; одновременно не создают две правки.
- Поддержать CSS variables (с регистром имени), vendor-prefixed supported
  properties, calc/min/max/clamp/var, CSS-wide keywords, современные цвета,
  grid expressions, animation и filter без необходимости обновлять каталог.
- Проверять обычные декларации через browser CSS support/CSSOM и runtime safety
  policy. Custom properties не проверять как обычные типизированные значения;
  различать синтаксическую поддержку и успешное разрешение var() в контексте.
- После записи различать: accepted declaration, effective/computed result,
  невалидное значение, отсутствующее условие layout, вероятное перекрытие.
  width на inline, justify-content вне flex/grid не давать как ложный успех.
- Reset Lykar override восстанавливает состояние до override; remove authored
  declaration возвращает управление каскаду. Не подменять сброс значением 0,
  initial или вычисленным значением. Поведение с исходным inline фиксируется.
- Спроектировать совместимое представление удаления и priority в protocol/API,
  manifest validation, runtime и journal. Текущий setStyle поддерживает только
  property/value; не записывать '!important' частью value и не включать его
  автоматически. Legacy operations/manifests продолжают воспроизводиться.
- Unknown source при недоступном cross-origin stylesheet обозначать честно;
  не обещать точный CSS cascade inspector или автоматически повышать specificity.
- Для SVG определить поддержку style-bearing targets через capability check,
  а не только HTMLElement; unsupported targets/closed shadow roots/чужие iframe
  имеют явное ограничение. Поддержку декларации не путать с доступностью target.

## Acceptance criteria

- [ ] Свойство, отсутствующее в styles-config.ts, проходит input → preview →
  operation без изменения конфигурации, если его принимает целевой браузер.
- [ ] `--BrandColor`, `var(--BrandColor)`, clamp(), grid-template-columns,
  animation-name и поддерживаемое vendor property доступны через интерфейс.
- [ ] Invalid input не оставляет ложную applied operation и не теряет последний
  валидный preview. Неполный ввод хранится локально до завершения.
- [ ] Reset восстанавливает исходный inline priority либо отсутствие декларации;
  повторный reset идемпотентен. UI явно различает reset и удаление исходного inline.
- [ ] UI показывает принятый, но не влияющий на layout override; не делает
  категоричного вывода об источнике каскада без достаточных данных.
- [ ] Старый manifest, новый priority/removal и SVG capability проходят contract
  fixtures. CSS safety checks не исчезают ради unrestricted input.

## Checks

- `npm test`
- Browser cases: arbitrary property, custom variables, !important,
  unsupported value, invalid var resolution, reset/undo, SVG style target.
- Protocol/runtime/API compatibility tests для выбранного нового контракта.

## Expected deliverables

- Advanced CSS controls, cascade/reset semantics и объяснимые ошибки.
- Совместимый контракт priority/removal с миграционными заметками.

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Notes

Implementation 2026-09-22: Advanced accepts arbitrary browser-supported
properties and case-sensitive custom properties; protocol/runtime support
optional priority and SVG style-bearing targets. Browser validation rejects
unsupported values. Separate per-field actions now restore the pre-Lykar value
or remove the inline declaration. Cascade diagnostics and browser acceptance
for host ownership remain open. Browser coverage now verifies restoration of
an original inline `!important` declaration, select-driven edits with
undo/redo, raw `clamp()` values and authored CSS variables.
The active panel also compares computed style before and after preview and
warns when an accepted declaration leaves the computed value unchanged; this is
a signal to inspect applicability, cascade or variable resolution, not a claim
to identify the winning stylesheet rule.

Не обещать применение свойства, которое браузер не поддерживает, или доступ к
недоступному DOM. Все поддерживаемые декларации остаются редактируемыми через
raw input; отсутствие специального visual control не является запретом.
