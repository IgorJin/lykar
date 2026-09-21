# Lykar Project Specification

Status: active product and engineering specification

Audience: engineers and coding agents

Language: Russian prose with canonical English domain names

Canonical product name: **Lykar**

## 1. Назначение документа

Этот документ является основным контрактом проекта Lykar. Он определяет
продуктовые границы, доменную модель, обязательные инварианты, пользовательские
сценарии, требования безопасности и критерии готовности.

При расхождении документов приоритет следующий:

1. `SPEC.md`;
2. документы в `docs/architecture/`;
3. package-level `README.md`;
4. существующая реализация и тесты.

Если реализация расходится с `SPEC.md`, coding agent MUST явно отметить это в
плане работы. Он MUST NOT незаметно менять продуктовую семантику ради упрощения
реализации.

Ключевые слова MUST, MUST NOT, SHOULD, SHOULD NOT и MAY являются нормативными.

### 1.1 Метки состояния

- **Implemented** — присутствует в текущем monorepo и покрывается тестами.
- **MVP** — обязательно для завершения базового продукта.
- **Production** — обязательно перед публичным SaaS-запуском.
- **Post-MVP** — целевое развитие после завершения MVP.
- **Deferred** — признано полезным, но срок не определён.

### 1.2 Рабочая V1 — уточнение от 2026-09-16

Базовый MVP ниже сохраняет ранее согласованный static/SSR сценарий. Текущая
цель разработки — рабочая V1: завершённый MVP, единый script/npm SDK, первый
поддерживаемый SPA lifecycle, target recovery и explicit Deploy/Disable/Rollback.
Реальный AI-provider, Workspace и billing остаются последующими этапами.

Единый реестр требований, состояние по коду и критерии завершения находятся в
[ROADMAP.md](./ROADMAP.md). Границы библиотеки, сборки и SPA определены в
[technical-vision.md](./docs/architecture/technical-vision.md). Это целевой план,
а не утверждение о готовности новых API. Метки Implemented в этой спецификации
не заменяют свежий build/test/browser acceptance report.

Маркетинговые рекомендации не становятся нормативными требованиями автоматически.
Под «rollback» применительно к сборке в текущем запросе предполагается Rollup.

Предложение Visual Change Request / expected-state validation / guides разобрано
в [RFC Visual Spec](./docs/architecture/visual-spec-review.md). Ветка X1–X3 в
ROADMAP включена в план прототипирования 2026-09-20; она не меняет права
runtime и формат существующих Release. Assertions и Guide steps не являются
исполняемыми DOM Operations. Включение полноценной Visual Spec в обязательную
V1 определяется после X3; guides остаются последующим предложением.

### 1.3 Техническая очередь — уточнение от 2026-09-20

Новые требования COR-01…COR-08 и связанные integration/quality требования в
ROADMAP являются запланированной работой по надёжности. Их порядок:
строгие targets → PageSession → executor/journal → persistence/editor →
framework adapter. Browser проверки начинаются на S0 и расширяются в каждом
срезе. Новые правила ниже — целевые требования V1, а не заявление о готовности
текущего кода. Детальные S0-задачи и следующая очередь находятся в TASKS.md.

## 2. Определение продукта

Lykar — облачная SaaS-платформа для визуального изменения страниц сайта без
редактирования его исходного кода, с сохранением изменений как переносимой
последовательности команд, immutable-версиями, защищённым preview и
экспериментами.

Основная ценность продукта в порядке приоритета:

1. визуальное редактирование установленного сайта без доступа к его source
   repository;
2. инфраструктура drafts, immutable releases, preview и экспериментов для
   отдельных страниц;
3. интерфейс, через который AI-агенты после MVP смогут предлагать изменения,
   подтверждаемые человеком.

Lykar MUST изменять DOM через декларативный, версионируемый command protocol.
Он MUST NOT сохранять изменённую копию всей страницы как основной формат
версии.

## 3. Целевой пользователь

Первичный пользователь — владелец небольшого сайта. Он может не иметь доступа
к source repository и не обязан уметь программировать.

Типичная установка:

1. разработчик или владелец один раз добавляет Lykar script на сайт;
2. владелец управляет страницами и версиями через Admin;
3. редактор открывается поверх настоящей страницы;
4. изменения сохраняются в Lykar, а не в CMS или repository сайта.

