# s4 — React/SPA adapter и cooperative integration

Plan format: 2
Sprint ID: s4
Status: PLANNED
Planning date: 2026-09-25

S4 добавляет первый React npm adapter поверх существующих PageSession, TargetRegistry и journal. Поддержка включает обычный SSR/hydration, route navigation, повторный render/remount и управляемые host overrides. Полный editor → Release → share workflow и аналитика проходят на настоящих framework fixtures; границы команд зависят от ownership root. Vue fixture проверяет общий контракт, Next.js и полноценный Vue adapter остаются будущими срезами.

Каталог `tasks/s4/` и IDs `s4-*` сохраняют написание sprint identifier из запроса; это этап **S4** существующего roadmap. Все задачи пока PLANNED, соглашение о тестах — AGREED.

[Соглашение о проверках](./TEST-PLAN.md) · [HTML-обзор](./plan.html)

## Sprint goal

Подключить Lykar к React SPA через npm так, чтобы route changes, hydration и повторный render сохраняли host UI, правки редактора, изоляцию страниц и корректную аналитику. Все protocol commands гарантируются внутри Lykar-owned regions; для managed targets работают явно разрешённые overrides через host props/store и понятный отказ неподдерживаемой операции.

Next.js — отдельная будущая интеграция после базового S4, без зафиксированного номера этапа или срока. Обычная React SSR/hydration входит в S4. Vue представлен реальной test fixture общего API; готовый Vue adapter в этот спринт не включён.

## Testing agreement

Agreement status: AGREED. Пользователь 2026-09-25 подтвердил предложенные объём, матрицу, порядок проверок и блокеры; точные ответы сохранены в [TEST-PLAN.md](./TEST-PLAN.md).

| ID | Уровень | Scope | Команды / fixtures | Среда | Evidence | Блокирует закрытие S4 |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT | Unit / contracts | Отмена старых задач, repeated calls, ownership, cleanup, visit identity. | Vitest: SDK/runtime/React/editor; существующие workspace test commands, новый React workspace — s4-04. | Node + jsdom; versions записываются в evidence. | Unit output и граничные cases. | Да, для обязательного поведения. |
| BROWSER / ENGINES | Browser E2E | A→B→A, back/forward, late mount, SSR hydration, render/remount, сохранность host. | Новые s4-fixture-baseline, s4-react-lifecycle и s4-spa-critical suites; текущий Playwright harness. | Все S4 suites — Chromium; ключевые SPA — также Firefox/WebKit. | Report, expected/actual DOM, warnings/errors, failure trace/video. | Да; обязательный suite не может иметь ноль tests или skip. |
| FLOW | Полный пользовательский сценарий | Admin → React editor → команды → save/reload → immutable Release → share visitor. | Новый s4-editor-flow.spec.ts + существующие versioning/persistence cases. | Реальные API + временная PostgreSQL, отдельные owner/visitor contexts. | Browser output, screenshots важных состояний, версии Draft/Release. | Да. |
| API | HTTP / PostgreSQL / concurrency | Page isolation, permission/revoke, visit totals, consent, одновременные exposure/retry. | npm run test:e2e:http; новый s4-analytics-access.spec.ts; S3 regression. | Изолированная временная PostgreSQL; без skip DB-dependent cases. | Persisted API/DB totals и test output. | Да. |
| PACKAGE | npm / TypeScript / SSR | Установка tarballs, imports/exports/types, server render + hydration, script regression. | npm run verify:consumer --workspace @lykar/sdk; новый s4-package-consumer.spec.ts. | Consumer вне workspaces, локальные package artifacts, процесс без window/document. | Tarball hashes, types/import result, browser result. | Да. |
| PERFORMANCE | Размер / bounded work / ресурсы | Размер core/adapter, время replay/reconciliation, ограниченные retries, отсутствие накопления ресурсов. | verify:performance с отдельным S4 output; новый s4-resources.spec.ts. | Версионированные fixtures, фиксированное окружение и повторяемая серия циклов. | Raw/gzip размеры, timing distribution, resource counters, machine JSON. | Да для bounded work/cleanup и обязательных измерений; новые абсолютные latency/heap бюджеты — PROPOSED. |
| MANUAL | Ручная desktop/mobile приёмка | Selection, controls, preview/save/reload, route recovery, понятный отказ managed mutation. | npm run dev:e2e; checklist ниже; desktop и mobile viewport. | Локальный управляемый стенд; фактические размеры viewport фиксируются. | Checklist + screenshots с наблюдаемым результатом. | Да, в согласованном объёме; полный visual/a11y audit не входит. |
| GROUP | Общая регрессия | Сохранность S0–S3 static/script/editor/share/analytics и интеграция S4. | npm run build; npm run typecheck; npm test; npm run test:e2e:http; npm run test:e2e:browser. | Один revision и согласованный artifact set; последовательные запуски. | Команда, revision, environment, exit status, pass/fail/skips. | Да; G1 после s4-04 и G4 в s4-08. |

