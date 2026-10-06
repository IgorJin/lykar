# SERVICE-V1-04 — Доставка активной версии и безопасное отключение

Status: DONE
Priority: P0
Depends on: SERVICE-V1-03
Parallel wave: W4
Can run in parallel with: None

Stage: E2 — S5: публикация, отключение и откат
Planning date: 2026-10-02

## Goal

Подключить active deployment к SDK с определёнными cache, lifecycle и failure semantics.

## Problem solved

Опция delivery существует, но обычный manifest resolve без selector сейчас возвращает native.

## Enables

- Реальное применение быстрой правки на обычном URL.
- Проверяемые Disable/Rollback и совместимость с preview/A/B.

## Scope

- Реализовать opt-in delivery по контракту; links-only остаётся native без обычного resolve.
- Сохранить раздельные режимы: валидная A/B-ссылка выбирает собственный native/Release, preview не дополняется deployment; invalid/ambiguous explicit selector возвращает native.
- Проверить static и React/Vue PageSession: переходы, abort, cleanup, reload, removal предыдущего варианта без повреждения host.
- Определить cache lifetime/revalidation и момент применения смены deployment в открытой вкладке; не обещать live push.
- Ограничить network/replay/hiding; failure и частичная ошибка не оставляют пустую/скрытую страницу. Диагностика partial apply доступна владельцу.

## Parallel execution

Последовательно: SDK/runtime, protocol-facing types, fixtures и общий build output. Изменения delivery не совмещаются с analytics instrumentation.

Hard prerequisites: SERVICE-V1-03. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [x] Publish не меняет обычный URL; explicit Deploy меняет; Disable и Rollback соответствуют активной revision.
- [x] Invalid токен не подменяется production версией; Native A остаётся исходной страницей даже при deployment B.
- [x] При зависании/отказе API и assets страница доступна в пределах принятого timeout; stale response не меняет новую Page.
- [x] Cache и старые вкладки ведут себя согласно опубликованным правилам; anonymous deployment не создаёт experiment events.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Существующие runtime/SDK suites и tests/e2e/page-session-lifecycle.spec.ts, replay-safety.spec.ts, s4-spa-critical.spec.ts.
- `AGREED` — Будущие browser deployment cases с offline/timeout/late-response и матрицей selectors; fake clock для cache.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- SDK/runtime deployment integration и diagnostics.
- Browser evidence обычного URL, токенов, SPA и сбоев.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/deployment.html`

Завершено 2026-10-04. [Раздел отчёта](../../docs/verification/reports/SERVICE-V1/deployment.html#SERVICE-V1-04).
Evidence: `docs/verification/reports/SERVICE-V1/artifacts/2026-10-04-deployment-delivery/`.

- Runtime 106/106 и SDK 62/62, без skipped; build и typecheck всех workspaces PASS.
- Browser regression 55/55 (Chromium 23, Firefox 16, WebKit 16), включая 24 deployment cases. Реальная временная PostgreSQL/API: Publish/Deploy/Disable/Rollback, script/ESM, pinned preview и Native A; React/Vue CSR/SSR, remount/navigation/host handlers.
- Ошибки транспорта/HTTP, зависание fetch/body и поздний ответ проверены управляемыми transport faults в unit и настоящих браузерах. Это не измерение внешней сети или staging SLA.
- Partial replay компенсирует обычные операции и conditional overlays. Пустые/дублированные selectors не включают deployment. Anonymous delivery не создаёт analytics.
- Сохранены логи, machine JSON, source/asset hash; traces/screenshots/video первого неуспешного browser attempt и успешные S4 screenshots. Начальные проблемы test fixture и worker startup отмечены в report.
- API/PostgreSQL suite 31/31 и HTTP smoke — evidence задачи 03; в этой задаче API/migration код не менялся, browser stand пересоздаёт и мигрирует БД.


## Notes

- JS delivery не обещает изменение серверного HTML, SEO или отсутствие исходного первого кадра при поздней загрузке.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.


Реализация сохраняет links-only по умолчанию. Deployment resolve no-store, start memoized;
refresh/navigation/reload перечитывают pointer после cleanup. Нет live push. Существующие
фазовые defaults: network 5000 ms, replay 2000 ms, lazy asset load 10000 ms. D03/D04/D05
не утверждены этим срезом; предлагаемый network 2000 ms не внедрён. Conditional
missing/not-ready/inactive — прежние отложенные состояния, unsafe initial target — отказ
с cleanup. Diagnostics доступны в runtime report. Отдельный runtime требует caller-owned
fetch/signal, bounded delivery реализует SDK.

Продолжено по команде владельца в рамках mode/access части 02 и исключения, записанного
для 03. Внешние providers/новые budgets не используются; 02 остаётся IN_PROGRESS.
На момент среза 04 gate E2 ожидал SERVICE-V1-05. Admin workflow завершён 2026-10-05, см. раздел 05 группового отчёта.