Дополнительные пользователи: маркетолог, дизайнер, агентство, product team и
AI-agent. Их потребности MUST NOT ухудшать основной сценарий владельца
небольшого сайта.

## 4. Цели и нецели

### 4.1 Цели MVP

- подключить статический или SSR-сайт одним script tag;
- добавить сайт и точные страницы в Admin;
- визуально выбрать DOM element и изменить его через side panel;
- локально preview изменения до записи на backend;
- сохранить изменения как protocol operations в Draft;
- зафиксировать Draft как immutable Release;
- открыть Release по защищённой ссылке;
- создать варианты A и B для одной страницы;
- открыть публичную A/B-ссылку и получить sticky traffic allocation;
- записать consent-gated exposure и explicit conversion events;
- показать корректный descriptive analytics report;
- оставить обычный URL сайта неизменённым без явного Lykar deployment.

### 4.2 Нецели MVP

- редактирование исходного кода сайта или CMS;
- гарантированная поддержка SPA reconciliation;
- произвольный JavaScript в командах;
- автоматическое изменение production URL после Publish;
- настоящий AI-provider;
- статистическая рекомендация победителя;
- browser extension; npm-интеграция не требуется для базового MVP, но входит в V1;
- route templates;
- cross-device identity;
- встроенная платёжная система.

## 5. Архитектурные принципы

1. **Host safety.** Отказ Lykar MUST оставлять исходную страницу доступной.
2. **Explicit activation.** Publish и production activation MUST быть разными
   действиями.
3. **Immutable releases.** Опубликованный Release MUST NOT изменяться.
4. **Page isolation.** Drafts, versions и experiments принадлежат одной Page.
5. **Command persistence.** Версия хранится как ordered operations, а не HTML.
6. **Human control.** Agent proposals MUST NOT применяться без подтверждения.
7. **Least privilege.** Все tokens и capabilities MUST быть ограничены целью,
   страницей и временем жизни.
8. **Privacy minimization.** Lykar MUST NOT автоматически сохранять полный HTML,
   текст страницы, полный URL или IP в продуктовой аналитике.
9. **Provider independence.** Email, AI, payment и metering integrations MUST
   подключаться через application interfaces.
10. **Progressive support.** MVP оптимизирован для static/SSR DOM; SPA support
    MUST появиться отдельным совместимым слоем в V1 с явной compatibility matrix.

## 6. Доменная модель

### 6.1 Target model

```text
Workspace (Post-MVP)
├── Memberships
├── Subscription + Entitlements
└── Projects (connected sites)
    ├── Origins
    ├── Project Memberships (MVP)
    └── Pages (exact pathname)
        ├── Drafts
        │   └── Operations
        ├── Releases
        ├── Share Links
        └── Experiments
            ├── Variants A/B
            ├── Entry Links
            ├── Assignments
            └── Analytics Events + Rollups
```

### 6.2 Workspace — Post-MVP

`Workspace` — будущий account/billing boundary. Он нужен, чтобы один владелец
или команда могли иметь несколько сайтов, один тариф и общие лимиты.

Workspace SHOULD владеть:

- Projects;
- workspace-level users и invitations;
- subscription;
- entitlements и usage meters;
- общими настройками provider integrations.

MVP MUST NOT добавлять Workspace только ради будущего биллинга. Текущие
project-scoped memberships остаются корректной MVP-моделью. При последующей
миграции Project MUST получить `workspaceId`; существующий owner проекта
становится owner созданного Workspace. Project-level access MAY остаться для
ограничения пользователя отдельными сайтами.

### 6.3 Project — Implemented

`Project` представляет один подключённый сайт и содержит:

- stable internal ID;
- public script key `pk_*`, который является идентификатором, а не secret;
- одно или несколько разрешённых Origins;
- Pages;
- project-scoped Memberships.

Origin MUST нормализоваться и проверяться при runtime/editor exchange. Один
Project MAY иметь production, staging и localhost Origins.

### 6.4 Page — Implemented

`Page` представляет один exact normalized pathname, например `/pricing`.

- Query string MUST NOT создавать отдельную Page.
- Release numbering MUST быть независимым для каждой Page.
- MVP MUST поддерживать только exact pathname.
- Route patterns (`/products/:slug`, `/blog/*`) являются Post-MVP.
- Страницы создаются вручную в MVP.
- Sitemap import является Production requirement.
- Полный crawler является Deferred.

