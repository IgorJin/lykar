# SERVICE-V1-16 — Мониторинг, резервные копии и восстановление

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-15, SERVICE-V1-12
Parallel wave: W15
Can run in parallel with: None

Stage: E5 — S6: доставка и эксплуатация
Planning date: 2026-10-02

## Goal

Обнаруживать сбой и восстанавливать сервис в проверенные сроки.

## Problem solved

Health endpoint и логи не доказывают обнаружение отказа БД/email/jobs или возможность восстановить данные.

## Enables

- Работу сервиса под наблюдением.
- Техническую приёмку и пользовательский пилот.

## Scope

- Добавить readiness/liveness, error/latency/job/email metrics и адресуемые alert channels по выбранной инфраструктуре.
- Настроить backups/retention и выполнить restore в изолированную БД; сверить migrations, Projects/Releases/history/analytics и deletion policy.
- Проверить failure DB/API/email/CDN/jobs в контролируемой staging среде и ожидаемый сигнал.
- Описать incident runbook, rollback app/assets, контакты/ответственного и способ отключить delivery.
- Измерить RPO/RTO и восстановление служебных секретов без включения их в reports.

## Parallel execution

Один оператор управляет staging/restore/alert state; проверки не идут параллельно с deployment другого этапа.

Hard prerequisites: SERVICE-V1-15, SERVICE-V1-12. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Оператор получает тестовый alert с понятным действием; отсутствующие данные не выглядят как здоровье.
- [ ] Backup реально восстановлен, целостность и основные browser flows подтверждены.
- [ ] Измеренные RPO/RTO соответствуют решениям 02; невыполненные цели блокируют эксплуатационную приёмку.
- [ ] После сбоя runtime оставляет исходный сайт доступным; восстановление не оживляет удалённые/отозванные сущности.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.
- `AGREED` — `OPS`: Эксплуатация: тестовая среда, реальные тестовые письма, обновление версии, резервная копия/восстановление, фоновые задачи и сигнал о сбое.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Будущие backup/restore/incident-drill команды, только изолированная среда.
- `AGREED` — Реальный staging smoke после restore и controlled alert delivery на канал владельца.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Metrics/alerts, backup automation и runbooks.
- Групповой E5 report с реальным restore evidence.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/operations.html`

Групповой report этапа E5; выделить отдельную запись/anchor `SERVICE-V1-16`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Каналы, storage и RPO/RTO выбираются в 02; фиксируется измеренный результат, а не обещание без проверки.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
