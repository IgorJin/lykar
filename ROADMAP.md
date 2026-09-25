# Lykar — требования и план реализации

Дата основной сверки с кодом: 2026-09-16. Порядок технических работ обновлён
2026-09-20 по итогам разбора рисков. Статус: план; эта правка меняет документацию.

## 1. Назначение

Это единый реестр требований и последовательности реализации Lykar для инженеров
и coding agents. Продуктовые инварианты задаёт [SPEC.md](./SPEC.md), технические
границы — [technical-vision.md](./docs/architecture/technical-vision.md).

Источники требований: согласованные решения владельца проекта, SPEC и текущий
код. [Маркетинговое исследование](./docs/marketing/go-to-market.md) содержит
гипотезы; само наличие идеи в нём не делает её обязательством первой версии.

Новая цель от 2026-09-16: довести существующий продукт до работающего состояния,
предоставить библиотеку как script и npm package, добавить определённую и
проверяемую поддержку SPA. Под «rollback» в контексте сборки предполагается
Rollup; откат опубликованной версии — отдельная функция продукта.

## 2. Границы результата

### Базовый MVP — ранее согласованный сценарий

Static/SSR сайт → overlay → локальные правки → сохранённый Draft → immutable
Release → preview/share → A/B-ссылка → descriptive analytics. Этот сценарий
нужно завершить и проверить до расширения на динамические приложения.

### Рабочая V1 — текущая цель

Включает базовый MVP, общий SDK, script/npm delivery, первый поддерживаемый
SPA-режим, drift recovery и explicit Deploy/Disable/Rollback. Редактор должен
предоставлять весь согласованный набор команд. Для SPA поддержка каждой команды
зависит от типа DOM root и фиксируется в compatibility matrix; выпуск npm-пакета
сам по себе не означает совместимость с React/Vue.

V1 завершается на локальном стенде и staging. Публичный SaaS требует отдельного
прохода production operations. Внешняя публикация пакета и деплой не выполняются
автоматически от самого факта написания этого плана.

### Полный roadmap

Все согласованные будущие функции остаются в реестре: реальные AI proposals,
Workspace, расчёт лимитов и usage с внедряемым Payment Provider, production
инфраструктура и дополнительные интеграции. Они не блокируют получение рабочей
V1. Новые маркетинговые идеи имеют отдельный статус предложения.

## 3. Как читать состояние

- **Есть код** — найден соответствующий implementation; это не свежий результат тестов.
- **Частично** — найдена часть сценария, отсутствует законченная интеграция или приёмка.
- **План** — требуется реализация.
- **Предложение** — рекомендация, не подтверждённое продуктовое обязательство.

В этой сверке build/test/E2E не запускались. Ни один пункт не получает статус
«готов к релизу» только по наличию файлов или старого коммита.
Проверяемый baseline S0 повторно пройден 2026-09-20/21. Свежие команды,
исправления и границы находятся в [сводном отчёте ревизии](./docs/verification/reports/s0-review.html),
а исходный журнал — в [S0 baseline](./docs/verification/s0-baseline.md) и
[TASKS.md](./TASKS.md).

## 4. Реестр обязательных требований

### Подключение и библиотека

| ID | Требование | Состояние | Этап |
| --- | --- | --- | --- |
| INT-01 | Один script + публичный project key; static/SSR playback | Готово в SDK; static и SSR consumer checks PASS | S1 |
| INT-02 | Единый SDK выбирает visitor/editor/share режим и загружает editor по требованию | Готово: selector/access bootstrap и lazy editor в SDK | S1 |
| INT-03 | npm ESM + TypeScript declarations; совместимость script/npm на одних manifests | Готово: @lykar/sdk ESM, IIFE, declarations и manifest | S1 |
| INT-04 | Rollup dist, отдельные runtime/editor bundles, immutable versioned assets | Готово: Rollup entries, separate editor asset и versioned manifest | S1 |
| INT-05 | `start`, `navigate`, `refresh`, `destroy`; отмена устаревших запросов | Контракт SDK готов; PageSession и строгая отмена остаются в S2.2 | S1 контракт, S2.2 ядро, S4 adapter |
| INT-06 | SPA navigation, mount/unmount, re-render и hydration без нарушения host UI | План | S4 |
| INT-07 | SSR-safe import и framework adapters; React первым как технический выбор | План | S4 |
| INT-08 | Installation wizard, health check, проверка origin и CSP | S1: origin/access и fail-open checks; wizard/health остаются S6 | S1, S6 |
| INT-09 | Два уровня интеграции: script для стабильного DOM и cooperative npm adapter | S1 script/npm contract готов; cooperative adapter остаётся S4 | S1 контракт, S4 |
| INT-10 | Зарегистрированные targets/roots и ограниченные overrides через props/store | План; минимальный React-срез | S4 |