### 6.5 Draft — Implemented

`Draft` — изменяемое состояние следующей версии Page.

- На Page SHOULD быть не более одного open Draft для обычного workflow.
- Draft MAY ссылаться на base Release.
- Draft имеет monotonic `revision` для optimistic concurrency.
- Сохранение с устаревшим `expectedRevision` MUST вернуть conflict.
- Локальные pending operations MUST сохраняться в session-scoped storage до
  успешного backend save.

Для V1 сохранение MUST поддерживать idempotency key, ограниченный actor/project/
draft и связанный с payload. Повтор того же запроса после потери ответа MUST NOT
добавлять operations второй раз. Тот же key с другим payload MUST давать conflict.
Operations, revision и результат idempotent save MUST записываться атомарно.

### 6.6 Operation — Implemented

`Operation` — одна декларативная DOM-команда protocol v1. Поддерживаются:

- `setText`;
- `setStyle`;
- `setAttribute`;
- `removeAttribute`;
- `insertNode`;
- `removeNode`;
- `moveNode`.

Копирование node в protocol v1 выражается как `insertNode` с безопасно
сериализованным clone. Если появится отдельная `copyNode`, это потребует новой
совместимой версии protocol.

Каждая Operation MUST иметь:

- stable operation ID;
- schema version;
- target locator;
- payload соответствующего kind;
- optional precondition;
- optional actor metadata (`human`, `agent`, `system`).

Target resolution SHOULD использовать marker, затем CSS/XPath fallback и
fingerprint. Runtime MUST валидировать Operation до мутации DOM.

V1 TargetRegistry SHOULD поддерживать логические targets и versioned bindings
для разрешённых environments/roots. Release MUST фиксировать descriptor или
immutable binding version, а не автоматически читать изменяемую «последнюю»
привязку. Resolver MUST различать unique/missing/ambiguous/invalid; несколько
подходящих candidates MUST NOT разрешаться выбором первого.

Copy/add сериализованного DOM MUST NOT объявляться переносом host event handlers,
component state или бизнес-логики. Функциональное создание registered components
является отдельной opt-in интеграцией host после первого adapter.

### 6.7 Release — Implemented

`Release` — immutable ordered manifest операций одной Page.

- Version — положительное целое, независимое внутри Page.
- Publish MUST атомарно зафиксировать manifest, hash и source snapshot.
- Release MUST NOT изменяться или удаляться обычной domain operation.
- Изменение опубликованной версии создаёт новый Draft и новый Release.
- Publish MUST NOT автоматически влиять на ordinary host URL.

### 6.8 Production Deployment — V1, planned

Production Deployment — явная привязка Page к одному immutable Release для
обычного URL без query token.

- `Publish` только создаёт Release.
- `Deploy` активирует выбранный Release.
- `Rollback` создаёт новую deployment activation на предыдущий Release.
- Activation MUST иметь actor, timestamp и reason.
- Runtime failure MUST fail open к исходной странице.
- До реализации deployment ordinary URL MUST оставаться native.

### 6.9 Experiment — Implemented

Experiment принадлежит одной Page и содержит ровно варианты `A` и `B`.

- Variant MAY ссылаться на Release или native page.
- Только один Experiment MAY быть active на Page.
- Lifecycle: `draft -> active <-> paused -> completed`.
- Releases и weights MUST стать immutable после первого activation.
- Completed Experiment MUST NOT перезапускаться; повторный запуск создаёт copy.
- Completion MAY записать winner `A`, `B` или `null`.
- Winner MUST NOT автоматически становиться production deployment.

## 7. Пользовательские роли

### 7.1 MVP roles — Implemented

- `Owner`: все права, ownership transfer.
- `Admin`: управление members, releases, sharing, experiments и analytics.
- `Editor`: изменение Draft и подготовка draft Experiment.
- `Viewer`: read-only project access без visitor analytics.

Project MUST иметь ровно одного активного Owner. Отзыв edit permission MUST
немедленно инвалидировать editor capabilities пользователя.

### 7.2 Future Workspace roles

Workspace roles SHOULD управлять billing и созданием Projects. Project access
MAY дополнительно ограничивать пользователя конкретными сайтами. Billing role
MUST быть отделима от права редактировать DOM.

## 8. Подключение сайта

### 8.1 Основной способ — MVP

Основной integration surface — script tag:

```html
<script src="https://cdn.lykar.example/runtime.iife.js"></script>
<script>
  Lykar.init("pk_project", {
    apiBaseUrl: "https://app.lykar.example"
  });
</script>
```

- Script MUST быть framework-independent.
- Public project key MUST NOT предоставлять admin/editor права.
- Runtime MUST передавать normalized pathname.
- Без активного режима runtime SHOULD завершаться без manifest request.

### 8.2 Script/npm SDK — V1, planned

`@lykar/sdk` MUST объединять visitor playback, editor launch и share exchange.
Script installation MUST NOT требовать копирования orchestration из playground.
Editor SHOULD загружаться отдельно по требованию, после проверки capability.

- Rollup dist: script IIFE и npm ESM с TypeScript declarations;
- оба способа используют одни protocol/runtime и одинаковые manifests;
- npm import MUST быть безопасен в SSR environment;
- SPA integration MUST учитывать route changes, DOM ownership, cleanup и отмену
  устаревшего replay; одного ESM bundle недостаточно;
- версии package, protocol и page Release MUST различаться;
- изменение сборки MUST сохранять поддерживаемые текущие runtime entry points
  либо иметь документированный compatibility bridge.

### 8.3 Последующие способы

- browser extension — Post-MVP;
- CMS-specific plugins — Deferred;
- API/SDK for agents — Post-MVP.

Все способы MUST использовать один manifest и command protocol.

## 9. URL modes

| URL mode | Назначение | Доступ | Analytics |
| --- | --- | --- | --- |
| `/pricing` | native page; позднее active deployment | public | off для MVP |
| `?version=N` | immutable preview | editor/share capability | off |
| `?lykar_variant=<token>` | точный вариант A или B для QA | bearer link | off |
| `?lykar_experiment=<token>` | weighted A/B traffic entry | public bearer link | consent-gated |

Invalid, expired, revoked, path-mismatched, paused или completed token MUST
оставлять страницу native. Runtime MUST NOT подменять недоступный вариант
другим Release.

## 10. Editor workflow

### 10.1 Запуск — Implemented

1. Пользователь входит в same-origin Admin по email magic link.
2. Нажимает `Открыть редактор` у конкретной Page.
3. Backend создаёт short-lived, one-time, page-bound launch code.
4. Host page открывается в новой вкладке.
5. Editor bridge обменивает code на revocable capability и удаляет code из URL.
6. Overlay и side panel работают поверх host page без iframe.

Admin cookie MUST NOT копироваться на host origin.

### 10.2 Редактирование — Implemented

- Hover layer показывает потенциальный target.
- Selection layer фиксирует выбранный element.
- Разные действия MAY иметь отдельные overlay layers.
- Текст редактируется через side panel, не через `contenteditable`.
- MVP styles сохраняются как inline styles.
- Operation preview выполняется локально сразу.
- `Undo/Redo` MUST работать над локальной command history.
- `Применить` сохраняет pending operations на backend.
- Publish выполняется отдельно в Admin.

### 10.3 Change Tree — MVP

Change Tree MUST показывать ordered operations как отдельные сущности с ID,
kind, target и текущим apply status.

При наведении на change editor SHOULD подсвечивать соответствующий connected
DOM element. Statuses:

- `applied`;
- `skipped` с reason code;
- `error` с reason code.

Replay SHOULD продолжаться после локальной ошибки. Один неисполняемый change
MUST быть пропущен и отражён в отчёте, а не ломать host page.

В V1 зависимые от неуспешной операции changes MUST получать diagnostic
`DEPENDENCY_UNAVAILABLE`; независимые продолжаются. Ledger MUST покрывать
повтор replay и идентичность новых elements/text nodes. Для компенсации MUST
использоваться before/after journal и compare-and-restore, не затирающий более
поздние изменения host. Неудачная безопасная компенсация MUST отражаться в report.

## 11. Source drift и target recovery

Lykar MUST считать исходный сайт внешней изменяемой системой: WordPress, Tilda
или владелец могут изменить DOM в любое время.

### 11.1 Detection — Implemented

- При сохранении Draft фиксируется normalized DOM fingerprint.
- Release содержит immutable source snapshot hash.
- Runtime сравнивает current page hash с expected hash.
- Page-level mismatch является diagnostic signal, а не автоматическим запретом.