Evidence — целевые machine outputs по задачам и четыре групповых HTML reports; browser failures сохраняют traces/video/screenshots. Open questions: обязательных нет; технические versions/limits фиксируются в s4-01, новые абсолютные latency/heap budgets остаются PROPOSED и требуют отдельного решения, если станут release gate.

Существующие команды и новые fixtures чётко разделены в TEST-PLAN. Тесты реализации ещё предстоит выполнить; новый план не обновляет исторические PASS.

## Tasks

| ID | Задача | Status | Priority | Depends on | Wave | Problem solved | Enables | Task file |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s4-01 | Контракт SPA-интеграции и границы поддержки | PLANNED | P0 | None | W1 | Без явного контракта повторный рендер может считаться новым посещением, а DOM executor — менять узлы, которыми управляет framework. | s4-02: реализация общего lifecycle без привязки к React. s4-03: создание fixtures по стабильному интерфейсу. Проверяемая матрица root × operation × framework/browser. | [01](./01-spa-contract.md) |
| s4-02 | Общий lifecycle и ограниченное повторное применение | PLANNED | P0 | s4-01 | W2 | Поздние ответы и повторный render могут применить старую версию к новой странице, продублировать узлы или запустить бесконечное повторное применение. | s4-04: подключение React hooks к готовому lifecycle. s4-05: безопасное восстановление editor targets. s4-06: независимость visit identity от технического replay. | [02](./02-lifecycle-reconciliation.md) |
| s4-03 | React/Vue fixtures и изолированный SPA-стенд | PLANNED | P1 | s4-01 | W2 | Статическая HTML-страница и ручной вызов navigate не доказывают поведение настоящего framework при hydration, re-render и unmount. | s4-04: browser integration с настоящим React и проверка общего API на Vue. s4-05/s4-06: независимые страницы и пользователи для editor/access/analytics. s4-08: одинаково воспроизводимая приёмка в трёх browser engines. | [03](./03-spa-fixtures.md) |
| s4-04 | React npm adapter и cooperative overrides | PLANNED | P0 | s4-02, s4-03 | W3 | Одного npm import недостаточно, чтобы согласовать изменения Lykar с React render и hydration. | s4-05: полноценный editor workflow в React. s4-06: аналитика и доступ на реальных SPA переходах. Первое проверенное использование общего lifecycle на Vue fixture. | [04](./04-react-adapter.md) |
| s4-05 | Редактор в SPA: команды, сохранение и восстановление | PLANNED | P0 | s4-04 | W4 | Editor selection и pending изменения могут ссылаться на старые DOM nodes или потеряться при unmount/переходе на другую Page. | Пользователь редактирует React-страницу, сохраняет Draft и открывает immutable Release по share. s4-06: единая проверка page-scoped доступа через готовый editor. s4-08: ручная desktop/mobile приёмка. | [05](./05-spa-editor-workflow.md) |
| s4-06 | Посещения маршрутов, аналитика и изоляция доступа | PLANNED | P0 | s4-05 | W5 | Пересоздание runtime может повторно отправить exposure, потерять consent либо использовать контекст другой Page. | Достоверные experiment reports для React SPA. Отсутствие межстраничного доступа и поздних событий старого route. s4-07/s4-08: стабильный интегрированный consumer и финальная приёмка. | [06](./06-route-analytics-access.md) |
| s4-07 | Пакеты, матрица совместимости и измерения | PLANNED | P1 | s4-06 | W6 | Успех workspace imports не доказывает пригодность опубликованного package artifact или отсутствие регрессии размера и ресурсов. | Воспроизводимая установка SDK/React adapter обычным consumer. Проверенная support matrix и эксплуатационные ограничения. s4-08: финальная приёмка на фиксированном artifact set. | [07](./07-package-compatibility-performance.md) |
| s4-08 | Итоговая приёмка и передача в следующий этап | PLANNED | P0 | s4-07 | W7 | Разрозненные зелёные проверки разных snapshots не доказывают целостный React editor/share/analytics workflow. | Обоснованное закрытие S4 и переход к следующей работе по roadmap. Проверенный baseline для будущих Next.js/Vue integrations. | [08](./08-sprint-acceptance.md) |

