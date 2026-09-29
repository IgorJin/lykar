# s4 — Автономные условные правки React/Vue

Plan format: 2
Sprint ID: s4
Status: DONE
Planning date: 2026-09-28

S4 добавляет захват исходного отображения и условное применение текста/стилей после framework updates. React/Vue build adapters автоматически сообщают готовность roots. Существующие PageSession, immutable Release/share, API и аналитика сохраняются.

[TEST-PLAN](./TEST-PLAN.md) · [HTML](./plan.html) · [Предыдущий план](./history/2026-09-25/README.md)

## Sprint goal

Одно подключение npm и build plugin автоматически отслеживает framework roots; компоненты, их бизнес-условия и разметка не меняются. Runtime не использует AI. Поддержка включает React и Vue CSR и обычную SSR/hydration. Next.js, streaming/RSC/selective hydration и произвольные structural edits framework tree отложены; static/script commands остаются в регрессии.

## Testing agreement

Agreement status: AGREED. Пересмотр подтверждён 2026-09-27; команды и evidence в TEST-PLAN.md.

| ID | Scope | Commands / fixtures | Evidence | Release blocking |
| --- | --- | --- | --- | --- |
| UNIT | baseline/own writes, group apply/remove, отмена устаревших операций, tombstone undo и cleanup | Vitest workspace suites | machine logs + group HTML; failures traces/screenshots/video | Да |
| BROWSER | React/Vue CSR и ordinary SSR/hydration; Waiting→Continue→Waiting, unchanged rerender, remount, duplicates, bursts, theme, routes | tests/fixtures/spa; tests/e2e/s4-*.spec.ts; Playwright | machine logs + group HTML; failures traces/screenshots/video | Да |
| FLOW | selection→text/style→save/reload→Release→share без ручных state/target/readiness hooks | tests/fixtures/spa; tests/e2e/s4-*.spec.ts; Playwright | machine logs + group HTML; failures traces/screenshots/video | Да |
| API | реальная временная PostgreSQL, conditional persistence и legacy operations, page/access/consent/analytics regression | npm run test:e2e:http; temporary PostgreSQL | machine logs + group HTML; failures traces/screenshots/video | Да |
| PACKAGE | packed consumer, TypeScript, SSR imports, автоматическая build integration и static/script regression | packed consumers; npm run verify:consumer --workspace @lykar/sdk | machine logs + group HTML; failures traces/screenshots/video | Да |
| PERFORMANCE | размеры/время/counters, bounded observer/retries, отсутствие накопления ресурсов; новые absolute latency/heap budgets PROPOSED | S4 browser measurements, separate output | machine logs + group HTML; failures traces/screenshots/video | Да |
| ENGINES | все S4 scenarios в Chromium; ключевые conditional/SPA также Firefox/WebKit | tests/fixtures/spa; tests/e2e/s4-*.spec.ts; Playwright | machine logs + group HTML; failures traces/screenshots/video | Да |
| MANUAL | desktop/mobile viewport: selection, controls, preview/save/reload, диагностика | tests/fixtures/spa; tests/e2e/s4-*.spec.ts; Playwright | machine logs + group HTML; failures traces/screenshots/video | Да |
| PREPAINT | после safe ready и загрузки правил text/style согласованы к следующему кадру; первый кадр при поздней загрузке отдельно | tests/fixtures/spa; tests/e2e/s4-*.spec.ts; Playwright | machine logs + group HTML; failures traces/screenshots/video | Да |

## Tasks

| ID | Title | Status | Priority | Depends on | Wave | Problem solved | Enables | Task file |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s4-01 | Автономный контракт React/Vue | DONE | P0 | None | W1 | Ручная регистрация целей не соответствует требованиям. | Зафиксированный контракт для runtime, editor и build integration. | [01](./01-spa-contract.md) |
| s4-02 | Движок условных правок | DONE | P0 | s4-01 | W2 | Разовое replay теряет связь с состоянием после rerender. | Общий синхронный движок preview и playback. | [02](./02-lifecycle-reconciliation.md) |
| s4-03 | Build adapters и fixtures React/Vue | DONE | P0 | s4-01 | W2 | DOM-only fixtures не доказывают framework compatibility. | Автоматическая readiness и реальные CSR/SSR потребители. | [03](./03-spa-fixtures.md) |
| s4-04 | SDK и conditional manifest playback | DONE | P0 | s4-02, s4-03 | W3 | Движок должен соблюдать page/access/abort lifecycle. | Полноценное npm подключение обоих frameworks. | [04](./04-react-adapter.md) |
| s4-05 | Автоматический захват состояния в редакторе | DONE | P0 | s4-04 | W4 | Пользователь не должен описывать условия компонента вручную. | Условные preview/save/reload/undo из прежнего editor UI. | [05](./05-spa-editor-workflow.md) |
| s4-06 | Сквозной workflow и изоляция | DONE | P0 | s4-05 | W5 | Preview не доказывает release/share/persistence. | Проверенный owner/visitor сценарий React/Vue. | [06](./06-route-analytics-access.md) |
| s4-07 | Пакеты, совместимость и ресурсы | DONE | P0 | s4-06 | W6 | Workspace imports не доказывают installable npm artifacts. | Проверенные tarballs, builds и support matrix. | [07](./07-package-compatibility-performance.md) |
| s4-08 | Финальная приёмка S4 | DONE | P0 | s4-07 | W7 | Нужен один воспроизводимый snapshot и честные результаты. | Основание закрытия S4. | [08](./08-sprint-acceptance.md) |

