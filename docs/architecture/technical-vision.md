# Lykar — техническое видение V1

Дата: 2026-09-16; технические зависимости уточнены 2026-09-20.
Статус: целевая архитектура; новые API ниже ещё не реализованы.

Продуктовый контракт: [SPEC](../../SPEC.md). Требования, состояние и этапы:
[ROADMAP](../../ROADMAP.md). Этот документ объясняет, как объединить текущий
проект в библиотеку, пригодную для script/npm и первого SPA-режима.

## 1. Топология

```text
Сайт пользователя
  script IIFE             npm ESM / framework adapter
       └──────────────────────┘
                 @lykar/sdk
        ┌────────────┴─────────────┐
  visitor runtime         editor bootstrap (lazy)
        │                 bridge + editor UI
        └────────────┬─────────────┘
        protocol + target resolver + DOM executor
                     │
             scoped HTTPS API
                     │
       Fastify API + Preact Admin (один origin)
                     │
       PostgreSQL + background jobs/provider adapters
```

Runtime остаётся framework-independent. Preact нужен для Admin и при переносе
editor UI; он не должен становиться зависимостью обычного visitor bundle.

### Границы пакетов

| Пакет | Ответственность |
| --- | --- |
| `@lykar/protocol` | Версия schema, operations, manifests, validators, reason codes |
| `@lykar/runtime` | Resolve, target matching, DOM replay, apply reports, consent/events |
| `@lykar/editor-bridge` | Selection/overlay, DOM references, command creation, local history |
| `@lykar/editor-ui` | Панель, формы, Change Tree, diagnostics, proposal review |
| `@lykar/sdk` | Публичная инициализация, режимы, capability exchange, lazy editor, lifecycle |
| `@lykar/react` / `@lykar/vue` (план) | Framework lifecycle/router adapters без отдельного command core |
| `apps/admin` | Проекты/страницы/версии/участники/эксперименты/отчёты/deployments |
| `apps/api` | Access policy, domain services, PostgreSQL repositories, integrations |
| `apps/playground` + SPA fixtures | Доказательство установки и пользовательских сценариев |

Сейчас `sdk` и `editor-ui` — scaffold. Фактическая панель находится в
`editor-bridge/src/panel.ts`. Переносить её отдельно следует при необходимости
UI-работ, без остановки работающего редактора ради перераскладки файлов.
`packages/lykar-lib` — legacy source, не второе активное ядро новой библиотеки.

## 2. Сборка и поставка

Предположение: «rollback» в запросе означает **Rollup**. Сейчас legacy library
собирается Rollup, новые runtime/editor — esbuild. План S1 унифицирует browser
library distribution на Rollup; сборка Admin/API не обязана менять инструмент.

Предлагаемые артефакты:

- `lykar.iife.js` — самодостаточный script bootstrap + лёгкий runtime;
- `index.js` — ESM SDK entry;
- `index.d.ts` — публичные TypeScript declarations;
- `editor.iife.js` — отдельный editor asset для script installation;
- ESM editor entry/chunks — для npm bundlers;
- asset manifest с версиями, hashes и compatibility metadata.