## Definition of done

- [ ] Существует устанавливаемый React adapter поверх общего SDK lifecycle; import/server render безопасны, framework dependency не попадает в core/script.
- [ ] React CSR/SSR fixtures проходят A→B→A, back/forward, поздний mount, hydration, render и remount без stale mutations и повреждения host behavior.
- [ ] Lykar-owned regions поддерживают все protocol commands; managed tree принимает только разрешённые host overrides, ограничения видны до preview/save.
- [ ] Preview/undo/redo/save/reload/Release/share работают на React-странице; pending edits изолированы по Page/Draft и восстановимы после навигации.
- [ ] Re-render/remount не создают новое посещение; новый подтверждённый visit учитывается корректно; consent, доступ и DB totals соответствуют S3.
- [ ] Нет накопления listeners/observers/timers/nodes, бесконечного replay и неограниченного ожидания.
- [ ] Vue fixture подтверждает общий root/lifecycle contract; support matrix перечисляет exact tested versions и ownership modes.
- [ ] Согласованные UNIT/BROWSER/FLOW/API/PACKAGE/PERFORMANCE/ENGINES/MANUAL и общий regression gate пройдены на финальном revision.
- [ ] Четыре групповых отчёта и machine artifacts доступны; обязательные checks не скрыты skip/retry, статусы обновлены только после evidence.

## Execution order

Сначала выполнить **s4-01**: контракт и границы владения. После него допустима параллельная реализация **s4-02 + s4-03**. Затем последовательно **s4-04 → s4-05 → s4-06 → s4-07 → s4-08**.

Прямые hard dependencies:

- `s4-01 → s4-02` и `s4-01 → s4-03`.
- `s4-02 → s4-04` и `s4-03 → s4-04`.
- `s4-04 → s4-05 → s4-06 → s4-07 → s4-08`.

Транзитивно s4-04 и всё после него ждут обе ветви W2. Зависимость s4-06 от s4-05 дополнительно сериализует общие SDK route/access/editor hooks, а не утверждает независимость только по расположению файлов. Внешняя предпосылка — закрытый S3 и S2 lifecycle; межспринтовые IDs не используются в поле Depends on.

## Parallel execution map

Безопасный параллельный набор только один: W2 = s4-02 + s4-03 после заморозки контракта W1. Остальные волны выполняются последовательно из-за общих integration surfaces.

| Wave | Задачи | Граница владения и условие завершения |
| --- | --- | --- |
| W1 | s4-01 | Общие types/ownership/visit/fixture contracts закреплены до branching. |
| W2 | s4-02 + s4-03 | s4-02: SDK/runtime и unit/static lifecycle tests. s4-03: framework fixtures, harness, config, root lockfile. Общие contracts не изменяются односторонне. |
| W3 | s4-04 | Интеграция обеих ветвей, adapter/fixtures wiring и общий G1 gate. |
| W4 | s4-05 | Editor/recovery/selection и route access. |
| W5 | s4-06 | После editor интегрируются visit/consent/access; G2 report. |
| W6 | s4-07 | Стабильные package artifacts, compatibility и measurements; G3 report. |
| W7 | s4-08 | Один финальный revision, полный G4 gate и acceptance. |

Coordination notes:

- В W2 `Can run in parallel with` симметричен только у s4-02 и s4-03; нет прямой или транзитивной зависимости друг от друга.
- Единственный владелец root lockfile, Playwright config и e2e harness в W2 — s4-03. При необходимости общей правки core/fixtures контракт обновляется совместно до продолжения зависимой работы.
- Параллельность относится к ограниченным изменениям и изолированным runs. В одном checkout npm pretest/build могут очищать общий dist: такие команды и управляемый browser stand запускаются последовательно.
- Machine outputs изолируются по задаче. Общий HTML G1 пишет s4-04 после W2; одновременное редактирование отчёта/индекса исключено.
- В W3–W6 SDK, adapter, editor, analytics, fixtures и asset artifacts разделяют состояние; дальнейшая параллельная безопасность не заявлена.

## Checks across the sprint

- Каждая задача выполняет целевые AGREED checks из своего файла; PROPOSED не подменяют согласованный обязательный набор.
- G1 после s4-04: полный build/typecheck/unit/HTTP/PostgreSQL/browser после первой интеграции.
- G2 после s4-06: editor/share/recovery и visits/access/totals, ключевые engines и manual evidence.
- G3 в s4-07: packed consumers/SSR/TS, build/typecheck, sizes/resources с отдельным S4 artifact output.
- G4 в s4-08: общий final gate и manual desktop/mobile на финальном revision. Повторные прогоны обосновываются изменениями или failures.
- Hydration defects, потеря правок, смешивание Page/access, дубли аналитики, накопление ресурсов и провалы обязательных checks блокируют закрытие S4.

## Evidence and reports

Это ссылки на **ожидаемые будущие** отчёты исполнения; при планировании они не создаются и не объявляются готовыми.

| Tasks | Report group | Владелец |
| --- | --- | --- |
| s4-01, s4-02, s4-03, s4-04 | [SPA integration](../../docs/verification/reports/s4/s4-spa-integration.html) | s4-04 |
| s4-05, s4-06 | [Editor / analytics](../../docs/verification/reports/s4/s4-editor-analytics.html) | s4-06 |
| s4-07 | [Delivery / performance](../../docs/verification/reports/s4/s4-delivery-performance.html) | s4-07 |
| s4-08 | [Acceptance](../../docs/verification/reports/s4/s4-acceptance.html) | s4-08 |

## Status legend

- `PLANNED` — задача описана, реализация не подтверждена.
- `IN_PROGRESS` — задача выполняется.
- `BLOCKED` — указана конкретная блокирующая причина.
- `DONE` — критерии и AGREED checks подтверждены evidence.
- `CANCELLED` — задача явно отменена с причиной.

## Repository context and assumptions

- Discovery: HEAD `a294f51`, 2026-09-25; [S3](../S3/README.md) закрыт по существующему evidence. Свежий application test run при планировании не выполнялся.
- [ROADMAP](../../ROADMAP.md), [SPEC](../../SPEC.md), [technical vision](../../docs/architecture/technical-vision.md) задают S4 и границы ownership.
- [SDK README](../../packages/sdk/README.md) уже описывает PageSession/generation/cleanup; задача s4-02 расширяет существующее ядро.
- `packages/runtime/src/runtime.ts` держит exposure/consent в runtime instance, а SDK refresh создаёт новый runtime: visit identity/consent требуют явной интеграции.
- Текущий `playwright.config.ts` включает Firefox/WebKit только для style suites: s4-03 должен добавить SPA selection.
- Текущие consumer/performance scripts дают полезную основу; S1 jsdom replay p95 не является browser performance evidence, S1 artifacts нельзя перезаписывать.
- Точные framework versions не выдуманы при планировании: s4-01 фиксирует candidate matrix, s4-04/08 подтверждают её.

## Plan maintenance

Изменения этого планирования ограничены `tasks/s4/`. Индексы проекта и application code обновляются при выполнении спринта согласно acceptance s4-08.

HTML строится bundled generator скилла; локальный `render-plan.mjs` после него превращает Markdown tables в HTML tables и сохраняет читаемость графа. Выполнить из корня проекта, подставив путь установленного скилла:

```sh
node tasks/s4/render-plan.mjs --skill-dir <каталог-скилла-plan-sprint>
node <каталог-скилла-plan-sprint>/scripts/validate_sprint_plan.mjs --root . --sprint s4
```

Все ссылки на источники/задачи/report paths относительные; `plan.html` самодостаточен, не использует CDN, remote fonts, scripts или images.
