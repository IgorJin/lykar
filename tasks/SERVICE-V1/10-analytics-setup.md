# SERVICE-V1-10 — Настройка конверсии и consent для A/B

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-09
Parallel wave: W10
Can run in parallel with: None

Stage: E4 — A/B по ссылке: настройка и достоверный отчёт
Planning date: 2026-10-02

## Goal

Дать клиенту проверяемую настройку события, по которому оценивается эксперимент.

## Problem solved

Explicit track/consent есть в SDK, но нулевой отчёт не объясняет отсутствие события, согласия или посещений.

## Enables

- Осмысленный отчёт A/B с выбранным событием.
- Диагностику интеграции до отправки трафика.

## Scope

- Реализовать принятый в 02 минимальный путь: выбрать/описать явное именованное conversion event, дать SDK/script-инструкцию и проверить поступление.
- Не включать сбор автоматически: initial pending, явный granted/denied, документированный host consent integration и отзыв согласия.
- Согласовать привязку цели к experiment до первого запуска; если требуется новая event-specific aggregation, обеспечить migration/backfill и совместимость старых общих отчётов.
- Добавить test-event flow, изолированный от production totals, и статусы «нет событий/нет consent/нет трафика».
- Сохранять dedup clientEventId, exposure-before-conversion правило и корректность PageSession/visits.

## Parallel execution

Последовательно: analytics wire/schema, SDK visit lifecycle и shared fixtures; не совмещать с delivery/core изменениями.

Hard prerequisites: SERVICE-V1-09. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Пользователь видит, какое событие измеряет запуск и прошло ли тестовое событие; нет обещания no-code instrumentation.
- [ ] Pending/denied не отправляют exposure/conversion; granted не дублирует ранее зарегистрированное посещение.
- [ ] Ререндер, retry и lost response не увеличивают totals повторно; страницы и эксперименты изолированы.
- [ ] Новая цель не переопределяет исторический смысл уже запущенного эксперимента; legacy reports читаются.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `UI`: UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Существующие runtime/SDK analytics tests, s3-acceptance.spec.ts и S4 consent/navigation cases.
- `AGREED` — Будущие goal selection/test-event API/E2E и migration cases при изменении схемы; ожидаемые числа задаются вручную.

- `PROPOSED` — Автоматическое создание click/URL/form goals через визуальный выбор — отдельное расширение; не условие DONE этого минимального сценария.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Analytics setup UI, инструкции track/consent и безопасная тестовая диагностика.
- Evidence правильных counts и совместимости.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/experiments.html`

Групповой report этапа E4; выделить отдельную запись/anchor `SERVICE-V1-10`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Выбор конкретного события/метрики закрывается в 02; суммарные conversions разных событий нельзя подписать как результат выбранной цели.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