Structural fingerprint MUST NOT описываться как гарантия визуального совпадения:
изменение stylesheet может не менять этот hash. Visual/computed-property checks
относятся к отдельному validation layer с явно заданным context.

### 11.2 Apply policy — MVP

- Каждая Operation проверяется независимо.
- `TARGET_NOT_FOUND` MUST приводить к `skipped`, не к mutation error.
- Unsafe payload, protocol violation или невозможная DOM mutation являются
  errors.
- Публикация/запуск MAY быть заблокированы mutation errors.
- Обычный `TARGET_NOT_FOUND` SHOULD NOT автоматически блокировать Release.

### 11.3 Recovery — Production

Admin/editor SHOULD предоставлять осторожный recovery flow:

1. показать drift report до activation;
2. связать failed Operation с прежним target descriptor;
3. позволить человеку выбрать новый DOM element;
4. создать новую Operation/новый Draft, не изменяя старый Release;
5. preview исправленную полную цепочку;
6. только затем разрешить новый Release.

Автоматическое fuzzy rebind MAY предлагать candidate, но MUST NOT молча менять
target опубликованной команды.

## 12. Preview и sharing

- `?version=N` MUST требовать editor или share capability.
- Share URL создаётся на Lykar origin как `/share/<opaque-token>`.
- Share token MUST храниться только как hash.
- Share MUST поддерживать expiry и revoke.
- Share redirect MUST обменять token на one-time code, чтобы исходный token не
  оставался на host URL и не утекал через referrer.
- Share открывает только результат immutable Release, без editor UI.

## 13. Traffic allocation и A/B analytics

### 13.1 Что такое A/B-ссылка

A/B-ссылка — обычный URL подключённой Page с public experiment entry token:

```text
https://mysite.example/pricing?lykar_experiment=<opaque-token>
```

Это одна ссылка для всех участников эксперимента. При открытии backend:

1. проверяет active Experiment и exact pathname;
2. получает или создаёт anonymous browser ID;
3. детерминированно назначает A или B по весам;
4. сохраняет sticky assignment;
5. возвращает native selection или immutable Release manifest.

По умолчанию weights равны 50/50 и MAY настраиваться до первого activation.
Assignment сохраняется на 30 дней через first-party cookie с `localStorage`
fallback. Backend хранит только SHA-256 visitor hash.

Прямая `lykar_variant` ссылка выбирает конкретный A или B и предназначена для
QA. Она не является A/B traffic entry и не записывает analytics.

### 13.2 Consent — Implemented

- Assignment и показ DOM MAY работать при consent `pending`.
- Exposure и conversion MUST NOT отправляться до `granted`.
- При `denied` события MUST быть отброшены.
- Host интегрирует consent через `runtime.consent(...)`.
- `Lykar.track(name, properties)` отправляет только explicit conversion.

### 13.3 Что показывает отчёт

Для каждого варианта отчёт MUST показывать:

- `visitors`: assignments с минимум одним exposure;
- `views`: количество exposure events;
- `uniqueConversions`: exposed assignments с минимум одной conversion;
- `conversions`: общее число conversions от exposed assignments;
- `conversionRate`: `uniqueConversions / visitors`;
- `upliftVsA`: относительное изменение conversion rate против A.

Отчёт MVP является descriptive. Он MUST NOT заявлять статистического победителя
без significance model. Owner/Admin вручную сохраняет winner или `null`.

### 13.4 Privacy и retention

- Raw event MUST NOT автоматически содержать IP, full URL, page HTML или text.
- Event properties ограничены scalar values и validated names.
- Raw events хранятся 90 дней по умолчанию.
- Aggregate counters MAY храниться дольше, чтобы pruning не менял отчёт.
- Revocation или завершение Experiment останавливает новые assignments, но не
  удаляет исторический report.

## 14. Authentication и authorization

- MVP login — passwordless email magic link.
- Magic link MUST быть one-time, expiring и храниться только как hash.
- Admin session MUST использовать HttpOnly, SameSite cookie.
- Admin и API SHOULD работать на одном origin.
- State-changing Admin requests MUST иметь CSRF protection.
- Cross-origin editor получает scoped capability, а не Admin cookie.
- Public links являются bearer capabilities и MUST поддерживать revoke.
- Development TTL MAY быть длиннее production TTL.

## 15. Security model

### 15.1 Command protocol

Основной protocol MUST NOT поддерживать:

- JavaScript execution;
- script-capable nodes;
- inline event handlers;
- `srcdoc`;
- опасные URL schemes;
- удаление document roots;
- произвольный невалидированный HTML.

Эти ограничения действуют и для Owner. Расширенная программная интеграция MAY
появиться как отдельный opt-in Extension API с отдельным threat model, но MUST
NOT ослаблять основной protocol.

### 15.2 Token storage

Secrets, magic links, share links, variant links и experiment links MUST
храниться только как cryptographic hashes. Raw token возвращается только при
создании.

### 15.3 Agent safety — Post-MVP

Текст и DOM подключённого сайта являются untrusted input. Agent MUST NOT
выполнять инструкции, найденные внутри DOM. Server MUST валидировать каждую
agent-generated Operation тем же protocol validator, что и human operation.
Agent MUST создавать proposal; применение требует human confirmation.

## 16. Platform support

### 16.1 MVP

- static HTML;
- server-rendered pages со стабильным DOM после `DOMContentLoaded`;
- WordPress/Tilda pages, если они позволяют установить script и DOM стабилен;
- актуальные Chrome, Safari, Firefox и Edge;
- desktop и mobile viewport с одной общей operation chain;
- responsive inline styles в рамках возможностей исходной страницы.

### 16.2 Первая SPA-поддержка — V1, planned

- framework-independent root/route lifecycle;
- npm adapter и test fixture для первого framework; рабочее предположение — React;
- ожидание mount/hydration, race cancellation, bounded reapply и cleanup;
- все команды внутри Lykar-owned/unmanaged roots;
- проверенный набор операций внутри framework-owned tree;
- неподдерживаемая structural mutation MUST отклоняться с diagnostic, а не
  обещать безопасность при последующем framework render;
- analytics MUST различать route visit и re-render одного посещения.

PageSession MUST отменять устаревшие async tasks, проверять generation перед
мутацией и освобождать свои resources при destroy. Framework adapter использует
этот lifecycle. Дополнительная cooperative npm integration SHOULD позволять
host регистрировать targets/roots и применять разрешённые overrides через
props/store самого framework, без blind force replay component-owned DOM.

Гарантируемая matrix MUST указывать framework/browser versions, ownership mode и
поддерживаемые operations. Поддержка arbitrary React/Vue DOM не предполагается.

### 16.3 Post-V1

- дополнительные React/Vue/framework adapters и расширение reconciliation support;
- приложения с BFF и динамической client-side navigation;
- route patterns;
- breakpoint-specific operations;
- отдельные mobile/desktop variants при доказанной необходимости.

## 17. AI-agent proposals — Post-MVP

Настоящий AI-agent не входит в базовый MVP. Существующий `ProposalProvider` и
dummy-provider являются подготовленной границей интеграции.

Целевая модель:

- provider работает только server-side;
- API key никогда не попадает в browser;
- selected DOM subtree, bounded styles и optional screenshot передаются как
  минимально необходимый context;
- page content считается untrusted;
- provider возвращает explanation и protocol operations;
- человек preview, принимает частично/полностью или отклоняет proposal;
- принятые operations входят в обычный local Change Tree;
- backend persistence происходит только по общей кнопке `Применить`;
- agent history не хранит DOM/screenshots по умолчанию.

AI integration SHOULD использовать provider-neutral `AgentProvider` interface.
Конкретный provider является dependency injection.

## 18. Billing, metering и entitlements — Post-MVP architecture

Lykar MUST отделять три понятия:

1. **Metering** — измерение usage;
2. **Entitlements** — расчёт доступных функций и лимитов;
3. **Payment Provider** — invoices, checkout и payment status.

Domain logic MUST NOT импортировать SDK Stripe или другого платёжного сервиса.

### 18.1 Нормативные интерфейсы

```ts
type UsageMetric =
  | 'projects'
  | 'members'
  | 'analytics_events'
  | 'agent_requests';

type Entitlements = {
  maxProjects: number;
  maxMembers: number;
  analyticsEventsPerMonth: number;
  agentRequestsPerMonth: number;
  features: ReadonlySet<string>;
};

interface UsageMeter {
  increment(workspaceId: string, metric: UsageMetric, amount: number): Promise<void>;
  read(workspaceId: string, period: string): Promise<Record<UsageMetric, number>>;
}

interface EntitlementPolicy {
  calculate(input: {
    plan: string;
    subscriptionStatus: string;
    overrides?: Record<string, number | boolean>;
  }): Entitlements;
}

interface BillingProvider {
  createCheckout(input: unknown): Promise<{ redirectUrl: string }>;
  createPortal(input: unknown): Promise<{ redirectUrl: string }>;
  getSubscription(externalCustomerId: string): Promise<unknown>;
  verifyWebhook(payload: Uint8Array, signature: string): Promise<unknown>;
}
```