### Редактор и command core

| ID | Требование | Состояние | Этап |
| --- | --- | --- | --- |
| EDT-01 | Overlay на настоящей странице: hover/selection/action layers, side panel | Есть код | S2 |
| EDT-02 | `setText`, `setStyle`, `setAttribute`, `removeAttribute` | Есть код protocol/runtime/editor | S2 |
| EDT-03 | Add, delete, move, copy; copy выражается безопасным `insertNode` | Есть код | S2 |
| EDT-04 | Локальное применение сразу; «Применить» сохраняет в backend | Принято S2 2026-09-23 | S2 |
| EDT-05 | Undo/redo и сохранность pending правок при reload/сбое | Принято S2 2026-09-23 | S2 |
| EDT-06 | Change Tree: id, target, applied/skipped/error, подсветка при hover | Принято S2 2026-09-23 | S2 |
| EDT-07 | Безопасный replay зависимых команд и стабильные targets новых nodes | Принято S2 2026-09-23 | S2 |
| EDT-08 | Совместимость стилей панели с host, keyboard navigation, responsive preview | Принято S2 2026-09-23 | S2 |
| EDT-09 | Dummy proposals без запросов к AI и без API key | Принято S2 2026-09-23 | S2 |
| EDT-10 | Copy/add описывают представление; UI не обещает копирование handlers и бизнес-логики | Принято S2 2026-09-23 | S2.4 |
| EDT-11 | P0: Style Manager как в GrapesJS, все legacy styles и любое поддерживаемое CSS-свойство через специализированные controls/raw fallback | Принято S2 2026-09-23 | S2-06.1…06.8 |
| EDT-12 | P0: отдельный styles-config.ts, select/input/color/number-unit/composite/stack; самописный TS/DOM UI без внешнего UI kit/runtime | Принято S2 2026-09-23 | S2-06.1, 06.2, 06.7 |
| EDT-13 | P0: значения/каскад, reset/priority, составные стили, единая история и preview → save → reload | Принято S2 2026-09-23 | S2-06.3…06.6, 06.8 |

EDT-11 означает открытый набор CSS-деклараций, а не только заданные пресеты.
Неподдерживаемые браузером значения объясняются; отсутствие специального
контрола не запрещает raw edit. Class selectors, pseudo/media rules и создание
@keyframes требуют отдельной модели правил; FUT-06 и framework scope сохраняются.

`nodeElement` существует только в памяти editor. В БД сериализуется descriptor,
а после reload/re-render DOM reference разрешается заново. Undo уже сохранённого
состояния должен создавать новое изменение draft; нельзя молча удалить команду
из существующего Release. Детальный UX этой операции закрывается на S2.

### Страницы, версии и воспроизведение

