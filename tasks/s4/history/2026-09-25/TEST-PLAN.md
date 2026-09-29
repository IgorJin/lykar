# s4 — Соглашение о проверках

Agreement status: AGREED
Agreement date: 2026-09-25
Planning date: 2026-09-25

Соглашение относится к этапу S4 из roadmap. Это согласованный план будущих проверок: результаты реализации и новые PASS ещё не получены. Изменение обязательных слоёв, исключений или release blockers требует явного повторного согласования и новой записи в decision log.

## Decision log

| Дата | Решение | Ответ пользователя | Зафиксированное значение |
| --- | --- | --- | --- |
| 2026-09-25 | Объём | «обязательного нет, давай пока так. как понимаю nextjs сделаем похже?» | React adapter + обычный SSR/hydration; Vue fixture общего контракта. Next.js — отдельный будущий срез; обязательного приложения/роутера нет. |
| 2026-09-25 | Тестовая матрица | «оставляем как ты предложил» | Согласованы все строки UNIT…MANUAL ниже, полный Chromium и ключевые SPA в Firefox/WebKit. Полный visual/a11y audit дополнительно не заказан. |
| 2026-09-25 | Порядок и блокеры | «согласен» | Целевые проверки каждой задачи, общие прогоны при интеграции и финальной приёмке, групповые HTML reports, logs/traces; блокеры и deferred tests сохранены. |

Пользователь ответил аннотациями на три вопроса обсуждения. Технические имена новых suites/packages ниже — детализация реализации согласованной матрицы, не утверждение, что эти файлы уже существуют.

## Agreed wording

Формулировки одобренного предложения сохранены дословно и копируются в Checks задач:

- `UNIT` — Отмена устаревших операций, повторные вызовы, очистка ресурсов, ограничения команд.
- `BROWSER` — A→B→A, назад/вперёд, поздняя загрузка элементов, hydration, повторный рендер и mount/unmount.
- `FLOW` — Открыть редактор → изменить → сохранить → опубликовать Release → открыть share на React-странице.
- `API` — Изоляция страниц и прав доступа; аналитика учитывает посещения без дублей от re-render.
- `PACKAGE` — Установка из собранного пакета, TypeScript, импорт на сервере, сохранение работы script-подключения.
- `PERFORMANCE` — Размер пакета, ограниченные повторные применения, отсутствие накопления listeners и observers.
- `ENGINES` — полный сценарий в Chromium, ключевые SPA-сценарии также в Firefox и WebKit.
- `MANUAL` — ручная приёмка редактора на desktop и mobile viewport.

Порядок: «у каждой задачи — собственные целевые проверки; общий прогон `build`, `typecheck`, unit, HTTP/PostgreSQL и browser suites — при интеграции и финальной приёмке». Evidence: «в групповых HTML-отчётах, с приложенными логами и browser traces при сбоях».

## Test matrix

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

Среда проекта по README: npm workspaces, Node.js 22/npm 10/PostgreSQL 15 как ранее проверенный baseline, Playwright. Это не свежая проверка установленного окружения: каждый отчёт записывает фактические версии. Точные React/Vue versions и поддерживаемые combinations закрепляются в s4-01 и доказываются browser runs.

## Commands and fixtures

Существующие команды: `npm run build`, `npm run typecheck`, `npm test`, `npm run test:e2e:http`, `npm run test:e2e:browser`, `npm run typecheck:e2e`, `npm run dev:e2e`, `npm run verify:consumer --workspace @lykar/sdk`, `npm run verify:performance --workspace @lykar/sdk`.

Существующие fixtures/suites: `tests/fixtures/static`, `tests/fixtures/sdk-consumer`, `apps/playground`, `tests/e2e/page-session-lifecycle.spec.ts`, `replay-safety.spec.ts`, `persistence-recovery.spec.ts`, `versioning-flow.spec.ts`, `s3-acceptance.spec.ts` и текущие style suites.

Новые paths и команды ниже создаются соответствующими задачами; до их появления не считать отсутствие тестов успешным прогоном:

- s4-03: `tests/fixtures/spa/` — React CSR/SSR/hydration и Vue; `tests/e2e/s4-fixture-baseline.spec.ts`; discovery `s4-spa-critical.spec.ts`; расширение существующего e2e-stack без постоянной test database.
- s4-04: `packages/react` / `@lykar/react`, workspace `test`/`typecheck`; `tests/e2e/s4-react-lifecycle.spec.ts`, lifecycle/ownership cases в `s4-spa-critical.spec.ts`.
- s4-05: `tests/e2e/s4-editor-flow.spec.ts`, editor recovery cases в critical suite.
- s4-06: `tests/e2e/s4-analytics-access.spec.ts`, targeted runtime/SDK/API cases, access/analytics cases в critical suite.
- s4-07: `tests/e2e/s4-package-consumer.spec.ts`, `tests/e2e/s4-resources.spec.ts`; packed-consumer и S4-output расширения существующих scripts.

Полный S4 focused browser набор: `npx playwright test 's4-.*[.]spec[.]ts' --project=chromium`. Ключевой: `npx playwright test tests/e2e/s4-spa-critical.spec.ts --project=firefox` и такой же вызов для `--project=webkit`. Общий `npm run test:e2e:browser` после s4-03 должен включать эти cases и прежние suites.

