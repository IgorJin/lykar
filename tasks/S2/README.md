# S2 — Надёжное ядро, сохранение и полный editor workflow

Status: DONE
Planning date: 2026-09-21

S2 превращает текущий replay/editor в надёжное ядро: target resolution становится
строгим, устаревшая async работа отменяется, цепочки команд получают ledger и
journal, а save восстанавливается после потери ответа. Последняя задача связывает
это с UI, Change Tree, undo/redo и ручным target repair. React/Vue adapters остаются
в S4, полный Admin/release/experiment/report flow — в S3.

Приоритетное требование владельца от 2026-09-21: полноценное визуальное
редактирование любого поддерживаемого CSS-свойства по образцу GrapesJS.
Блок **S2-06.1…S2-06.8 — P0**, обязательный для приёмки S2; это 8 новых задач,
всего в спринте 27. Каталог стилей — отдельный файл, controls — самописные
TypeScript/DOM + native input/select/color, без внешнего UI kit/framework runtime.
Конфигурацию и controls начинать первыми; интеграция ждёт только необходимых
core contracts. Номер 06 сохраняет существующие ID, а не откладывает UI в конец.

## Status legend

`PLANNED` — запланировано; `IN_PROGRESS` — выполняется; `BLOCKED` — заблокировано;
`DONE` — подтверждено; `CANCELLED` — отменено.

## Task order

| ID | Title | Status | Priority | Depends on | Task |
| --- | --- | --- | --- | --- | --- |
| S2-01.1 | Logical targets and versioned bindings | DONE | P0 | None | [01](./01-logical-targets.md) |
| S2-01.2 | Strict target resolution | DONE | P0 | S2-01.1 | [02](./02-strict-resolution.md) |
| S2-01.3 | Before-state, desired-state and drift | DONE | P0 | S2-01.2 | [03](./03-before-state-drift.md) |
| S2-01.4 | Compatibility fixtures and repair primitives | DONE | P0 | S2-01.3 | [04](./04-compatibility-repair.md) |
| S2-02.1 | PageSession ownership | DONE | P0 | S2-01.4 | [05](./05-session-ownership.md) |
| S2-02.2 | Async cancellation and generation checks | DONE | P0 | S2-02.1 | [06](./06-async-cancellation.md) |
| S2-02.3 | Cleanup and lifecycle regression matrix | DONE | P0 | S2-02.2 | [07](./07-cleanup-regression.md) |
| S2-03.1 | Operation identity and ledger | DONE | P0 | S2-02.3 | [08](./08-identity-ledger.md) |
| S2-03.2 | Dependency-aware replay | DONE | P0 | S2-03.1 | [09](./09-dependency-replay.md) |
| S2-03.3 | Journal and compare-and-restore | DONE | P0 | S2-03.2 | [10](./10-journal-compensation.md) |
| S2-03.4 | Bounded execution and protocol safety | DONE | P0 | S2-03.3 | [11](./11-bounded-execution.md) |
| S2-04.1 | Save contract and idempotency storage | DONE | P0 | S2-03.4 | [12](./12-save-contract.md) |
| S2-04.2 | Atomic write and retries | DONE | P0 | S2-04.1 | [13](./13-atomic-retries.md) |
| S2-04.3 | Client recovery after lost response | DONE | P0 | S2-04.2 | [14](./14-client-recovery.md) |
| S2-04.4 | Conflict UX and two tabs | DONE | P0 | S2-04.3 | [15](./15-conflict-ux.md) |
| S2-05.1 | Full command workflow and Change Tree | DONE | P1 | S2-04.4 | [16](./16-command-workflow.md) |
| S2-05.2 | Undo/redo and saved changes | DONE | P1 | S2-05.1 | [17](./17-undo-redo.md) |
| S2-05.3 | Manual target repair | DONE | P1 | S2-05.2 | [18](./18-target-repair.md) |
| S2-05.4 | Overlay, accessibility and editor acceptance | DONE | P0 | S2-05.3, S2-06.8 | [19](./19-editor-acceptance.md) |
| S2-06.1 | Отдельная конфигурация всех стилей и legacy coverage | DONE | P0 | None | [20](./20-style-schema.md) |
| S2-06.2 | Самописные input/select/color и минимальный UI kit | DONE | P0 | S2-06.1 | [21](./21-native-style-controls.md) |
| S2-06.3 | Полный StylesSection в активном editor-bridge | DONE | P0 | S2-06.1, S2-06.2, S2-02.2, S2-03.3 | [22](./22-style-panel-integration.md) |
| S2-06.4 | Composite/stack: spacing, borders, shadows, backgrounds, effects | DONE | P0 | S2-06.3 | [23](./23-composite-style-editing.md) |
| S2-06.5 | Любой CSS, custom properties, reset, priority и диагностика | DONE | P0 | S2-06.4, S2-03.4 | [24](./24-arbitrary-css-reset.md) |
| S2-06.6 | Транзакции полей, undo/redo, save/reload | DONE | P0 | S2-06.5, S2-04.4, S2-05.2 | [25](./25-style-transactions-persistence.md) |
| S2-06.7 | Lazy UI, зависимости и измеримый бюджет веса | DONE | P0 | S2-06.5 | [26](./26-style-editor-budget.md) |
| S2-06.8 | Browser acceptance полного редактора стилей | DONE | P0 | S2-06.6, S2-06.7 | [27](./27-style-editor-acceptance.md) |

