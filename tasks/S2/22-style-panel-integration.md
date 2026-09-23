# S2-06.3 — P0: StylesSection в активном editor-bridge

Status: DONE
Priority: P0
Depends on: S2-06.1, S2-06.2, S2-02.2, S2-03.3
Evidence: report
Report group: S2-style-editor

## Goal

Пользователь открывает редактор через SDK, выбирает элемент и получает полный
конфигурационный Style Manager вместо единственной пары CSS property/value.

## Scope

- Монтировать UI из `editor-ui` в существующий ShadowRoot `SidePanel` активного
  `editor-bridge`. Не подменять SDK устаревшим standalone `lykar-lib`.
- Сделать style adapter: выбранный logical target + page generation → snapshot
  → field draft → operation preview через общий EditorSession/executor.
  Прямые mutations из UI и второй CommandService запрещены.
- При выборе читать inline/authored overrides и computed values. Из stylesheet
  нельзя всегда восстановить исходное выражение: вычисленное значение помечать
  как computed, не выдавать его за точный исходный CSS source.
- Подписать панель на selection, preview, undo/redo, restore, repair и удаление
  target. Смену выбора проверять generation token; отложенная правка не попадает
  на следующий выбранный элемент.
- Состояния панели: loading, no selection, selected, target missing, restore
  failed. Для restore error дать понятный retry/recovery, не разрешая правки
  несогласованного draft и не оставляя вечное «выберите элемент».
- Показать label выбранного элемента и переход к редактируемому родителю;
  display:none не должен делать выбранный target недоступным для сброса.
- Секции и поиск позволяют найти любое поле; dirty indicator отражает
  собственную правку, а не просто наличие computed value.

## Acceptance criteria

- [x] Через штатный script/npm editor launch доступны все секции конфигурации.
- [x] Чтение/раскрытие панели не создаёт operations и не меняет host DOM styles.
- [x] Font size, color, width, padding, display и flex/grid меняются реальными
  полями с немедленным preview и корректным updated state.
- [x] Undo/redo и выбор другого элемента обновляют значения и dirty indicators.
- [x] Selection race, detached target, failed restore имеют явное состояние;
  предыдущая асинхронная правка не записывается на другой target/page.
- [x] Legacy `StylesSection` и старая история не входят второй копией в SDK.

## Checks

- `npm run test --workspace @lykar/editor-bridge`
- `npm run test:e2e:browser`
- Script/npm fixtures: открытие, выбор, parent selection, restore failure/retry,
  hide/reset element, rapid selection switching.

## Expected deliverables

- Конфигурационная панель в реальном SDK и единственный adapter к EditorSession.
- Selection/read-state integration tests и screenshots основных секций.

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Notes

Final acceptance 2026-09-23: script and ESM SDK paths expose all sections and the shared EditorSession adapter. Browser/unit checks cover read-only panel interaction, selection races, restore diagnostics, undo refresh and target isolation.