| ID | Требование | Состояние | Этап |
| --- | --- | --- | --- |
| VER-01 | Project с разрешёнными origins, ручное добавление Page, exact pathname | Принято S3: Admin + scoped browser flow | S3 |
| VER-02 | Версии отдельно для каждой Page; query не создаёт новую Page | Принято S3: независимые Page version sequences | S3 |
| VER-03 | Draft, base Release, optimistic revision, idempotency key и восстановление после потери ответа | Принято S2/S3: idempotent persistence + browser stale revision/retry | S2.4, S3 |
| VER-04 | Publish создаёт immutable Release с manifest hash; новые правки — новый Draft | Принято S3: edited Draft becomes immutable Release | S3 |
| VER-05 | Без токена и без явного deployment показывается исходная страница | Есть код | S1, S5 |
| VER-06 | Защищённый `?version=N`; share expiry/revoke, без editor capability | Принято S3: share preview/revoke and read-only visitor | S3 |
| VER-07 | Share URL на Lykar origin; one-time code exchange на host | Принято S3: page-bound one-time exchange and visitor flow | S1, S3 |
| VER-08 | Source fingerprint до Lykar replay, hash без хранения raw page DOM | Есть код | S2 |
| VER-09 | Operation report; missing target пропускается, остальные независимые команды продолжаются | Есть код; нужны проверки цепочек | S2 |
| VER-10 | Ручной rebind target через новый Draft/Release | План | S2 |
| VER-11 | Explicit Deploy/Disable/Rollback, audit history и cache invalidation | План | S5 |
| VER-12 | Sitemap import с preview/deduplication/allowlist origins | План; до публичного SaaS | S6 |

### Надёжность ядра — добавлено 2026-09-20

| ID | Требование | Состояние | Этап |
| --- | --- | --- | --- |
| COR-01 | TargetRegistry: логические targets, root и versioned environment bindings | План; текущий TargetDescriptor — исходный формат | S2.1 |
| COR-02 | Resolver возвращает unique/missing/ambiguous/invalid и evidence; first match не достаточен | План | S2.1 |
| COR-03 | PageSession: page/root/generation, AbortController, сериализация replay, cleanup | План | S2.2 |
| COR-04 | Operation ledger, стабильные IDs всех создаваемых nodes, зависимости и защита от повторов | Частично: insert marker есть; общей модели нет | S2.3 |
| COR-05 | Before/after journal, компенсация частичной операции, compare-and-restore | Частично: editor undo есть; общей гарантии нет | S2.3 |
| COR-06 | Structural fingerprint отделён от visual/requirement checks; CSS-only drift не скрыт обещанием hash | Структурный hash есть; диагностику уточнить | S2.1, X2 |
| COR-07 | Read/write batching, bounded observer/retry, лимиты manifest/replay и сетевой deadline | S1: delivery/replay/network baseline; lifecycle limits остаются S2.3/S4 | S1 baseline, S2.3, S4 |
| COR-08 | Версии protocol/SDK/Release различимы; переход на новые targets/dependencies совместим со старыми manifests | S1 version dimensions и asset manifest готовы; migration contract остаётся S2 | S1, S2.1–S2.3 |

Стабильные host markers/test IDs — предпочтительный opt-in. Семантические
признаки и structural selectors дополняют их. Автоматический fuzzy rebind
не входит в эти требования: неоднозначность требует review, особенно в validator.

Release по обычному API не переписывается и не удаляется: ссылка отзывается,
эксперимент останавливается или deployment выключается. Удаление Project/Data
— отдельный auditable workflow. Любая недоступная версия/ссылка оставляет native
page; отсутствие такого release не подменяется другим вариантом.

### Админка, доступ и роли

| ID | Требование | Состояние | Этап |
| --- | --- | --- | --- |
| ADM-01 | Отдельное Preact app; Admin/API на одном origin | Есть код | S3 |
| ADM-02 | Email magic link, HttpOnly session, CSRF; development TTL отдельно | Есть код; реальный email provider впереди | S3, S6 |
| ADM-03 | Projects/pages, drafts/releases, shares, experiments, analytics, members | Принято S3: browser acceptance покрывает Admin screens | S3 |
| ADM-04 | One-time editor launch и scoped cross-origin capability | Есть код | S1, S3 |
| ADM-05 | Owner/Admin/Editor/Viewer, invitations, expiry, revoke, ownership transfer | Есть код | S3 |
| ADM-06 | Ровно один Owner; отзыв прав закрывает editor capabilities | Есть код и DB invariants | S3 |
| ADM-07 | Error/loading/empty/conflict states без потери пользовательских правок | Принято S3: retryable loads, action errors and revision conflict/retry | S2, S3 |

Совместная работа в реальном времени не требуется. Роли и приглашения входят
в продукт; параллельное редактирование одного Draft обнаруживается revision
conflict, а не скрытым last-write-wins.

### Эксперименты и аналитика