## Sprint goal

Editor безопасно применяет декларативные команды к правильным элементам, не
переносит работу между pages/routes, не создаёт дубли при replay/save и даёт
пользователю объяснимый способ исправить drift.
Пользователь меняет оформление через секции и специализированные поля, а любое
поддерживаемое CSS-свойство вне каталога — через Advanced без изменения кода.

Final acceptance 2026-09-23: all 27 task records are DONE. Full browser suite
passed 32/32 across Chromium, Firefox and WebKit; unit, HTTP/PostgreSQL,
build, typecheck, npm consumer and production budget audit passed. The active
SDK script/ESM editor covers all style groups, command/replay, saved undo,
manual repair and share. See the [style editor report](../../docs/verification/reports/S2/s2-style-editor.html)
and [editor acceptance report](../../docs/verification/reports/S2/s2-editor-acceptance.html).
Remaining scope boundaries are inline declarations on accessible static/SSR DOM;
CSS rule contexts and framework reconciliation are deferred as documented.

## Definition of done

- Resolver различает unique, missing, ambiguous и invalid; first match запрещён.
- PageSession владеет async work и проверяет generation перед mutation/report.
- Executor поддерживает identity новых elements/text nodes, dependencies,
  partial failure, journal и compare-and-restore.
- Save идемпотентен, revision conflicts видны, lost response и две вкладки не
  дублируют операции и не теряют pending changes.
- Editor UI поддерживает команды, Change Tree, undo/redo, repair и ограничения
  copy/add; static/SSR browser matrix подтверждена.
- Полный Style Manager работает в SDK, а не только в standalone lykar-lib:
  отдельная конфигурация, input/select/color/number-unit/composite/stack,
  все legacy styles, arbitrary CSS и custom variables, reset и сохранение.
- Панель синхронизирована с выбором и undo/redo; чтение не создаёт operations.
- Native UI не добавляет third-party UI runtime; catalog/controls/codecs
  находятся только в lazy editor. Проверены budgets и полный edit-to-share flow.

## Execution order and dependency notes

Для core-блоков S2-01…S2-05 порядок подзадач обязателен по таблице dependencies.
Внешний prerequisite — приёмка S1, уже завершённая; `None` означает отсутствие
внутриспринтовых зависимостей. S2-02.1 начинается после resolver,
S2-03.1 после lifecycle, S2-04.1 после executor, а S2-05.1 после persistence.
Приоритет старта: S2-06.1 → S2-06.2, затем core chain и интеграция S2-06.3
сразу после её dependencies. Конфигурация/controls могут идти параллельно ядру;
рабочий preview нельзя подключать в обход lifecycle/journal. Далее S2-06.4 →
S2-06.5; S2-06.7 допускается параллельно persistence/истории S2-06.6.
S2-05.1/05.2 — необходимые prerequisites style save/undo, их нельзя откладывать
из-за P1, когда они блокируют P0. S2-06.8 и manual repair сходятся в S2-05.4.
S2-05.4 — итоговая интеграционная точка; спринт не принимается без S2-06.8.

### Границы «любого стиля» и экономичный UI

Конфигурация описывает удобные preset controls, а не закрывает множество CSS.
Для любого поддерживаемого браузером свойства и `--custom-property` есть raw
input, включая выражения и значения вне select options. Неизвестный codec не
имеет права разрушить валидное значение. Основные секции доступны визуально;
Advanced не подменяет всю панель одним property/value.

Рекомендуемая поставка — маленькие DOM controls с собственным CSS в Shadow DOM,
нативные select/input/color и inline SVG. React/Preact в legacy/admin не означает,
что нужно добавлять их в активный editor asset. Рабочий целевой прирост UI —
≤20 KiB gzip, UI-related прирост visitor entry — 0 bytes; это предложенные
budgets, которые требуется измерить, а не заявление о достигнутом размере.

Селекторы классов, pseudo states, media rules и создание @keyframes — отдельные
CSS-rule contexts; они не входят в inline declaration coverage. Breakpoints
остаются FUT-06. Blocks/layers/DnD и framework adapters также не добавляются
скрыто в scope этого требования.

## Checks

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:http`
- `npm run test:e2e:browser`
- PostgreSQL transaction/concurrency checks для S2-04
- Browser fixtures для ambiguity, route races, partial failure, recovery и repair

## Evidence and reports

| Group | Tasks | Evidence |
| --- | --- | --- |
| `S2-target-lifecycle` | S2-01.1…S2-02.3 | [group report](../../docs/verification/reports/S2/s2-target-lifecycle.html) |
| `S2-replay-safety` | S2-03.1…S2-03.4 | [group report](../../docs/verification/reports/S2/s2-replay-safety.html) |
| `S2-persistence-recovery` | S2-04.1…S2-04.4 | [group report](../../docs/verification/reports/S2/s2-persistence-recovery.html) |
| `S2-editor-acceptance` | S2-05.1…S2-05.4 | [group report](../../docs/verification/reports/S2/s2-editor-acceptance.html) |
| `S2-style-editor` | S2-06.1…S2-06.8 | [group report](../../docs/verification/reports/S2/s2-style-editor.html) |

Reports are created once after the group reaches its acceptance gate. The task
files point to the group report; they do not imply one HTML file per task.