IIFE bootstrap и editor собираются отдельными entries/builds. ESM может иметь
chunks. Правила форматов и output задаются официальной
[документацией Rollup](https://rollupjs.org/configuration-options/#output-format).

Требования:

- одинаковая версия SDK/runtime/editor в опубликованном artifact set;
- immutable assets по versioned URLs, без перезаписи уже выпущенного файла;
- `.d.ts`, `exports`, `files`, CSS/assets и `npm pack` проверяются на consumer fixture;
- runtime не включает React/Vue/Preact; framework adapters используют peer dependencies;
- import ESM не обращается к `window`/`document` на верхнем уровне и безопасен для SSR;
- protocol version, package version и page Release version — три разных значения;
- incompatible manifest отклоняется до первой мутации, с diagnostic reason;
- package rollback означает возврат SDK asset version, production rollback —
  смену active page Release; эти действия независимы.

Названия namespace/package и CDN host в примерах проектные. Доступность npm
scope и production domain проверяется перед внешней публикацией.

## 3. Единая инициализация

Целевой API, а не пример уже существующего SDK:

```html
<script defer src="https://cdn.lykar.example/sdk/1.0.0/lykar.iife.js"
  data-lykar-project="pk_example"
  data-lykar-api="https://app.lykar.example"></script>
```

SDK распознаёт data attributes и выполняет bootstrap после готовности нужного
DOM root. Для CSP-запрещённого inline JS отдельный initialization block не нужен.
Ручной режим сохраняет constructor-shaped API:

```ts
import { Lykar } from '@lykar/sdk';

const lykar = new Lykar('pk_example', {
  apiBaseUrl: 'https://app.lykar.example',
  mode: 'static',
  delivery: 'links-only',
});

await lykar.start();
```

Constructor не выполняет сетевые запросы или DOM mutations. Public project key
идентифицирует сайт; он не является секретом и не даёт права редактировать.
Повторный `start()` не создаёт второй overlay, запросы или listeners.

SDK берёт на себя код, который сейчас приходится писать в playground:

1. Определить route и access mode.
2. При launch/share code выполнить ограниченный exchange и убрать code из URL.
3. Проверить page/origin, получить draft/release context.
4. Выбрать visitor playback либо lazy editor session.
5. Вернуть структурированный результат, не выбросить необработанную ошибку в host.

Editor module разрешено загрузить только с доверенного настроенного asset
origin; DOM/query input не может подменить адрес исполняемого модуля.

## 4. Access modes и deployment

| Контекст | Выбор результата |
| --- | --- |
| Валидный editor launch | Editor session конкретного Draft/Page |
| Валидный share exchange или authorized `version=N` | Один immutable Release, без editing UI |
| `lykar_variant` | Точный public QA-вариант, без analytics |
| `lykar_experiment` | Sticky A/B assignment + consent-gated analytics |
| Обычный URL и `delivery: links-only` | Native, без resolve-запроса |
| Обычный URL и `delivery: deployment` | Явный active deployment либо native |

Одновременные взаимоисключающие selectors отклоняются как ambiguous mode;
runtime не угадывает намерение по случайному приоритету query parameters.
Это новое правило V1; S1 должен проверить его влияние на текущие ссылки.

Invalid/expired/revoked explicit token даёт **native**, даже если у Page есть
production deployment. Нельзя молча заменить недоступный preview другим Release.

Deployment добавляет `activeReleaseId | null`, monotonic activation revision,
actor/time/reason и append-only activation history. Publish не меняет pointer.
Disable создаёт новую activation с `null`, rollback — с предыдущим Release.
Переходы конкурентно защищены ожидаемой revision.

Immutable public assets можно кэшировать долго. Access/assignment decisions и
private manifests не попадают в shared public cache. Cache TTL для deployment
pointer определяет гарантируемую задержку deploy/disable; предлагаемая начальная
верхняя граница — 60 секунд, проверяется на S5. Это не обещание мгновенно изменить
все уже открытые вкладки: новые resolve получают новый pointer, открытая SPA
обновляется на согласованном lifecycle event/refresh. Live push — отдельная задача.

## 5. SPA — отдельный lifecycle

Текущий runtime сохраняет `pathname` в constructor и отмечает release как
применённый на весь `Document`. При SPA-переходе Document остаётся прежним,
поэтому нужны другие границы применения.

Целевой интерфейс:

```ts
interface LykarLifecycle {
  start(): Promise<RuntimeResult>;
  navigate(input: { pathname: string; root: HTMLElement }): Promise<RuntimeResult>;
  refresh(): Promise<RuntimeResult>;
  destroy(): Promise<void>;
}
```

`RuntimeResult` в этом примере — будущий unified report. Signatures фиксируются
на S1 с compatibility bridge для нынешнего `@lykar/runtime`. PageSession и
generation/abort реализуются на S2.2, journal cleanup — на S2.3, framework hooks
подключаются на S4. Это позволяет проверить lifecycle до добавления React/Vue.

### Route transaction

1. Router adapter сообщает о новом pathname и готовом root после render/hydration.
2. SDK повышает `navigationGeneration` и отменяет предыдущие fetch/tasks.
3. Старые listeners, observer и editor selection отключаются; изменённые общие
   nodes восстанавливаются только если их состояние всё ещё принадлежит Lykar.
4. API получает exact pathname и page-bound capability этого посещения.
5. Ответ проверяется на generation/root/page до DOM mutation.
6. Выполняются target checks и последовательный replay.
7. Отчёт и exposure относятся к одному route visit; re-render не создаёт новый visit.

Hash-router по умолчанию не трактуется как набор Pages: нынешняя модель Page
основана на pathname. Это отдельная integration policy при появлении такого клиента.

### Framework-owned DOM

Hydration должна завершиться до внешних DOM mutations. React требует совпадения
server/client разметки при hydration; Vue предоставляет mount/update hooks.
Источники: [React hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot),
[Vue lifecycle](https://vuejs.org/api/composition-api-lifecycle.html).

Hooks помогают выбрать момент применения, но не передают Lykar владение всеми
дочерними nodes фреймворка. Поэтому compatibility задаётся явно:

| Режим | Гарантируемый объём |
| --- | --- |
| Static/stable SSR | Все согласованные команды |
| SPA с Lykar-owned/unmanaged root | Все команды внутри явно выделенной области |
| Framework-owned SPA tree | Проверенные text-leaf/style/attribute операции после render; остальные требуют специальной совместимости |
| Неизвестное владение/опасная структурная мутация | `UNSUPPORTED_HOST_MUTATION`, без silent best effort |

Для framework-owned tree `setText` не должен заменять child component tree.
Move/delete/copy framework nodes нельзя объявить поддержанными только потому,
что первоначальный DOM replay прошёл: следующий render может сломать host.
Поддержка таких операций добавляется по adapters/fixtures. UI объясняет
ограничение до сохранения команды.

### Cooperative npm integration

На S4 host получает opt-in API регистрации targets/roots и разрешённых overrides.
Минимальный React adapter передаёт overrides через props/store, после чего сам
framework отображает обновление. Он не даёт DOM executor право произвольно
перемещать component-owned children. Для unmanaged regions сохраняется DOM replay.

Единый transport/protocol не означает одинаковый mutation strategy: adapter
валидирует совместимый subset операций и применяет его через согласованный
host contract. Неподдержанный kind возвращает diagnostic до изменения UI.

Следующий срез FUT-08 — реестр host-approved компонентов/действий. Разработчик
регистрирует component/action ID и допустимые параметры; в editor выбирается
только разрешённый вариант. Исполняемый код остаётся в интеграции host, не в
manifest. Новый serialized payload требует отдельной schema/compatibility работы.

Copy/add статической разметки не копирует JS handlers, state или бизнес-логику.
UI сообщает это ограничение на S2.4; функциональный duplicate возможен лишь
там, где зарегистрированный компонент явно поддерживает такое создание.

### Reconciliation и ограничения

- Observer смотрит только согласованный root, игнорирует editor и собственные mutations.
- Updates coalesced; retries и время ожидания target ограничены.
- Re-render существующего node не создаёт дубликат `insertNode` или exposure.
- Ledger учитывает page/release/operation, route generation и actual node identity.
- Для сохранившегося node проверяется desired value; повторный stamp сам по себе
  недостаточен, если framework уже перезаписал значение.
- Pending editor operations сохраняются отдельно для Page/Draft; переход маршрута
  не записывает их автоматически и не применяет к следующей Page.
- Framework cleanup и повторный mount безопасны; React dev remount не плодит sessions.
- `destroy()` останавливает задачи и удаляет только свои listeners/nodes/styles.
- Для reapply нельзя использовать безусловный `force: true` всей цепочки.

## 6. Commands, зависимости и восстановление

### TargetRegistry и resolution — S2.1

Logical target имеет stable ID, scope/root и versioned bindings для сред.
Binding использует host marker/test ID, semantic/contextual признаки и
structural fallbacks. Semantic признаки дополняют identity и не позволяют
молча заменить target похожим элементом.

Resolver возвращает unique/missing/ambiguous/invalid и evidence. При нескольких
подходящих candidates выбор первого запрещён. Различать authoring before-state
и expected-state после изменения текста/атрибутов. Repair создаёт новое binding
или новый Draft; immutable Release не переписывается.

Текущий TargetDescriptor остаётся поддерживаемым входом. Изменение поведения
на ambiguity и введение новых bindings проверяются отдельными compatibility
fixtures и описываются в migration/release notes.

Structural fingerprint не является visual checksum: изменение stylesheet может
не менять DOM hash. Source drift report показывает границы наблюдения;
отдельные computed-property checks и optional visual evidence принадлежат
validation layer. Полный DOM/screenshots не начинают сохраняться автоматически.

### Ledger и journal — S2.3

Сервер хранит декларативные operations. Undo closures и `nodeElement` остаются
только в памяти editor/runtime; нельзя сериализовать DOM references.

Для S2 требуется проверить адресацию создаваемых узлов: `insertNode` → изменение
созданного child → move → duplicate. Новому узлу нужна стабильная идентичность,
а повтор replay не должен создавать второй экземпляр того же insertion.
Это относится и к text nodes: у них нет attribute marker, поэтому ledger и
identity strategy должны явно покрывать такой случай.

Независимые commands продолжаются после skip/error. Команды, зависящие от
неуспешного insertion/move, не должны случайно примениться к другому CSS-match:
они получают `DEPENDENCY_UNAVAILABLE`. Если для этого потребуется новый
serialized dependency field, изменение protocol оформляется с version negotiation
и backward compatibility; нельзя молча переинтерпретировать старые manifests.

Fingerprint снимается до Lykar mutations, исключает editor/служебные markers
и описывает структуру, а не сохраняет полный HTML. При SPA повторной проверке
нельзя выдавать изменённый Lykar DOM за новую исходную структуру. Adapter/root
lifecycle должен дать чистую baseline либо report `unknown`.

Page hash mismatch — предупреждение. Target preconditions решают локальную
применимость. Repair выбирает новый target руками, создаёт новый Draft и новый
Release; старый остаётся неизменным.

### Failure и отмена

Проверка payload выполняется до мутации. Одна операция должна либо закончиться,
либо компенсировать свою частичную мутацию. In-memory journal хранит before/after
и обратные действия для cleanup. Восстановление compare-and-restore не затирает
изменения, которые host сделал после Lykar.

Если безопасная компенсация структурного изменения невозможна, editor предлагает
reload; visitor runtime прекращает дальнейшие конфликтующие операции и возвращает
diagnostic. Нельзя обещать полное восстановление arbitrary live DOM заменой
`document.body.innerHTML`: это уничтожит состояние и обработчики host.
Полное возвращение native при новом посещении гарантируется выключением delivery;
для уже изменённого документа точный результат зависит от ownership contract.

## 7. Backend и storage

Сохраняем Fastify + PostgreSQL и существующие repositories/services. Новые
интеграции добавляются через interfaces, без переноса всей системы в новый стек.

Для V1:

- migrations вперёд без переписывания применённых файлов;
- capability checks на каждую Page и state-changing operation;
- Draft save с optimistic revision; добавить idempotency key/recovery чтением
  сохранённых operation IDs при потере ответа;
- Release publish и deployment activation атомарны;
- auth/email/session state отдельно от runtime selection;
- analytics ingestion идемпотентен и не блокирует отображение сайта;
- migrations, data deletion и retention имеют auditable результат.

Idempotency key ограничен actor/project/draft и связан с hash payload. Повтор
того же key с другим содержимым даёт conflict. Запись operations, увеличение
revision и сохранение результата запроса атомарны. Отдельно проверяется lost
response и повтор save из второй вкладки; last-write-wins не применяется.

Публичный token — bearer link, public project key — identifier, Admin cookie —
session, editing capability — scoped permission. Эти четыре понятия не
взаимозаменяемы. Admin cookie не копируется между доменами.

Следующие provider boundaries: `EmailProvider`, `AgentProvider`, `UsageMeter`,
`EntitlementPolicy`, `BillingProvider`. Dummy/no-op adapters нужны локальному
стенду; настоящий AI/payment provider не нужен для завершения V1.

## 8. Проверяемость

Сейчас `scripts/e2e-stack.mjs` поднимает весь стек, а
`apps/playground/scripts/smoke.mjs` проверяет HTTP/API. `tests/e2e` содержит README,
поэтому считать весь browser workflow автоматически проверенным нельзя.

Требуются уровни:

1. Protocol/runtime/editor unit tests: unsafe payload, targets, chain dependencies,
   idempotence, компенсация ошибок.
2. PostgreSQL integration: revisions, transactions, roles, immutable releases,
   deployment pointer и аналитика.
3. HTTP smoke текущего стека.
4. Browser E2E: реальные клики и DOM outcome, две страницы/два origins, отдельная
   visitor session, reload/offline/conflict/revoke/drift.
5. npm consumer/SSR import checks из упакованного artifact, без workspace aliases.
6. SPA fixtures: navigation races, back/forward, late nodes, hydration, re-render,
   mount/unmount, duplicate exposure и безопасное удаление observers.

Размер bundle и время replay измеряются на versioned fixtures, численные бюджеты
фиксируются после baseline S0/S1. Supported browser/framework versions указываются
по реально пройденной matrix, а не по одному успешному jsdom-тесту.

## 9. Решения этого видения

- Одно ядро protocol/runtime, два основных delivery path: script и npm.
- Rollup для library dist; отдельный lazy editor.
- Публичный SDK собирает воедино существующие модули и убирает playground glue.
- SPA lifecycle раньше настоящего AI provider.
- React первым как рабочее техническое предположение; общая граница пригодна для Vue.
- Exact pathname сохраняется; route patterns и BFF-specific support позже.
- Publish, Deploy, page Rollback и SDK rollback — разные действия.
- Реестр [ROADMAP](../../ROADMAP.md) определяет, что считать завершённым на каждом этапе.

## 10. Запланированный прототип: Visual Spec

[RFC Visual Spec](./visual-spec-review.md) рассматривает второе применение editor
operations: создать задание с ожидаемым состоянием и проверить реализацию в source.
Ветка X1–X3 включена в план 2026-09-20; модуль ещё не реализован. X1 использует
core S2 и версии/share S3. X2 использует frozen contract, строгий resolver и
browser harness; рабочий приоритет — после первого adapter S4. Static-only
validator технически не зависит от React; SPA contexts требуют S4. X3 решает
вопрос включения полноценной функции в обязательную V1.

Архитектурные границы для прототипа:

- Operation остаётся командой replay; Requirement — отдельным read-only assertion.
- Change Request и его frozen revision не заменяют Release.
- Общие TargetRef/resolver primitives используют разные policies для mutation,
  validation и будущего guide; ambiguity не выбирает первый candidate автоматически.
- Validator запускается отдельно от browser runtime, сначала локально/в CI.
- Source acceptance выполняется с Lykar delivery, отключённой до загрузки страницы.
- Developer/agent handoff экспортирует contract и инструкции, не требует AI API key.
- Guide steps, comments и assertions не добавляются в DOM execution protocol.

## 11. Порядок надёжности и производительности

Исполнимая очередь приведена в [TASKS](../../TASKS.md). Её ключевые зависимости:

`browser baseline → SDK contracts → strict targets → PageSession → executor/journal
→ save/UI → full workflow → framework adapter → spec/validator`.

Проверки начинаются на baseline и расширяются в каждом шаге. Перед deployment
добавляются bounded delivery и cache invalidation; production operations
завершают публичную готовность.

На S1 измерить стоимость bundles и replay; на S2/S4 ограничить manifest size,
число/время retries и observer scope. DOM reads/writes группируются без
нарушения порядка зависимых операций. Analytics и editor не блокируют visitor
render. На S5 проверить медленную сеть и отказ resolve: anti-flicker имеет
deadline и освобождает скрытые области при любом завершении/сбое. Обещание
нулевого flicker при произвольном клиентском async delivery не даётся.

Готовые средства: Playwright в browser harness и validator; Shadow DOM/Floating UI
для editor positioning; dom-accessibility-api как кандидат для semantic
target tooling; native observers/AbortController для lifecycle. Bundle cost
измеряется до добавления библиотек в visitor runtime. Fastify/PostgreSQL
сохраняются, CRDT и новая backend платформа для этих задач не нужны.
