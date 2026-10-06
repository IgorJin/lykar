# SERVICE-V1-13 — Лимиты сервиса и безопасная диагностика

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-11, SERVICE-V1-12
Parallel wave: W12
Can run in parallel with: None

Stage: E5 — S6: доставка и эксплуатация
Planning date: 2026-10-02

## Goal

Ограничить злоупотребления и неконтролируемый расход ресурса без нарушения сайта клиента.

## Problem solved

Public auth, resolve и analytics требуют контролируемого поведения при большом числе запросов; лимиты пока не оформлены.

## Enables

- Эксплуатацию регистрации и public runtime.
- Предсказуемую работу jobs и monitoring.

## Scope

- Ввести согласованные auth/resend/resolve/analytics rate limits и базовые project/storage/manifest quotas без платёжного движка.
- Выбрать ключи лимитов, справедливость нескольких tenants, expiry и consistency для выбранной инфраструктуры.
- Определить 429/backoff/retry; runtime limit/error оставляет исходную страницу; analytics retry сохраняет event identity.
- Настроить redaction URLs/tokens/cookies/authorization/provider secrets и минимизацию visitor data в request/error logs.
- Добавить размерные ограничения и bounded workloads на создаваемые ресурсы, imports и diagnostics.

## Parallel execution

Общая серверная конфигурация и middleware изменяются последовательно после интеграции auth/analytics/deployment.

Hard prerequisites: SERVICE-V1-11, SERVICE-V1-12. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Лимит одного клиента не блокирует другого по общей tenant-key ошибке.
- [ ] Auth enumeration/bruteforce/resend и oversized payload cases отклоняются ожидаемо.
- [ ] Реакция runtime на 429/timeout не прячет страницу; error telemetry не дублирует события.
- [ ] Поиск секретов в тестовых logs/assets не находит canary tokens; численные лимиты соответствуют решению 02.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.
- `AGREED` — `OPS`: Эксплуатация: тестовая среда, реальные тестовые письма, обновление версии, резервная копия/восстановление, фоновые задачи и сигнал о сбое.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Будущие API quota/429/concurrency tests с управляемыми часами и двумя tenants.
- `AGREED` — Browser fault cases и canary secret scan в тестовых logs/build artifacts; ограниченный staging burst в согласованном объёме.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Rate/quota policies, безопасные логи и диагностика limits.
- Evidence изоляции и fallback.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/operations.html`

Групповой report этапа E5; выделить отдельную запись/anchor `SERVICE-V1-13`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Большая нагрузочная кампания и внешний pentest не добавляются; численные эксплуатационные пределы требуют решения 02.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
