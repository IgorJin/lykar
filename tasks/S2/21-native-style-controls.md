# S2-06.2 — P0: самописный минимальный UI kit для стилей

Status: DONE
Priority: P0
Depends on: S2-06.1
Evidence: report
Report group: S2-style-editor

## Goal

Получить удобную панель как у GrapesJS с минимальной стоимостью доставки.
Предпочтительное решение: TypeScript + DOM API + небольшой CSS внутри Shadow
DOM, без внешнего UI kit и без нового framework runtime в editor asset.

## Scope

- В `packages/editor-ui/src/controls/` создать FieldRow, TextInput, SelectInput,
  ColorInput, NumberUnitInput, Toggle/Button, Section, PropertySearch и
  ResetButton. Native input/select/button/details использовать везде, где
  их поведения достаточно. Это scoped editor controls, не универсальная UI library.
- Общий lifecycle: create/update/dispose и события begin/input/commit/cancel.
  Компоненты не знают о DOM target, HTTP и истории; внешние значения обновляются
  без потери focus, caret, незавершённого ввода и IME composition.
- Select использует нативный select для preset options и свободное поле для
  custom value: var(), inherit, нестандартный font-family и другие значения.
- Text input поддерживает ввод, Enter для завершения и Escape для отмены.
  NumberUnitInput поддерживает знак, дробь, unitless, keywords и raw expression;
  не пытается разбить calc()/clamp()/var() на число и единицу.
- ColorInput: native color swatch для представимых цветов плюс текстовый ввод
  CSS color и прозрачности. rgba/hex-alpha/currentColor/var()/современные color
  functions не преобразуются молча в непрозрачный hex. Непредставимый swatch
  не меняет исходное значение; внешний color-picker не подключается.
- Собственный CSS с переменными размеров/цветов, inline SVG только нужных иконок;
  без icon pack, webfont, CSS-in-JS runtime, animation library и внешнего CSS CDN.
- Доступные labels, keyboard focus, aria-expanded/invalid/describedby, ошибки
  рядом с полем, предупреждение перед display:none. Popup остаётся в editor root.
- Отрисовывать тела секций по раскрытию; обновлять затронутые поля, а не
  пересоздавать панель на каждый input. Поиск открывает соответствующую секцию.

## Acceptance criteria

- [x] Input/select/color работают мышью и клавиатурой, значения сохраняются при
  переключении preset/custom и повторном раскрытии секции.
- [x] `300ms`, `1.5rem`, `auto`, `0`, `-12px`, `calc(100% - 2rem)` проходят
  round trip без rem→em, ms→s, добавления единицы к keyword и потери знака.
- [x] Прозрачный цвет и var(--brand) не меняются от открытия picker/панели.
- [x] Ввод на IME не коммитит промежуточную композицию; внешнее обновление
  не стирает введённый draft без завершения/отмены сессии поля.
- [x] Нет новой third-party UI/runtime зависимости; библиотека работает
  независимо от framework host page. Dev-only tooling считается отдельно.
- [x] Host CSS не меняет controls, editor controls не выбираются inspector.

## Checks

- `npm run typecheck`
- Control interaction tests и browser pass: keyboard, IME, color alpha,
  preset/custom, hostile host CSS, narrow viewport.

## Expected deliverables

- Минимальные DOM-компоненты, CSS и локальная fixture всех типов полей.
- Документированный control contract для renderer и style bridge.

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Notes

Final acceptance 2026-09-23: native controls and lifecycle contract are documented in `packages/editor-ui/src/controls/README.md`. Unit/browser coverage includes keyboard, IME, color/raw values, host isolation and narrow viewport. Production audit found no external UI runtime.
