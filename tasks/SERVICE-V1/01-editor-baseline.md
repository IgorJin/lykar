# SERVICE-V1-01 — Приёмка текущего редактора

Status: DONE
Priority: P0
Depends on: None
Parallel wave: W1
Can run in parallel with: None

Stage: E1 — Принять редактор и зафиксировать сервисный контракт
Planning date: 2026-10-02

## Goal

Получить воспроизводимый исходный срез с текущими изменениями панели и управления стилями.

## Problem solved

После S4 в рабочем дереве есть изменения редактора и новые tests; историческая приёмка не подтверждает их состояние.

## Enables

- Надёжную основу для сервисных сценариев и сравнения регрессий.

## Scope

- Зафиксировать HEAD e565328 и hash фактического рабочего дерева, включая untracked файлы редактора; сохранить чужие изменения.
- Проверить новые panel/view/drag/select/style-reset/ownership изменения и сквозной save/reload/undo; исправлять только подтверждённые дефекты при исполнении задачи.
- Перепроверить static и согласованные React/Vue сценарии; измерить исходные bundle sizes без перезаписи S1/S4 artifacts.
- Зафиксировать известные ограничения и открытые failures до начала расширения продукта.

## Parallel execution

Последовательно: editor-bridge, editor-ui, общий E2E harness и build outputs. Планирование не коммитит и не изменяет найденные правки.

Hard prerequisites: None. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [x] Текущая панель проходит редактирование, добавление, историю, клавиатуру, перемещение и сохранение; сайт сохраняет ширину.
- [x] Reset/undo/redo и reload не теряют правки и не затирают актуальные стили host.
- [x] Build/typecheck, релевантные unit/API/browser проверки выполнены на идентифицированном дереве; mandatory skip отсутствуют.
- [x] Предыдущие отчёты сохранены; размер editor и известное превышение старого budget показаны явно.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `UI`: UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения.
- `AGREED` — `COMMANDS`: Используем существующие npm run build/typecheck/test, test:e2e:http, test:e2e:browser, Playwright и временную PostgreSQL; новые команды отмечаем как будущие.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Существующие: npm run build; npm run typecheck; npm test; npm run test:e2e:http.
- `AGREED` — Существующие: npx playwright test tests/e2e/editor-design.spec.ts tests/e2e/editor-style-reset.spec.ts tests/e2e/style-editor-acceptance.spec.ts tests/e2e/persistence-recovery.spec.ts --project=chromium; relevant S4 conditional regression.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Отчёт о принятом дереве, дефектах и исходных измерениях.
- Принятый editor baseline для последующих задач.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/editor-contract.html`

Групповой report этапа E1; выделить отдельную запись/anchor `SERVICE-V1-01`, приложить machine evidence и ограничения. Запись SERVICE-V1-01 создана 2026-10-03; команды, source manifests, измерения и screenshots приложены.

## Notes

- DONE исторических S0–S4 не переносится автоматически на новую рабочую копию.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.

### Execution — 2026-10-03

- Build/typecheck PASS; unit 223 PASS (3 DB-only skip покрыты API 23/23 без skip).
- Browser 55/55 в Chromium/Firefox/WebKit; повтор screenshot suites 6/6; E2E typecheck PASS.
- Application source сохранён. Изменены только env overrides пути evidence в трёх E2E suites; старые S2 assets сохранены.
- Editor raw/gzip 276518/71977 bytes; legacy raw budget 100000 — FAIL, открытое решение 02.
- Визуальный просмотр desktop/mobile выполнен исполнителем; внешний пилот не проводился.
- Source-after SHA-256: `4aef7d15f25c94c4d44584edcda7d6ede780462e53d08c7511d86c7ebc6ebcd2`; scope/метод в source-after.json.