## Definition of done

- [x] React/Vue CSR/hydration работают без ручных component hooks/markers/state bindings.
- [x] Text/style применяются только для захваченного исходного варианта; при снятии сохранён актуальный host UI.
- [x] Editor/undo/save/reload/Release/share проходят на реальных fixtures.
- [x] Page/access/consent/visits изолированы, rerender не создаёт exposure.
- [x] Packed install/types/SSR, resources, engines и manual desktop/mobile подтверждены.
- [x] Все AGREED gates завершены на одном snapshot; limitations и failures перечислены честно.

## Execution order

s4-01 → (s4-02 + s4-03) → s4-04 → s4-05 → s4-06 → s4-07 → s4-08.

## Parallel execution map

| Wave | Tasks | Ownership |
| --- | --- | --- |
| W1 | s4-01 | Shared contracts/readiness feasibility. |
| W2 | s4-02 + s4-03 | Runtime отдельно от framework package/fixtures; lockfile/harness только s4-03. |
| W3 | s4-04 | SDK/API integration, G1. |
| W4 | s4-05 | Editor/history. |
| W5 | s4-06 | Full flow/access/analytics, G2. |
| W6 | s4-07 | Packages/resources, G3. |
| W7 | s4-08 | Final/manual/evidence, G4. |

Edges: s4-01→s4-02; s4-01→s4-03; s4-02→s4-04; s4-03→s4-04; s4-04→s4-05→s4-06→s4-07→s4-08. W2 требует заморозки contract. Общие build artifacts и test stand сериализованы. Прототипы уточняют контракт; downstream acceptance ждёт prerequisites.

## Checks across the sprint

Targeted checks каждой задачи; полные build/typecheck/unit/HTTP/browser при интеграции и финально. Package/performance outputs отдельные S4. Ноль tests, отсутствующий browser/DB или исторический PASS не являются новым evidence.

## Evidence and reports

- [s4-spa-integration](../../docs/verification/reports/s4/s4-spa-integration.html) — итоговый групповой report.
- [s4-editor-analytics](../../docs/verification/reports/s4/s4-editor-analytics.html) — итоговый групповой report.
- [s4-delivery-performance](../../docs/verification/reports/s4/s4-delivery-performance.html) — итоговый групповой report.
- [s4-acceptance](../../docs/verification/reports/s4/s4-acceptance.html) — итоговый групповой report.

## Status legend

- PLANNED — задача согласована, не принята.
- IN_PROGRESS — выполняется.
- BLOCKED — есть конкретное препятствие.
- DONE — все checks доказаны.
- CANCELLED — отменена с причиной.

## Decision log

| Дата | Решение | Основание |
| --- | --- | --- |
| 2026-09-25 | Приняты прежние уровни и targeted/integration/final checks. | «оставляем как ты предложил», «согласен». |
| 2026-09-27 | Пересмотр S4 и state/observer/prepaint дополнения приняты. | «да» на вопрос о пересмотре S4 и принятии дополнений. |
| 2026-09-28 | Продолжить реализацию React/Vue. | Пользователь поручил оркестрацию разработки; после смены даты — «продолжи». |

## Execution update — 2026-09-29

Все 8 задач завершены в указанной матрице поддержки. Build/typecheck PASS; unit 205 passed (3 DB checks перенесены в запуск с PostgreSQL); HTTP/API 23 passed, 0 skips; browser 62 passed, 0 skips; packed SDK/framework consumers PASS. Final desktop/mobile screenshots просмотрены. Проверены early-rules SSR, scoped A→B→A share access, реальная SPA analytics и split script runtime delivery.

Initial SDK: 28,725 raw / 8,674 gzip bytes. Total visitor SDK+runtime: 110,378 raw / 33,005 gzip bytes плюс manifest и дополнительный запрос. Исторический S1 editor raw budget 100K остаётся превышенным (204,639 bytes; уже 172,928 в принятом S2); это сохранённый долг, не PASS этого порога. Новые абсолютные latency/heap budgets не принимались. Полный source snapshot и результаты — в отчётах.
