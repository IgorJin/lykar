# SERVICE-V1-06 — Регистрация и независимые владельцы сайтов

Status: DONE
Priority: P0
Depends on: SERVICE-V1-05
Parallel wave: W6
Can run in parallel with: None

Stage: E3 — S6: регистрация и самостоятельное подключение
Planning date: 2026-10-02

## Goal

Позволить новому клиенту создать собственный аккаунт и проект.

## Problem solved

Текущий auth создаёт пользователя только для заранее заданного owner email либо находит существующего.

## Enables

- Самостоятельный вход нового клиента.
- Реальные письма и сценарий первого сайта.

## Scope

- Реализовать принятый email registration/magic-link flow, подтверждение адреса и обработку повторной регистрации.
- Убрать специальный глобальный owner как модель production регистрации, сохранив local test login только в разрешённом dev режиме.
- Проверить независимых владельцев, проекты и приглашения; создавать/принимать membership без смешивания аккаунтов.
- Сохранить одинаковый публичный ответ для известных/неизвестных адресов и hash/one-use/expiry токенов.
- Добавить UX регистрации, истёкшей ссылки, повторной отправки и logout.

## Parallel execution

Ждёт E2 из-за общей API регистрации, auth guards, migrations и общей Admin shell; одна миграционная очередь.

Hard prerequisites: SERVICE-V1-05. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [x] Новый email проходит регистрацию и получает собственный пустой список сайтов.
- [x] Два новых аккаунта не читают и не меняют проекты друг друга, включая перебор ID и invitation race.
- [x] Старые владельцы/приглашённые участники продолжают входить; одна ссылка используется один раз.
- [x] Production не включает local-login и тестовый file sender.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `UI`: UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Расширить существующий tests/e2e/auth-and-editor.spec.ts и PostgreSQL auth/membership cases.
- `AGREED` — Будущие signup race/reuse/expiry/cross-account cases с test sender; реальная доставка проверяется в 07.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Регистрация и customer auth UX.
- Tenant isolation evidence и upgrade существующих accounts.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/onboarding.html`

Групповой report этапа E3 создан с записью `SERVICE-V1-06`, machine evidence и ограничениями. Остальные части E3 (07–09) ещё открыты.

## Notes

- Полная Workspace/billing-иерархия не требуется: сохраняется существующая граница Project + memberships.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.

## Completion — 2026-10-05

- Email-bound challenge создаётся без аккаунта; атомарное подтверждение создаёт/находит пользователя. Глобальный owner email действует только для dev-login.
- Миграция 011 сохраняет старые ссылки/сессии; проверены rollback, повторный вход и upgrade.
- 36/36 API/PostgreSQL tests + HTTP smoke, 18/18 browser tests (по 6 Chromium/Firefox/WebKit), общий typecheck PASS; в финальных прогонах нет skipped/flaky/retries.
- Проверены два независимых owner, чужие Project/Page IDs, viewer permission, signup/invitation race, token race/expiry/resend, logout и production guards.
- UI: desktop/mobile 390px, keyboard submit, email сохранён после ошибки; скриншоты пустого аккаунта и ошибки ссылки визуально проверены.
- Финальный review субагента sol 6.1 high: существенных замечаний нет; review без повторного запуска тестов.
- Evidence: [onboarding.html#SERVICE-V1-06](../../docs/verification/reports/SERVICE-V1/onboarding.html#SERVICE-V1-06), [артефакты](../../docs/verification/reports/SERVICE-V1/artifacts/2026-10-05-signup/README.md).
- Внешние письма/HTTPS staging и лимиты запросов с quota-based переключением провайдеров относятся к 07 (поручение владельца 2026-10-05). Часовое окно/пауза/провайдеры ещё предложены, не утверждены. Production требует настроенных отправителей до запуска.
