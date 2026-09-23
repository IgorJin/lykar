# S2-06.6 — P0: история действий и сохранение всех стилей

Status: IN_PROGRESS
Priority: P0
Depends on: S2-06.5, S2-04.4, S2-05.2
Evidence: report
Report group: S2-style-editor

## Goal

Любое поле стилей проходит единый цикл preview → undo/redo → save → reload без
потери значений, группировки и связи с выбранным элементом.

## Scope

- Ввести edit transaction begin/update/commit/cancel поверх общего journal:
  набор цифр, color drag или изменение linked spacing — одно пользовательское
  действие. Следующее отдельное действие над тем же свойством — новый undo step.
- Throttle визуального preview по кадрам, trailing final commit, flush перед
  save. Escape восстанавливает состояние до действия; invalid intermediate
  input не заменяет последнюю корректную операцию и не очищает redo без причины.
- Composite operations применяются одной транзакцией с компенсацией при ошибке
  середины группы. Не допускать частичного linked padding после отказа.
- Ключ изменения учитывает target, page generation, affected properties и edit
  transaction; строка selection:property не объединяет раздельные действия.
- Подключить новые поля к общему save/recovery/idempotency flow. Отмена уже
  сохранённого изменения создаёт новую pending компенсацию; Release неизменяем.
- Панель отражает preview, undo, redo, saved/recovered state и конфликты;
  асинхронный ответ старого target/route не перезаписывает текущий field draft.
- Journal учитывает ownership и взаимодействие shorthand/longhand: не затирает
  новые значения host, сохраняет приоритеты и отсутствие деклараций.

## Acceptance criteria

- [ ] 50 событий ползунка/цвета дают один завершённый undo step; повторное
  отдельное редактирование того же поля даёт следующий step.
- [ ] Save во время активного поля сохраняет последнее валидное завершённое
  значение; не сохраняет устаревший preview из очереди.
- [ ] Undo/redo для linked spacing и multi-layer shadow атомарны и обновляют UI.
- [ ] Обычный, составной, arbitrary CSS и variable сохраняются после reload.
- [ ] Lost response/retry и две вкладки не дублируют операции; локальный field
  draft не исчезает без объяснения при conflict.
- [ ] Undo saved style → save → reload восстанавливает нужный результат без
  изменения старого Release; более поздний host change защищён ownership check.

## Checks

- `npm test`
- `npm run test:e2e:browser`
- History/save fixtures для input bursts, Escape, mid-transaction failure,
  selection race, flush, reload, lost response и saved compensation.

## Expected deliverables

- Единый transaction adapter для всех style controls и regression fixtures.
- Документированные boundaries commit/cancel/save и сохранённых компенсаций.

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Notes

Implementation 2026-09-22: text field live preview is grouped by focus
transaction, frame-throttled, and flushed on change/blur/save; Escape cancels
the active preview. Unit coverage proves 50 input events compact to one undo
step, and browser coverage proves undo/save/reload for several style types.
An in-progress field transaction is bound to the element selected at focus;
the selection-race regression prevents a stale input or Escape from changing
the newly selected element.
`EditorSession.previewGroup` now provides one pending history batch with reverse
compare-and-restore on partial failure. Linked margin/padding controls use this
path, so their longhand operations undo/redo together and enter the same save
batch. A later host edit to one group member blocks the whole local undo
without changing the other members. Saved-group compensation, latency
measurements and the full
browser failure matrix remain open.

Эта задача расширяет общий механизм S2-05.2 для style controls; не создаёт
отдельные history/persistence системы внутри editor-ui.
