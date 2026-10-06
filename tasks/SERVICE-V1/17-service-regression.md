# SERVICE-V1-17 — Сквозная регрессия и приёмка интерфейсов

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-16
Parallel wave: W16
Can run in parallel with: SERVICE-V1-20

Stage: E6 — Приёмка кандидата в выпуск
Planning date: 2026-10-02

## Goal

Доказать целостность клиентского сценария и изоляцию после интеграции всех модулей.

## Problem solved

Локальные успешные tests отдельных функций не доказывают работу сервиса через реальные UI/API.

## Enables

- Кандидат в выпуск без функциональных и access-блокеров.
- Измерение производительности принятого workflow.

## Scope

- Добавить сквозные cases registration/install/edit/save/share/deploy/disable/rollback и A/B-link/report.
- Расширить Playwright testMatch для новых ключевых Firefox/WebKit cases; отсутствие найденных tests считать ошибкой.
- Пройти static, React/Vue CSR и ordinary hydration в S4 scope; поддержанные операции проверять явно.
- Проверить два clients, две pages, роли, expired/revoked links, conflict/lost-save-response, SPA navigation и consent.
- Провести desktop/mobile keyboard/focus/error-state walkthrough; исправить подтверждённые release blockers.
- Запускать целевые suites и оформлять coverage; один общий финальный прогон назначен в 19.

## Parallel execution

Параллельно с 20 только как code/testing против docs-only поддержки. 17 владеет tests/app fixes; 20 не меняет code, contracts, fixtures или общий acceptance report. Стенд принадлежит 17.

Hard prerequisites: SERVICE-V1-16. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Каждый согласованный основной путь связан с исполняемым test/manual case и evidence.
- [ ] В Chromium проходит полный workflow; критические auth/delivery/selectors/A-B/SPA cases реально исполняются в Firefox/WebKit.
- [ ] Нарушений доступа, потерь правок и неверных counts нет; ошибки подключения исправимы по UI.
- [ ] UI snapshots подтверждают ширину host и управление с клавиатуры/mobile без заявления полного a11y-аудита.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `UI`: UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.
- `AGREED` — `COMMANDS`: Используем существующие npm run build/typecheck/test, test:e2e:http, test:e2e:browser, Playwright и временную PostgreSQL; новые команды отмечаем как будущие.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Существующие npm run test:e2e:http и target npx playwright test; новые service files и browser testMatch добавить при исполнении.
- `AGREED` — Ручной проход на npm run dev:e2e и HTTPS staging; mapping не допускает пустого test discovery.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Полный набор service regression cases и исправления blockers.
- Coverage/evidence для E6.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/release-acceptance.html`

Групповой report этапа E6; выделить отдельную запись/anchor `SERVICE-V1-17`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- При исправлениях в 18 affected cases повторяются; старый PASS другого revision не принимается как финальный.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
