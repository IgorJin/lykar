# SERVICE-V1-11 — Полный A/B-сценарий по ссылке и читаемый отчёт

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-10
Parallel wave: W11
Can run in parallel with: None

Stage: E4 — A/B по ссылке: настройка и достоверный отчёт
Planning date: 2026-10-02

## Goal

Позволить владельцу запустить эксперимент и принять решение на достоверных описательных данных.

## Problem solved

Технический эксперимент работает, но setup, QA-ссылки, traffic entry и результаты требуют продуктовой ясности.

## Enables

- Рабочую A/B-функцию первого сервиса.
- Проверенный путь от варианта страницы до отчёта.

## Scope

- Собрать создание A/B, просмотр каждого варианта, выбор weights до activation и генерацию одной entry-ссылки.
- Явно различать A/B entry, QA variant и share: последние не собирают experiment analytics.
- Проверить sticky 30-day assignment, expiry/revoke/pause/complete, независимые Page и неизменность после запуска.
- Показать visits/visitors/conversions/CVR/uplift с определёнными нулевыми denominator и пояснением данных; не заявлять significance.
- Связать winner с ручным отдельным Deploy выбранного Release; native winner предлагает Disable, а не фиктивный Release.
- На выбранном active deployment проверить native A/Release B, failed explicit selector и отсутствие двойного replay.

## Parallel execution

Один владелец experiments-panel/report/API fixtures; схема цели уже зафиксирована в 10.

Hard prerequisites: SERVICE-V1-10. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Пользователь запускает A/B-ссылку и понимает, что обычный трафик сам не включается в эксперимент.
- [ ] Заданные вручную visits/conversions совпадают с отчётом, независимо от retries/SPA rerenders.
- [ ] Неверная/отозванная/paused/completed entry-ссылка возвращает native; обычный URL следует собственному deployment.
- [ ] Ни назначение winner, ни завершение эксперимента не меняют production без отдельного действия.
- [ ] Новый запуск после завершения получает новую identity и не смешивает старую историю.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `UI`: UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Расширить существующие S3/S4 experiment/analytics browser и PostgreSQL suites.
- `AGREED` — Будущий service A/B flow на static и React/Vue; ключевые selector/consent cases включить также в Firefox/WebKit.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Настройка эксперимента, ясные ссылки, отчёт и явный переход к Deploy.
- Групповой E4 report с контрольными counts.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/experiments.html`

Групповой report этапа E4; выделить отдельную запись/anchor `SERVICE-V1-11`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Многовариантные тесты, автопобедитель, таргетинг и обычный site-traffic allocation исключены.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
