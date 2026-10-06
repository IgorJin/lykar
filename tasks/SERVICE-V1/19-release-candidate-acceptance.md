# SERVICE-V1-19 — Итоговая техническая приёмка одного кандидата

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-18, SERVICE-V1-20
Parallel wave: W18
Can run in parallel with: None

Stage: E6 — Приёмка кандидата в выпуск
Planning date: 2026-10-02

## Goal

Принять один воспроизводимый snapshot для ограниченного пользовательского пилота.

## Problem solved

Отчёты разных revisions и раздельные unit/browser/ops PASS могут скрыть неработающую интеграцию.

## Enables

- Начало пилота после технической готовности.
- Повторяемый выпуск и расследование дефектов.

## Scope

- Зафиксировать candidate revision/tree hash и versions; собрать один согласованный набор assets/schema/config.
- Последовательно выполнить build/typecheck/unit/HTTP-PostgreSQL/browser gates, сохранив counts и отсутствие mandatory skip.
- Проверить clean install/upgrade, packed script/npm consumers, staging email/backup/jobs/alerts и manual desktop/mobile на candidate.
- Использовать актуальное неизменное targeted evidence вместо повторной без причины проверки; при изменении candidate повторять затронутые gates.
- Собрать групповой report с limitations, decisions/budgets, incidents, доступной установкой и next pilot gate.
- Не публиковать публичный SaaS или npm пакет автоматически по факту зелёных tests.

## Parallel execution

Один интегратор, один immutable candidate и один управляемый стенд; общие outputs и production-like state не запускаются параллельно.

Hard prerequisites: SERVICE-V1-18, SERVICE-V1-20. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Все AGREED checks подтверждены на одном candidate либо явно применимым evidence идентичного кода/config.
- [ ] Отсутствующие tests, пропущенная PostgreSQL/staging проверка и невыбранный provider не объявлены PASS.
- [ ] Нет release-blocking defects; полный клиентский путь работает без локальных секретов/терминала.
- [ ] Сохранены install/rollback/restore инструкции и конкретная supported matrix.
- [ ] Пилот допускается только после этого gate; решение об открытии сервиса ещё отдельно.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `UI`: UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.
- `AGREED` — `OPS`: Эксплуатация: тестовая среда, реальные тестовые письма, обновление версии, резервная копия/восстановление, фоновые задачи и сигнал о сбое.
- `AGREED` — `COMMANDS`: Используем существующие npm run build/typecheck/test, test:e2e:http, test:e2e:browser, Playwright и временную PostgreSQL; новые команды отмечаем как будущие.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Последовательно: npm run build; npm run typecheck; npm test; npm run test:e2e:http; npm run test:e2e:browser.
- `AGREED` — Существующие packed consumer checks + будущие staging smoke/restore/performance commands из принятых задач; git diff --check.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Технически принятый release candidate и E6 grouped report.
- Полный evidence index с reproduction commands.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/release-acceptance.html`

Групповой report этапа E6; выделить отдельную запись/anchor `SERVICE-V1-19`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Планирование не запускает перечисленные application tests: сейчас проверяется структура плана.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