| ID | Требование | Состояние | Этап |
| --- | --- | --- | --- |
| EXP-01 | Ровно A/B; native или immutable Release; один active Experiment на Page | Есть код | S3 |
| EXP-02 | Draft→Active↔Paused→Completed; после старта releases/weights неизменны | Есть код | S3 |
| EXP-03 | Публичный `lykar_variant` token для точного варианта; отзыв; без analytics | Есть код | S3 |
| EXP-04 | `lykar_experiment` entry link; weights по умолчанию 50/50 | Есть код | S3 |
| EXP-05 | Sticky assignment 30 дней: first-party cookie, localStorage fallback | Есть код | S3 |
| EXP-06 | Invalid/revoked/path mismatch/paused/completed → native page | Есть код | S3, S5 |
| EXP-07 | Editor готовит Draft; lifecycle и аналитика доступны Owner/Admin | Есть код | S3 |
| ANA-01 | Consent-gated exposure и explicit conversion, event idempotency | Есть код | S3 |
| ANA-02 | Visitors/views/unique conversions/conversions/CVR/uplift; деление на ноль определено | Есть код; проверить крайние случаи | S3 |
| ANA-03 | Никаких авто IP/full URL/page text/HTML; 90-day raw retention | Есть код storage/prune; scheduler впереди | S3, S6 |
| ANA-04 | Winner — metadata; без автоматического deploy и заявления significance | Есть код | S3 |
| ANA-05 | В SPA route visit и re-render различаются, exposure не дублируется | План | S4 |

Подробная семантика находится в [analytics.md](./docs/architecture/analytics.md).
Один fingerprint описывает наблюдаемую исходную структуру; он не фиксирует
историческую версию WordPress/Tilda/SPA. Experiment pin фиксирует Lykar Release,
а изменение исходного сайта показывается как drift.

### Качество, безопасность и эксплуатация

| ID | Требование | Состояние | Этап |
| --- | --- | --- | --- |
| QLT-01 | Воспроизводимые install/build/typecheck/unit/integration проверки | S0 PASS: clean install, build, typecheck, 69 lifecycle/unit/component и 21/21 PostgreSQL API | S0 завершён |
| QLT-02 | Browser E2E через реальные клики, reload, две страницы, share и reports | Static Chromium baseline 6/6 PASS; SPA и расширенная matrix остаются S4 | S0 baseline, S4 |
| QLT-03 | Один локальный запуск БД/API/Admin/runtime/fixtures | S0 PASS: `dev:e2e`, restart, Ctrl+C и port preflight | S0 завершён |
| QLT-04 | Static, React SPA и Vue compatibility fixtures; cold start документация | Static есть, остальные план | S4 |
| QLT-05 | Бюджеты JS size/replay duration, bounded observer и network timeout | S1 size/replay/network baseline готов; observer budgets остаются S4/S6 | S1, S4, S6 |
| QLT-06 | Adversarial browser fixtures: дубликаты targets, поздние nodes, route races, lost save response, CSS drift, rerender | План; добавляются с каждой реализацией | S0 harness, S2–S4, X2 |
| SEC-01 | Валидация каждой команды; запрет JS/handlers/unsafe HTML/URL | Есть код | S2 |
| SEC-02 | Project key публичный, secrets server-side, tokens hash/scoped/revocable | Есть код | S1, S3 |
| SEC-03 | Fail-open, ошибки не ломают host и не оставляют страницу скрытой | S1 access/network/lazy-load fail-open проверен; post-mutation failures остаются S2/S5 | S2, S5 |
| OPS-01 | CI, staging, versioned CDN dist, compatibility policy | План | S6 |
| OPS-02 | Email delivery adapter, jobs/retention, retry и rate limits | Частично: local auth/prune есть | S6 |
| OPS-03 | Backup/restore drill, metrics, redacted logs, audit, data deletion | Частично: health/logging/migrations есть | S6 |
| OPS-04 | Delivery budgets, bounded anti-flicker и документированная задержка deployment/cache invalidation | S1 delivery budgets готовы; deployment/cache semantics остаются S5 | S1 baseline, S5 |

## 5. Согласованные будущие направления