### 18.2 Правила

- `EntitlementPolicy` MUST быть deterministic и unit-testable без сети.
- Payment webhook MUST обновлять локальное subscription state, а не напрямую
  включать feature внутри request handler.
- Usage MUST быть idempotent для повторно доставленных events.
- Provider-specific IDs MUST храниться только в integration tables.
- Смена Payment Provider MUST NOT требовать миграции Projects, Releases или
  analytics domain.
- MVP MAY использовать unlimited/local entitlement implementation.

Предлагаемые tariff dimensions: количество Projects, Members, monthly analytics
events и monthly agent requests. Конкретные планы и цены остаются открытым
product decision.

## 19. Data lifecycle и privacy

- Project deletion MUST каскадно удалять Pages, Drafts, Releases, capabilities,
  Experiments, assignments и analytics согласно retention policy.
- Полный HTML и полный текст страниц MUST NOT сохраняться автоматически.
- Source snapshot хранит structural hash, не raw DOM.
- Agent DOM context и screenshots MUST NOT сохраняться по умолчанию.
- Пользовательские event properties MUST документированно запрещать PII.
- До production launch MUST появиться auditable data deletion flow.
- Региональное размещение данных и formal compliance являются открытыми
  production decisions.

## 20. Failure semantics

- Runtime/API outage MUST оставлять host page native.
- Invalid public token MUST выглядеть как отсутствие варианта и не раскрывать
  причину посетителю.
- Частично неисполняемый Release MUST вернуть operation-level report.
- Runtime MUST NOT повторно применять один Release к одному Document без
  explicit force в static режиме. В SPA V1 идемпотентность MUST учитывать Page,
  route generation, Operation и node identity; новый route render не является
  основанием безусловно повторить всю цепочку с force.
- Analytics ingestion MUST быть idempotent по client event ID.
- Duplicate save с тем же revision MUST NOT создавать двойные Operations.
- Необработанная ошибка Admin/API MUST иметь stable error code и не раскрывать
  secrets или SQL details.

## 21. Observability и operations

### 21.1 MVP

- health endpoint;
- structured backend logs;
- migration ledger и advisory lock;
- unit, integration и full-stack E2E tests;
- playground с exact Page isolation;
- analytics prune command.

### 21.2 Production

- request/error metrics без token и visitor leakage;
- audit log для publish, deploy, role, share и experiment lifecycle;
- background job runner для retention и email;
- backup/restore verification;
- CDN strategy для runtime bundle;
- release compatibility policy;
- rate limits для auth, runtime resolve, analytics и future agent API;
- SLO и incident procedure.

## 22. MVP acceptance criteria

MVP считается функционально завершённым, когда следующий сценарий проходит в
автоматическом E2E и вручную в поддерживаемом browser:

1. Owner входит по email magic link.
2. Создаёт Project с разрешённым Origin.
3. Добавляет Page с exact pathname.
4. Подключённый script и public key корректно идентифицируют Project/Page.
5. Owner открывает overlay editor на реальном host page.
6. Выбирает element и выполняет text, style, attribute и structural changes.
7. Preview применяется локально; Change Tree показывает результаты.
8. `Применить` сохраняет ordered operations и source fingerprint в Draft.
9. Publish создаёт immutable Release, не меняя ordinary URL.
10. Protected preview воспроизводит Release; revoke закрывает доступ.
11. Experiment содержит native A и Release B с заданными weights.
12. Одна `lykar_experiment` ссылка стабильно распределяет browsers между A/B.
13. При granted consent записываются exposure и explicit conversion.
14. Admin report корректно показывает visitors, views, unique conversions,
    conversions, CVR и uplift.
15. Завершение сохраняет winner только как metadata.
16. Ordinary URL без Lykar mode остаётся исходной страницей.
17. Target drift пропускает несовместимую Operation и объясняет reason, не ломая
    остальные команды и host page.

### 22.1 Дополнительные acceptance criteria рабочей V1

