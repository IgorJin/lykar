# SERVICE-V1-14 — Надёжные фоновые письма и очистка данных

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-13, SERVICE-V1-07
Parallel wave: W13
Can run in parallel with: None

Stage: E5 — S6: доставка и эксплуатация
Planning date: 2026-10-02

## Goal

Автоматизировать повторную отправку и retention без потери работы при рестарте.

## Problem solved

Есть ручной prune command и синхронная email граница; нет завершённого планировщика/jobs.

## Enables

- Регулярную эксплуатацию без ручного запуска скриптов.
- Мониторинг отказов и restore background state.

## Scope

- Ввести job runner и durable work state для email retries/retention; использовать выбранный storage без неоправданной замены стека.
- Определить claim/lease/retry/backoff/dead-letter, concurrency и обработку рестарта.
- Сохранять hash/expiry semantics токенов и ограниченное хранение секретного email payload; не продлевать ссылку скрыто на retry.
- Планировать analytics prune 90 дней по текущей семантике; aggregates сохраняют исторические totals.
- Добавить безопасный операторский retry и состояние последнего успешного prune.

## Parallel execution

Единый владелец migrations/jobs/email integration; аудит удаления 15 начинается после фиксации job lifecycle.

Hard prerequisites: SERVICE-V1-13, SERVICE-V1-07. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Два workers не выполняют один job как две независимые операции; crash/restart не теряет очередь.
- [ ] Повтор email send имеет определённую семантику delivery; expired jobs не отправляют устаревшую ссылку.
- [ ] Prune не меняет агрегированные отчёты и не удаляет свежие events.
- [ ] Failed/stuck jobs доступны мониторингу и повторному запуску без секретов.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.
- `AGREED` — `OPS`: Эксплуатация: тестовая среда, реальные тестовые письма, обновление версии, резервная копия/восстановление, фоновые задачи и сигнал о сбое.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Будущие PostgreSQL lease/claim/retry/crash cases; controlled provider failure.
- `AGREED` — Существующий prune-analytics код через будущий scheduler integration; проверить totals до/после retention.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Runner/scheduler, durable jobs и эксплуатационные команды.
- Retry/retention evidence.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/operations.html`

Групповой report этапа E5; выделить отдельную запись/anchor `SERVICE-V1-14`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- 90-day analytics retention — существующий контракт; новый срок хранения operational payload определяется отдельно в 02.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.


## Контракт из 07 (2026-10-05)

Использовать durable email_deliveries и стабильный server-issued delivery ID.
Replay accepted — no-op; pending/unknown требует reconciliation, автоматическая
повторная отправка запрещена. Rejected также не переотправляется тем же ID;
новый явный запрос проходит request policy и получает новый ID. Quota reservations
не возвращаются после ошибки. Ledger не хранит payload/token: очередь должна отдельно
решить bounded secret payload retention, expiry и сверку результата provider.
Добавить очистку expired inactive email_budget_reservations и retention ledger;
не удалять pending/unknown до определения безопасной семантики reconciliation.