| ID | Результат | Состояние / порядок |
| --- | --- | --- |
| FUT-01 | Server-side AI provider DI, preview и частичное принятие proposals, budget/key controls | Контракт/dummy есть; реализация после V1 |
| FUT-02 | Workspace → projects/members; перенос текущих project owners | План после V1 |
| FUT-03 | Детерминированные Entitlements + идемпотентный UsageMeter + BillingProvider DI | Интерфейсы в SPEC; модулей пока нет |
| FUT-04 | Browser extension и CMS integrations поверх SDK | После V1, первая CMS выбирается по пилотам |
| FUT-05 | Расширенная SPA/BFF compatibility, Vue adapter, route patterns | После первого SPA-режима |
| FUT-06 | Breakpoint-specific commands и расширенные responsive варианты | После общей desktop/mobile цепочки |
| FUT-07 | Публичный roadmap и актуальные документы для инженеров/агентов | Поддерживать в каждом этапе |
| FUT-08 | Реестр host-approved компонентов/действий; сохранение поведения add/copy через явную интеграцию | План после S4; отдельный SDK contract, без произвольного JS в Operations |

## 6. Рекомендации, которые ещё не являются обязательствами V1

| Идея | Предлагаемый момент |
| --- | --- |
| Before/after, guest comments, Approve/Request changes | После надёжного share flow |
| Agency folders, white-label, branded previews, referral mechanics | После первых пилотов |
| Goals кликом по элементу, destination/form goals | Следующее расширение analytics |
| UTM/device/referrer targeting и schedules | После production deployments |
| Significance, sample-size calculator, SRM и более двух вариантов | Отдельная проработка статистической модели |
| Templates, widgets, reusable change recipes | После стабильного command core |
| GA4/PostHog/webhooks/Slack/Telegram/Make | По потребностям реальных пользователей |
| Экспорт изменений разработчику/CMS, edge/server-side replay | После V1; отдельная совместимость и семантика |
| Self-hosted SaaS distribution и enterprise support | После SaaS production baseline |

Тарифы и выбор первого маркетингового сегмента остаются гипотезами. Текущий
нормативный первичный пользователь — владелец небольшого сайта.

### 6.1 Visual Spec / developer handoff — запланированный прототип

Подробная оценка предоставленного плана и технические изменения:
[RFC: Visual Spec](./docs/architecture/visual-spec-review.md).

По запросу от 2026-09-20 в план включены прототип и проверка пути
«визуальная правка → задание → реализация в source → acceptance report».
Требования VS-01…VS-10 имеют статус **План прототипа**. Включение всей функции
в обязательную V1 зависит от X3; текущий A/B workflow сохраняется.

| ID | Требование прототипа | Срез |
| --- | --- | --- |
| VS-01 | Change Request с immutable submitted revisions и review, отдельный от Release | X1 |
| VS-02 | Requirements из конечного desired state, подтверждённые автором; provenance operations | X1 |
| VS-03 | ScenarioContext: pathname, viewport, locale/state, readiness | X1 |
| VS-04 | JSON/Markdown handoff + ограниченный preview, без зависимости от AI provider | X1 |
| VS-05 | TargetRef/environment bindings; unique/missing/ambiguous, без first-match PASS | X1, X2 |
| VS-06 | Read-only Playwright runner на localhost/CI, проверка source с выключенной Lykar delivery | X2 |
| VS-07 | Text/attribute/computed style/visibility assertions; прочие условия явно manual | X2 |
| VS-08 | PASS/FAIL/BLOCKED/MANUAL, все contexts/checks в denominator, версионированное evidence | X2 |
| VS-09 | Regression fixtures против false PASS, target ambiguity и self-validation overlay | X2 |
| VS-10 | Пять pilot pairs, 20 заданий, измерение уточнений/repair effort/повторного использования | X3 |

Guide-модуль остаётся предложением после X3: общие targets/overlay, отдельный protocol для
steps и progress. Сначала preflight и repair suggestions; автоматический fuzzy
rebind и заявленная точность в процентах требуют отдельной проверки.

## 7. Порядок реализации и критерии завершения

### S0 — Проверенный baseline