1. Script и установленный из package artifact npm SDK проходят один workflow
   без специального playground bootstrap.
2. Editor module не загружается обычному visitor без необходимости.
3. Реальные browser E2E проверяют выбор элемента, все команды, сохранение,
   reload, share access и результаты analytics.
4. Ручной target repair создаёт новый Draft/Release, не меняя старый Release.
5. SPA fixture проходит navigation A→B→A, back/forward, async render,
   hydration и mount/unmount без дублей nodes/listeners/exposures.
6. Неподдерживаемые framework-owned mutations объяснены до сохранения.
7. Publish не активирует deployment; Deploy/Disable/Rollback работают отдельно
   и имеют audit history.
8. Invalid explicit token оставляет native даже при active deployment.
9. Ambiguous target не вызывает мутацию случайного элемента; создание новой
   binding version не меняет результат старого Release.
10. Late response старой Page и повторные start/destroy не оставляют tasks,
    mutations или events в следующем route context.
11. Повтор save после потерянного ответа не дублирует commands; конфликт двух
    вкладок не приводит к потере локальных pending operations.
12. Partial mutation failure компенсируется в пределах ownership contract;
    undo не затирает новые значения host.
13. Медленный resolve/отказ API не оставляет страницу скрытой; size/replay/retry
    budgets определены и проверены на versioned fixtures.

## 23. План реализации

Подробные требования, доказательства состояния и критерии приёмки хранятся в
[ROADMAP.md](./ROADMAP.md). Порядок от 2026-09-16 уточнён 2026-09-20:
надёжность targets/lifecycle/executor предшествует framework и validation слоям.

1. **S0 — Baseline:** воспроизводимый стек, свежие проверки и первый browser E2E.
2. **S1 — SDK/distribution:** script, npm, Rollup dist, единый bootstrap и lazy editor.
3. **S2 — Editor/core:** S2.1 strict targets → S2.2 PageSession → S2.3 dependencies/
   ledger/journal → S2.4 idempotent persistence/editor/repair.
4. **S3 — Полный продуктовый путь:** Admin, access, versions, links, A/B и analytics.
5. **S4 — SPA:** первый adapter поверх PageSession, cooperative overrides,
   ownership matrix и browser fixtures.
6. **S5 — Deployment:** explicit Deploy/Disable/Rollback и delivery/cache semantics.
7. **S6 — Public SaaS:** email, domain verification, sitemap, CDN, CI, jobs,
   rate limits, audit, backup/restore и deletion.
8. **S7 — Развитие:** AI proposals, Workspace, metering/entitlements/payment DI,
   дополнительные framework/CMS/browser integrations и host component/action registry.

X1 (Visual Spec/handoff) использует S2/S3; X2 (read-only validator) — frozen
contract, strict resolver и browser harness, а для SPA contexts также S4.
Рабочий приоритет X1/X2 — после первого adapter; static-only validator не имеет
искусственной зависимости от React. X3 (pilot) идёт после X2 и не блокирует
deployment/public SaaS. Playwright применяется в browser E2E и validator;
конкретные зависимости добавляются только при реализации своего среза.

Advanced experimentation, audience targeting, statistical inference, более двух
вариантов, source export и self-hosting сохраняются как предложения для отдельных
этапов после V1. Они MUST NOT незаметно менять текущие A/B и privacy invariants.

## 24. Правила изменения спецификации

- Изменение domain invariant MUST обновлять `SPEC.md`, migration/tests и
  соответствующий architecture document в одном этапе.
- Новый URL mode, Operation kind или permission MUST иметь security review.
- Новый Operation schema MUST быть backward-compatible либо иметь явную
  migration/version negotiation strategy.
- Coding agent SHOULD ссылаться на раздел спецификации в plan и handoff.
- Невыполненное требование MUST быть отмечено как planned/deferred; его нельзя
  описывать как implemented.

## 25. Открытые продуктовые решения

До соответствующей фазы остаются открытыми:

1. конкретные тарифы и численные limits;
2. первый Payment Provider adapter;
3. production domain и CDN;
4. правила domain/origin verification;
5. регион хранения данных и compliance target;
6. точный UX production Deploy/Rollback;
7. первый реальный Agent Provider и модель;
8. критерии browser/version support window.

Эти решения MUST быть закрыты до реализации зависимой Production/Post-MVP
функциональности, но не блокируют завершение текущего MVP.
