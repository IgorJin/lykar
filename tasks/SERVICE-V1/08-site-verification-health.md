# SERVICE-V1-08 — Подтверждение сайта и диагностика подключения

Status: DONE
Priority: P0
Depends on: SERVICE-V1-07
Parallel wave: W8
Can run in parallel with: None

Stage: E3 — S6: регистрация и самостоятельное подключение
Planning date: 2026-10-02

## Goal

Различать подтверждённый origin, установленный SDK и исправно работающую страницу.

## Problem solved

Создание Project/allowed origin само по себе не подтверждает право на сайт и успешную интеграцию.

## Enables

- Мастер подключения с проверяемым результатом.
- Понятную диагностику CSP, assets и framework readiness.

## Scope

- Реализовать выбранный challenge подтверждения владения origin с истечением и отзывом; loopback dev path отделить от production.
- Добавить безопасный page-bound connection probe с актуальностью, версией SDK, runtime/editor assets и readiness.
- Проверять CSP/connect/script/style ограничения и выдавать исправимые причины; изоляция tenants/origins обязательна.
- При server-side запросах защитить verifier от SSRF, редиректов в private networks и DNS rebinding; localhost fixtures запускаются в отдельном test режиме.
- Не считать отсутствие heartbeat доказательством отказа: показывать «ещё не проверено/проверено тогда-то», а не фиктивный online.

## Parallel execution

Один владелец Project/origin/access схемы и migrations; не параллелить с auth/jobs/deletion.

Hard prerequisites: SERVICE-V1-07. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [x] Чужой/неподтверждённый origin нельзя активировать по выбранной политике; подмена Project/nonce отклоняется.
- [x] Проверка различает отсутствующий SDK, неверный key, недоступный asset, CSP и неподдержанный framework mode.
- [x] Устаревший сигнал не даёт ложный зелёный статус; повтор подключения безопасен.
- [x] SSRF/redirect/rebind regression cases применены, если verifier выполняет сетевые запросы.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Будущие domain/probe API cases и browser fixtures для CSP/wrong key/blocked asset.
- `AGREED` — Проверки двух аккаунтов/двух origins, expiry/revoke/replay; контролируемый network fake для verifier.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Ownership verification и connection-health contract/API.
- Fixture matrix и диагностические коды.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/onboarding.html`

Групповой report этапа E3; выделить отдельную запись/anchor `SERVICE-V1-08`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Сигнал от браузера подтверждает установку, но не заменяет выбранное доказательство владения доменом.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.


## Реализация — 2026-10-06

По прямому поручению владельца выполнена техническая часть 08, не требующая
подключения email API или staging. Внешний gate реальной доставки 07 сохранён.
D02 реализован как DNS TXT: 24h одноразовый challenge, hash в PostgreSQL,
точная привязка Project/origin, ротация, отзыв и повторная проверка после DNS lookup.
Публичные origin — HTTPS с публичным DNS hostname; wildcard/IP/private aliases
не разрешены. Сервер не делает HTTP-запросов к сайту, поэтому HTTP redirects и
DNS A/AAAA rebinding не могут направить verifier в private network.

Миграция 013 добавляет challenges/probes и метод доказательства. Все origins должны
быть подтверждены до Deploy/Rollback; Disable остаётся доступен. Runtime выдаёт
manifest только точному подтверждённому origin. Отзыв прекращает новую выдачу,
но не удаляет Release/activation: повторное подтверждение восстанавливает eligibility
уже активного deployment. Открытые вкладки следуют существующему lifecycle 04.

Loopback — отдельный explicit dev/test путь. Production запрещает его включение;
API без dev-разрешения игнорирует local-development proof при deployment resolve
и activation. Playground seed тоже ограничен loopback/non-production.

В Admin добавлена вкладка «Подключение». Page-bound nonce выдаётся на 2 минуты,
привязан к user/Page/origin и потребляется один раз. Новая проверка заменяет старую,
даже при одинаковых timestamps. Popup/source/origin/nonce/page проверяются, opener
отключён. SDK делает diagnostics только по explicit challenge от настроенного API
origin: API ping без credentials, проверенные runtime/editor assets без запуска
редактора, framework readiness и CSP connect/script/style.

Freshness — 15 минут, timestamps серверные, отсутствие ответа — NO_SIGNAL/inconclusive,
а не offline. Отсутствующий, заблокированный или старый SDK невозможно достоверно
различить без его ответа; интерфейс не выдумывает причину. Wrong key, assets, API,
observed CSP и unsupported framework имеют отдельные коды при наличии ответа SDK.
Это advisory self-report от страницы, никогда не доказательство владения.

Defaults 24h/2min/15min, DNS deadline 3s и cooldown 5s — локальные параметры реализации,
не обещания DNS propagation/uptime и не принятие других численных SLA SERVICE-V1-02.
Live DNS/HTTPS staging не изменялись; DNS responses подставлены контролируемым resolver.
Реальный browser использует локальные страницы/assets/CSP и React/Vue fixtures.

Отчёт: [SERVICE-V1-08](../../docs/verification/reports/SERVICE-V1/onboarding.html#SERVICE-V1-08).
Полный мастер установки — этап 09; retry/retention и внешняя инфраструктура остаются
в своих задачах. SDK API не требует новых ключей или email credentials.

Local acceptance: 73/73 API/PostgreSQL + HTTP smoke, 109/109 SDK, 63/63 browser, workspace typecheck and diff check PASS. No live DNS/staging claim.