**Статус: завершён после ревизии 2026-09-21.** Декомпозиция S0-01…S0-08, зависимости,
критерии и ссылки на восемь HTML-отчётов находятся в
[TASKS.md](./TASKS.md) и [S0 baseline](./docs/verification/s0-baseline.md).

Проверить чистую установку из lockfile, build, typecheck, unit и PostgreSQL
integration tests. Запустить `dev:e2e` и `test:e2e`, зафиксировать реальные
результаты. Добавить первый browser E2E: login → edit → save → reload → share.

Выход подтверждён: стенд воспроизводится по инструкции; найденные ошибки имеют
regression cases; HTTP smoke и browser tests называются различимо; ручной Chrome
проход подтвердил UI login → editor → edit → save → reload → Release → share.
Следующая реализация — S2 TargetRegistry/PageSession и надёжное сохранение.

### S1 — Единая библиотека, Rollup dist и npm

Детальные задачи S1-01/S1-02, зависимости и критерии приёмки:
[план S1 в tasks](./tasks/S1/README.md). Статус: DONE; 9/9 task records
подтверждены групповой verification evidence.

Реализовать публичный SDK поверх текущих protocol/runtime/editor. Перенести
playground-specific launch/share bootstrap в библиотеку. Собрать независимый
IIFE для script, ESM и declarations для npm, editor asset для lazy loading.
Зафиксировать public API, asset versioning и compatibility errors.

Здесь фиксируются интерфейсы TargetRegistry/PageSession, SSR-safe import и два
уровня интеграции. Их полная реализация идёт на S2/S4. Снять первые bundle/replay
метрики, задать проверяемые бюджеты и timeout. Native visit не должен ждать editor
или analytics. Dependency Playwright остаётся за пределами visitor bundle.

Выход: две отдельные fixture installation — script и локальный `npm pack`
artifact — проходят один сценарий без копирования helper-кода из playground.
Native visit не скачивает editor; public key не даёт редакторские права.

### S2 — Полный редактор и надёжное сохранение

Детальные задачи S2-01…S2-06, зависимости и критерии приёмки:
[задачи S2](./tasks/S2/README.md). Статус: DONE; итоговая приёмка 2026-09-23.
Отчёты: [редактор](./docs/verification/reports/S2/s2-editor-acceptance.html) и
[стили/бюджет](./docs/verification/reports/S2/s2-style-editor.html).

**Приоритет владельца 2026-09-21: EDT-11…13 / S2-06 — P0.** Конфигурацию
стилей и native UI kit начать первыми (S2-06.1/06.2), интеграцию — сразу после
необходимых core dependencies. Восемь style tasks входят в обязательный scope
S2; финальная S2-05.4 зависит от style acceptance S2-06.8. Технический setStyle
и единственная пара property/value не закрывают это требование.

Внутренний порядок обязателен: `S2.1 → S2.2 → S2.3 → S2.4`. Значимые unit/browser
regression cases добавляются в том же срезе; отдельного отложенного этапа
«проверить всё потом» нет.

#### S2.1 — TargetRegistry и строгий resolver

Реализовать COR-01, COR-02, COR-06, COR-08: логические targets, root/environment
bindings, стабильные markers и semantic anchors, результаты unique/missing/
ambiguous/invalid. Нельзя выбирать первый совпавший candidate. Исходные и
ожидаемые признаки различаются, чтобы изменение текста не ломало поиск самого
изменяемого элемента. CSS-only изменения не трактуются как обнаруживаемые
структурным hash; fingerprint остаётся diagnostic signal.

Выход: две похожие кнопки не приводят к чужой мутации; изменение текста/порядка
обрабатывается предсказуемо; rebind создаёт новую revision/binding, старый Release
не переписывается; прежние manifests проходят compatibility fixtures.

#### S2.2 — PageSession и lifecycle ядра

Реализовать COR-03 и ядро INT-05: session привязана к project/page/root, хранит
generation и отменяет устаревшие fetch/tasks. В одном root нет пересекающихся
replay. `start/destroy` повторяемы; listeners/observers/pending work принадлежат
session. Контракт cleanup готовится здесь; фактическая компенсация использует
journal из следующего среза. Framework adapters ещё не нужны.

