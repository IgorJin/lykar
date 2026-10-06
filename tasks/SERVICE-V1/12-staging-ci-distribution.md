# SERVICE-V1-12 — Среды, CI и доставка SDK клиентам

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-02
Parallel wave: W3
Can run in parallel with: SERVICE-V1-03

Stage: E5 — S6: доставка и эксплуатация
Planning date: 2026-10-02

## Goal

Сделать сервис и его script/npm поставку воспроизводимо устанавливаемыми вне локального стенда.

## Problem solved

В репозитории не найдены production deployment pipeline; SDK/frameworks пока private и требуют ручного размещения assets.

## Enables

- HTTPS staging для email/onboarding и финальных проверок.
- Управляемый выпуск и откат версии самого SDK.

## Scope

- По решениям 02 создать инфраструктурный рецепт, разделение staging/production secrets/data и CI для существующих сборок/проверок.
- Подготовить immutable versioned SDK/runtime/editor assets и совместимый manifest; atomically promote связанный набор и откатывать набор целиком.
- Проверить release packaging SDK/frameworks и runtime dependency: installation вне workspace, types/SSR imports и отсутствие private/unavailable transitives.
- Выбрать и подготовить npm registry либо явно документированную beta tarball delivery; claims об npm install должны совпадать с реально доступным способом.
- Ввести проверку production config, HTTPS/origins/cookies, migrate-once запуск, readiness с DB и отдельную liveness.
- Проверять clean deployment и upgrade прежнего набора без уничтожения data; production и внешняя публикация выполняются отдельным явным действием при исполнении.

## Parallel execution

Параллельно с 03 только в отдельных рабочих каталогах: 12 владеет CI/infra, SDK/frameworks package manifests, root package scripts/lockfile; 03 — API/migrations. Приложенческие runtime/API контракты не меняются здесь. Общие стенды/билды сериализованы.

Hard prerequisites: SERVICE-V1-02. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Staging воспроизводимо поднимается из чистого окружения и проходит health/readiness/smoke.
- [ ] Клиент получает installable согласованный SDK bundle без workspace alias; private manifests не попадают в shared cache.
- [ ] Неполный/mixed release assets отвергается и оставляет host доступным; package version/protocol/Release различимы.
- [ ] CI исполняет реальные PostgreSQL/browser checks и сохраняет diagnostics без секретов.
- [ ] План SDK rollback подтверждён staging упражнением; final app version перепроверяется в 19.

## Checks

- `AGREED` — `COMMANDS`: Используем существующие npm run build/typecheck/test, test:e2e:http, test:e2e:browser, Playwright и временную PostgreSQL; новые команды отмечаем как будущие.
- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.
- `AGREED` — `OPS`: Эксплуатация: тестовая среда, реальные тестовые письма, обновление версии, резервная копия/восстановление, фоновые задачи и сигнал о сбое.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Существующие npm run verify:consumer --workspace @lykar/sdk и npm run verify:s4:framework-consumer как concrete delivery regression; собрать зависимости предварительно.
- `AGREED` — Будущие staging deploy/smoke/package/release commands документировать при исполнении; не выдавать их за текущие.
- `AGREED` — Clean environment install и rollback связанного asset set на staging.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- CI, environment/deployment recipe, artifact distribution и package release recipe.
- Безопасный staging и delivery evidence.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/operations.html`

Групповой report этапа E5; выделить отдельную запись/anchor `SERVICE-V1-12`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Ранняя задача E5 использует интерфейсы 02; не объявляет ещё не реализованный deployment flow готовым.
- Хостинг, DNS, provider и registry credentials — внешние prerequisites; сейчас никакие ресурсы не создаются.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
