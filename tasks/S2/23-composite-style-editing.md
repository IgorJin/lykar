# S2-06.4 — P0: составные стили и группы свойств

Status: IN_PROGRESS
Priority: P0
Depends on: S2-06.3
Evidence: report
Report group: S2-style-editor

## Goal

Редактировать отступы, границы, фон, тени и эффекты специализированными полями,
сохраняя CSS-смысл и все части, которые пользователь не изменял.

## Scope

- Codecs вынести в `packages/editor-ui/src/styles/codecs/`; связь group → codec
  задаёт styles-config.ts. Каждый codec имеет parse/serialize и raw fallback.
- Margin/padding/inset: четыре стороны, linked/unlinked, логические свойства.
  Border: width/style/color; radius: общий, четыре угла и raw эллиптический вид.
  Сохранять порядок shorthand/longhand и их реальные затронутые декларации.
- Box/text shadow: список слоёв, add/remove/reorder; отдельные x/y/blur/spread,
  color и inset там, где допустимо. `boxShadowH` и подобные UI keys не попадают
  в protocol; результат — настоящее box-shadow/text-shadow.
- Background: color, image URL/gradient, position/size/repeat/attachment и
  слои; изменение одного параметра не удаляет другие слои и цвет.
- Transform/filter: редактирование упорядоченных функций и raw выражения.
  Transition/animation: отдельные longhands и список значений с сохранением
  времён, easing и порядка. Animation-name может ссылаться на существующие
  keyframes; создание @keyframes не входит в декларационный редактор.
- Не разделять значения через простой split(',')/split(' '): учитывать
  функции, кавычки, escapes, вложенность и запятые в rgb()/gradients/cubic-bezier.
- Если codec не разбирает допустимый CSS без потерь, оставить полный raw input
  доступным и не заполнять пустоты выдуманными defaults.

## Acceptance criteria

- [ ] Linked padding меняет четыре стороны как одно действие; unlink сохраняет
  индивидуальные значения, в том числе отличающиеся единицы.
- [ ] Правка цвета второго shadow сохраняет первый слой, offsets и inset.
- [ ] Изменение background-size не стирает gradient, URL и background-color.
- [ ] Transform function order и easing с запятыми переживают parse/serialize.
- [ ] `var()`/неразобранная допустимая конструкция доступна в raw-режиме без
  разрушения исходной строки при открытии формы.
- [ ] Round-trip проверки сравнивают семантику в браузере; допустимая CSSOM
  нормализация пробелов/формата цвета не считается потерей значения.
- [ ] Undo восстанавливает затронутые shorthand/longhand declarations и priority,
  а не только последнюю строку shorthand; транзакционный flow закрывает S2-06.6.

## Checks

- `npm test`
- Codec round-trip и browser fixtures: multi-shadow, multi-background,
  gradients, transforms, logical spacing, shorthand/longhand interaction.

## Expected deliverables

- Composite/stack controls и codecs, подключённые через отдельную конфигурацию.
- Набор реальных CSS examples, включая сложные raw fallback cases.

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Notes

Implementation 2026-09-23: conservative shorthand decoders now populate the
spacing, border and radius controls. Spacing sides and radius corners write
their longhands; a simple border part rewrites the complete border shorthand
to keep its other parts and priority. Ambiguous full-shorthand edits stay in
raw mode. Background and transform layer
lists split only at top-level commas/whitespace, preserving nested functions,
quotes and function order. Editing the background shorthand is blocked when
separate `background-*` declarations could be reset. Full per-layer
position/size/color editing and lossless mixed-background transactions remain
open. Margin/padding now expose linked/unlinked controls; linked edits submit
the physical longhands as one `previewGroup` history unit and preserve each
side's `!important` priority. Unlinking does not rewrite distinct side values
or units. CSSOM-synthesized longhands are no longer treated as separately
authored declarations. The focused codec and editor tests passed, as did the
representative Chromium style scenario; the full codec matrix remains open.

Не писать общий CSS parser ради нескольких controls и не тащить тяжёлый parser
в browser asset. Небольшие специализированные codecs + lossless raw fallback
достаточны для сохранения возможности редактировать любой стиль.