В Firefox/WebKit сейчас выбраны только style suites; сам по себе старый конфиг не покрывает SPA. Его явное расширение и проверка discovery входят в s4-03. Playwright WebKit — проверка engine; отдельный прогон на физических iOS/Safari устройствах не согласован.

## Browser acceptance scenarios

В Chromium выполняются все сценарии. Общий critical suite во всех трёх engines включает следующие наблюдаемые результаты:

- Навигация: A→B→A, back/forward, cancelled navigation и ответ A после начала B; Page/Release и mutations не смешиваются.
- Hydration/host behavior: до ready нет внешних mutations, после hydration нет новых warnings/mismatch; click handler, input state и nested component сохранены.
- Re-render/remount: сохраняются разрешённые overrides; insertNode, listeners, observers и exposure не дублируются; после destroy нет активных ресурсов Lykar.
- Ownership: структурная команда работает внутри Lykar-owned island; unsupported managed mutation диагностируется до preview/save и ничего не меняет.
- Editor recovery: несохранённые изменения A остаются только в A при A→B→A; B без права остаётся native; stale selection очищена.
- Analytics/access: re-render не создаёт visit; новый подтверждённый visit учитывается при granted consent; capability A не действует для B, revoke прекращает новый доступ.
- Vue boundary: реальный mount/root replacement/unmount работает через общий API; это fixture-level coverage, не публичный Vue adapter.

Полный Chromium дополнительно покрывает все семь protocol command kinds, copy через insertNode, undo/redo/reset, save/lost-response/revision recovery, Release/share, точные DB totals, packed consumer и ресурсные серии.

## Manual acceptance checklist

- Открыть React fixture из Admin, выбрать элемент и проверить overlay/selection на desktop и mobile viewport.
- В Lykar-owned region изменить text/style/attribute, выполнить add/copy/move/delete, undo/redo/reset, сохранить и открыть страницу повторно.
- В managed target применить разрешённый override, вызвать re-render и убедиться, что host handler/state продолжают работать.
- Попытаться выполнить запрещённую managed structural mutation и увидеть понятную причину до изменения/сохранения.
- Оставить pending A, перейти в B и вернуться: B не меняется, правки A восстановимы, конфликт revision не скрыт.
- Опубликовать Release, открыть share в отдельном visitor context и подтвердить отсутствие editor panel; снять screenshots результата.

Ручная проверка дополняет автоматическую. Полный пиксельный visual regression или accessibility certification не входят в соглашение; существующие style/browser regressions продолжают запускаться.

## Task-to-test mapping

| Задача | Согласованные checks | Когда и где evidence |
| --- | --- | --- |
| [s4-01](./01-spa-contract.md) | `UNIT`, `API` | Contract unit/types; versions и matrix до W2. |
| [s4-02](./02-lifecycle-reconciliation.md) | `UNIT`, `BROWSER`, `PERFORMANCE` | Core unit + существующий static browser case; React часть завершает G1. |
| [s4-03](./03-spa-fixtures.md) | `BROWSER`, `ENGINES`, `MANUAL` | Native framework baseline/discovery/stand; Lykar integration завершает G1. |
| [s4-04](./04-react-adapter.md) | `UNIT`, `BROWSER`, `ENGINES`, `PERFORMANCE`, `PACKAGE` | Adapter unit + cross-engine critical; G1 и первый групповой отчёт. |
| [s4-05](./05-spa-editor-workflow.md) | `UNIT`, `BROWSER`, `FLOW`, `API`, `ENGINES`, `MANUAL` | Editor browser/recovery + manual; группа G2. |
| [s4-06](./06-route-analytics-access.md) | `UNIT`, `BROWSER`, `API`, `ENGINES` | Visits/access/consent + настоящая PostgreSQL; группа G2. |
| [s4-07](./07-package-compatibility-performance.md) | `PACKAGE`, `PERFORMANCE`, `ENGINES` | Packed consumer + sizes/resources; группа G3. |
| [s4-08](./08-sprint-acceptance.md) | `UNIT`, `BROWSER`, `FLOW`, `API`, `PACKAGE`, `PERFORMANCE`, `ENGINES`, `MANUAL` | Полный G4 и итоговый acceptance report. |

| Группа | Состав / момент | Обязательные проверки | Итоговый отчёт |
| --- | --- | --- | --- |
| G1 | s4-01…04, конец W3 | Targeted evidence обеих ветвей W2, полный build/typecheck/unit/HTTP/PostgreSQL/browser прогон после интеграции adapter, ключевые три engines. | [Планируемый SPA report](../../docs/verification/reports/s4/s4-spa-integration.html) |
| G2 | s4-05…06, конец W5 | Editor/recovery/share, access/analytics с PostgreSQL, critical suites и manual editor evidence; целевые S2/S3 regressions. | [Планируемый editor/analytics report](../../docs/verification/reports/s4/s4-editor-analytics.html) |
| G3 | s4-07, конец W6 | Build/typecheck, tarballs/SSR/TS consumers, sizes/timings/resource counters; зафиксированный artifact set. | [Планируемый delivery/performance report](../../docs/verification/reports/s4/s4-delivery-performance.html) |
| G4 | s4-08, конец W7 | Полный build/typecheck/unit/HTTP/PostgreSQL/browser, manual desktop/mobile; валидное package/performance evidence финального revision. | [Планируемый acceptance report](../../docs/verification/reports/s4/s4-acceptance.html) |

