# SERVICE-V1-03 — Deployment: схема, API и история активаций

Status: DONE
Priority: P0
Depends on: SERVICE-V1-02
Parallel wave: W3
Can run in parallel with: SERVICE-V1-12

Stage: E2 — S5: публикация, отключение и откат
Planning date: 2026-10-02

## Goal

Добавить атомарное назначение версии странице и безопасные повторные/конкурентные запросы.

## Problem solved

Release существует, но нет активной публикации и auditable Deploy/Disable/Rollback.

## Enables

- Получение production выбора runtime.
- Управление публикацией из Admin.

## Scope

- Добавить миграцию active deployment/activation revision и append-only actor/time/reason history без переписывания Release.
- Реализовать Deploy, Disable и Rollback для своей Page/Project; разрешения Owner/Admin и запрет для Editor/Viewer следуют принятому контракту.
- Определить optimistic revision и идемпотентность: lost response/retry не создают двойную активацию; конфликт возвращается явно.
- Добавить runtime resolve активной версии; решение доступа и manifest не публикуются через общий cache.
- Миграция существующих проектов сохраняет отсутствие deployment; Publish и завершение A/B его не создают.

## Parallel execution

Параллельно только с 12: здесь apps/api domain/routes/migrations, там CI и упаковка. Общие package scripts/lockfile принадлежат 12; если 03 требует их изменения, checkpoint сериализуется. Общий стенд не запускается конкурентно.

Hard prerequisites: SERVICE-V1-02. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [x] Deploy активирует только Release той же Page; Disable возвращает null, Rollback создаёт новую запись на прежний immutable Release.
- [x] Гонки двух вкладок дают один подтверждённый переход и явный conflict; повтор одного запроса не меняет результат.
- [x] Чужие Page/Release и недостаточные роли отклоняются; source Release/hash неизменен.
- [x] Fresh install и upgrade текущей БД проходят; ошибка миграции не оставляет частичную схему.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Существующие npm run test:e2e:http и релевантные API unit suites.
- `AGREED` — Будущие deployment integration cases: migration upgrade/failure, stale revision, lost response/retry, cross-project IDs и immutable history.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Миграция, deployment domain/repository/routes и API-контракт.
- PostgreSQL evidence по concurrency и upgrade.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/deployment.html`

Групповой report этапа E2; выделить отдельную запись/anchor `SERVICE-V1-03`, приложить machine evidence и ограничения. Запись SERVICE-V1-03 создана 2026-10-03; API/PostgreSQL/migration evidence приложены.

## Notes

- Новые API paths и номера миграций выбираются по состоянию дерева при исполнении; план не притворяется готовым API.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.

### Execution checkpoint — 2026-10-03

После повторной команды владельца «продолжи» начата независимая локальная реализация backend по подготовленной матрице режимов/прав. Это исключение из первоначального полного gate 02: домен/providers и численные budgets не используются этой задачей и остаются открытыми. 02 не объявляется DONE; 12 и внешняя эксплуатация не запускаются. Новые SLA/quotas/editor limits этим продолжением не утверждены.

### Acceptance — 2026-10-03

- Реализованы migration 010, domain/repository/routes и DI; API contract в apps/api/README.md.
- API build/typecheck PASS; npm run test:e2e:http — 31/31, 0 skipped, HTTP smoke PASS.
- Fresh migration CLI и isolated-schema upgrade/failure rollback подтверждены; CLI advisory-lock concurrency отдельно не тестировался.
- SDK/Admin пока не используют deployment API; это задачи 04/05. 02 остаётся IN_PROGRESS по открытым бюджетам/инфраструктуре.
- По запросу владельца тестовые подзадачи выполняли gpt-6.1-sol / medium; общий стенд запускался последовательно основным исполнителем.