Выход: поздний ответ Page A не меняет Page B; уничтоженная session не создаёт
nodes/events; повторный start не дублирует ресурсы; root change проверен на
обычной browser fixture.

#### S2.3 — Executor, зависимости и журнал

Реализовать COR-04, COR-05, COR-07: стабильные IDs включая text-node insertions,
dependency-aware replay, ledger, bounded batching и before/after journal.
Неудачный prerequisite даёт зависимым командам `DEPENDENCY_UNAVAILABLE`.
Компенсация одной операции и cleanup session не затирают новые изменения host.

Выход: insert→edit→move→copy→delete и повтор replay не создают дубликаты; сбой
внутри операции компенсируется; concurrent host mutation сохраняется при cleanup;
невозможная безопасная компенсация выдаёт diagnostic, а не заменяет весь body.

#### S2.4 — Persistence и полный editor workflow

Замкнуть executor на UI: все команды, Change Tree, local recovery, undo/redo,
target repair. Для save добавить idempotency key с проверкой payload, optimistic
revision и восстановление результата потерянного ответа. Один request не
сохраняется дважды. Undo сохранённой правки оформляется новым изменением Draft.

Панель изолируется от host styles; позиционирование/scroll/keyboard проверяются
в браузере. Для add/copy UI отличает статическое представление от поведения
программного компонента; недоступные host actions не имитируются.

Выход: reload восстанавливает сохранённый результат; конфликт двух вкладок не
теряет pending operations; повтор сохранения возвращает определённый результат;
запрещённый payload, ambiguous target и ограничения copy объяснены в UI.

### S3 — Законченный путь Admin → версия → ссылка → эксперимент → отчёт

Status: DONE · Accepted 2026-09-23 · [S3 task index](./tasks/S3/README.md) ·
[browser and PostgreSQL acceptance report](./docs/verification/reports/S3/s3-acceptance.html)

Проверить все экраны и permission boundaries. Завершить состояния загрузки,
ошибок и conflicts. Пройти preview/revoke, independent page versions, native
control A, modified B, sticky allocation и consent-gated analytics.

Выход: отдельный браузер посетителя открывает результат без панели; второй
project/page недоступен чужой capability; ручные контрольные события совпадают
с числами отчёта; winner не меняет обычный URL.

### S4 — npm для SPA

Переиспользовать PageSession/journal из S2; подключить route/hydration hooks и
bounded reconciliation. React fixture и adapter — рекомендуемый первый стек;
Vue fixture проверяет framework-independent boundary. Готовый Vue adapter
идёт следом. Документировать поддерживаемые DOM roots и команды.

Первый cooperative npm adapter регистрирует targets/roots и минимальный набор
разрешённых overrides через props/store, которые отображает сам framework.
Структурные команды гарантируются внутри Lykar-owned regions; arbitrary
framework-owned nodes не получают обещание безопасного move/delete. Контракт
будущего component/action registry определяется здесь, полный каталог — FUT-08.

Выход: A→B→A, back/forward, async mount, hydration, re-render и повторный
mount/unmount не смешивают версии и аналитику. Дубликаты listeners/nodes/events
не накапливаются. Все structural commands работают в Lykar-owned roots;
неподдерживаемые мутации framework-owned nodes отклоняются с reason code.

### S5 — Explicit production deployment

Добавить Deployment/activation history и отдельные Deploy, Disable, Rollback.
Обычный URL применяет release только при включённой delivery-настройке и явном
active deployment. Защитить переключение revision и определить cache/revocation
границы; runtime failure не оставляет пустую страницу.

Выход: publish не меняет host; deploy меняет; disable возвращает native;
rollback выбирает прежний immutable Release. Invalid explicit token оставляет
native и при существующем production deployment. Проверены сбои resolve и
зависание API, история действий доступна в Admin.

До завершения S5 измерить replay/layout impact на fixture, проверить bounded
anti-flicker: timeout не оставляет страницу скрытой. Private manifests/access
decisions не кэшируются как публичные assets; задержка смены deployment известна.
Server/edge delivery остаётся отдельным будущим вариантом для более строгих
требований к мерцанию и SEO.

### S6 — Публичный SaaS