На каждой задаче выполняются её целевые проверки. Общие suites запускаются в G1 и G4; дополнительные повторения нужны после изменений, failures или конкретного unresolved concern. Shared build outputs и стенд одного checkout исключают одновременные npm pretest/build runs.

## Evidence policy

- У каждой задачи есть собственные машинные результаты/notes и ссылка на групповой HTML. Отдельный HTML на каждую задачу не нужен.
- Один владелец отчёта: s4-04 для G1, s4-06 для G2, s4-07 для G3, s4-08 для G4. В W2 оба исполнителя пишут отдельные task artifacts и не редактируют общий report.
- Записывать revision, command, время, фактическую среду/framework/browser versions, exit status, pass/fail/skips, ожидаемые и фактические outcomes.
- На browser failure сохранять screenshots, trace, video и error context; в отчёт включать ссылки на сохраняемые artifacts, а не недоступный локальный temp path.
- Групповой HTML описывает Changed structure, Public/API or data contracts, Verification, Open risks, Next tasks; логи не копировать целиком в narrative.
- S4 evidence хранить под `docs/verification/reports/s4/` и отдельным artifact namespace. Исторические S1/S2/S3 reports не перезаписывать.
- Существующий `packages/sdk/scripts/measure-performance.mjs` пишет `docs/verification/artifacts/s1-performance.json`; отдельный output требуется до S4 measurements.

## Release-blocking checks

Согласовано: «Ошибки hydration, потеря правок, смешивание страниц, дубли аналитики и накопление ресурсов блокируют закрытие S4». К этому относятся провалы обязательных критериев согласованной матрицы:

- Мутация до hydration readiness, повреждение host handlers/state/component tree или новая hydration warning.
- Поздняя mutation/report нового контекста от старой Page, перенос/потеря pending Draft, применение недопустимой ownership mutation.
- Использование права A для B, продолжение новых событий после revoke/retirement, неверные persisted totals или дубль exposure от render/remount.
- Бесконечный reapply/retry, ресурсы/узлы Lykar, оставшиеся после destroy, рост активных ресурсов с количеством циклов.
- Ошибка packed import/types/SSR/consumer workflow, регрессия существующего обязательного static/script flow.
- Пропущенная обязательная проверка, непроверенный engine, пустой suite, отсутствующее воспроизводимое evidence.

Новые абсолютные browser p95/heap бюджеты не утверждены. `PERFORMANCE` уже включает обязательные измерения и проверку bounded work/cleanup; отсутствие нового абсолютного threshold не разрешает пропустить эти проверки. Существующие размерные/производительные проверки и их ограничения сохраняются; при baseline failure записать причину и не менять thresholds молча.

## Out of scope and deferred

- Next.js: отдельный будущий срез после базового React adapter; номер этапа/срок ещё не согласованы. Обычные SSR import/render/hydration остаются обязательными в S4.
- Полный Vue adapter, специальный Next/React Router adapter, hash routing, route patterns, streaming SSR/Server Components и широкая матрица framework versions.
- Каталог host components/actions FUT-08, сохранение произвольной бизнес-логики при copy, новые исполняемые команды в manifests.
- Полный visual/accessibility audit, production load/soak testing, полный security audit/pentest. Согласованные permission/ownership checks остаются обязательными.
- Отдельная migration test campaign: новая schema/migration не предполагается; при необходимости её введения требуется расширение тестового соглашения до такой работы.
- Production deployment/Disable/Rollback (S5), infrastructure operations (S6), npm publish и внешний deployment.

## Open questions and technical choices

Открытых обязательных продуктовых или тестовых вопросов нет. Пользователь подтвердил объём, матрицу и порядок. Эти решения нельзя молча расширять или сокращать.

- В s4-01 инженерно фиксируются точные React/Vue versions, имена exports, readiness/visit contract и значения конечных retry/time limits; support утверждается только после tests.
- В s4-03 выбираются конкретные viewport sizes и fixture-serving детали с записью в evidence.
- Новые абсолютные browser timing/heap thresholds остаются `PROPOSED` и не являются текущим release gate. Если их захотят сделать обязательными, нужен отдельный decision log и повторное согласование.

## Sources

- [ROADMAP — S4](../../ROADMAP.md), [SPEC](../../SPEC.md), [technical vision](../../docs/architecture/technical-vision.md).
- [SDK lifecycle](../../packages/sdk/README.md), [compatibility](../../packages/sdk/COMPATIBILITY.md), [S3 acceptance](../../docs/verification/reports/S3/s3-acceptance.html).
- Repository discovery: HEAD `a294f51`, 2026-09-25. Существующие отчёты — историческое evidence; тесты приложения при планировании не запускались.