CI/staging, production email, rate limits, domain verification, sitemap import,
CDN/asset rollback, jobs, backups/restore, audit/data deletion, metrics и
compatibility matrix. Закрыть параметры среды из SPEC §25.

Выход: fresh deployment и restore воспроизводимы, сервис отправляет реальные
magic links, секреты отсутствуют в dist/logs, контролируемые failures не ломают
host. Публикация выполняется отдельным явным действием.

### S7 — AI, Workspace, billing и дополнительные интеграции

Выполнять отдельными срезами по FUT-01…FUT-06 и FUT-08. Реестр компонентов/действий
зависит от S4 и разрешает только интеграции, зарегистрированные самим host.
Обязательная billing-граница:
расчёт usage/limits тестируется без сети; Payment Provider внедряется через DI.
AI всегда создаёт reviewable proposal; keys остаются на backend.

Зависимости: `S0 → S1 → S2 → S3 → S4 → S5 → S6`; S7 не требуется для завершения
рабочей V1. Часть production checks начинается раньше, в соответствующем модуле.
Календарные оценки даются после S0, когда известны baseline failures.

План прототипа: `X1 (spec/handoff) → X2 (validator) → X3 (pilot)`.
X1 использует S2 и проверенные версии/share из S3. X2 требует X1, строгий resolver
и browser harness; рабочий приоритет X2 — после первого adapter S4. Для static-only
runner полный S4 технически не обязателен; проверка SPA source зависит от S4.
X3 требует X2 и проводится на согласованных fixtures/пилотных проектах.

Порядок выбора следующей задачи: `S0 → S1 → S2.1 → S2.2 → S2.3 → S2.4 → S3 →
S4 → X1 → X2 → S5 → S6 → S7`. X3 можно выполнить после X2; он не является gate
для S5/S6. Основной delivery V1 не зависит от успеха новой продуктовой гипотезы.
Guides, AI provider и расширенная A/B-статистика не блокируют X1/X2.

### 7.1 Готовые средства и собственные реализации

| Область | Выбор | Когда |
| --- | --- | --- |
| Browser E2E и acceptance | Playwright, один общий harness; отдельные replay/source suites | S0, X2 |
| Accessible name/description | Оценить dom-accessibility-api в resolver/editor tooling; учитывать bundle cost | S2.1 |
| Панель и будущие guides | Shadow DOM; Floating UI для anchored positioning и cleanup | S2.4 |
| Lifecycle/наблюдение | AbortController и native observers, scope на root, bounded retry | S2.2, S4 |
| Protocol/targets/executor | Собственные небольшие модули с явными invariants и compatibility fixtures | S1–S2 |
| Backend consistency | Существующие Fastify/PostgreSQL, transactions/revisions/idempotency | S2.4, S3, S5 |

Новые зависимости добавляются при соответствующей реализации и фиксируются в
lockfile. CRDT, полная test platform и замена backend stack не требуются.

## 8. Правила исполнения этапов

1. В task/PR указывать IDs требований и изменяемые пакеты.
2. Сохранять обратную совместимость уже опубликованных manifests.
3. Не заменять существующую реализацию целиком ради нового SDK или сборщика.
4. Закрывать этап runnable сценариями и результатами проверок, а не числом файлов.
5. При неизвестном поведении ставить «не проверено», а не «готово».
6. Обновлять SPEC при изменении продуктовой семантики, architecture docs при
   изменении интерфейсов, этот реестр — при изменении состояния требований.
7. Документировать известные ограничения и оставшиеся проверки на выходе этапа.

## 9. Рекомендуемый следующий рабочий этап

Начать с **S0 + контракта S1**: получить проверенный end-to-end baseline, затем
превратить текущие runtime/editor bundles в один продуктовый способ подключения.
Результат первого среза: обычный пользователь ставит один script, открывает
редактор из Admin и получает рабочую сохранённую ссылку без playground glue.

Решения, которые не блокируют начало: production hosting/CDN, email/AI/payment
provider, конкретные цены. Для первого SPA среза предполагается React; список
гарантируемых framework/browser versions фиксируется по пройденным fixtures,
а не через обещание поддержки «любого сайта».
