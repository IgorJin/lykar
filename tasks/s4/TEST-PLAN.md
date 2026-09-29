# s4 — Соглашение о проверках

Agreement status: AGREED
Agreement date: 2026-09-27
Planning date: 2026-09-28

## Decision log

| Дата | Решение | Основание |
| --- | --- | --- |
| 2026-09-25 | Приняты прежние уровни и targeted/integration/final checks. | «оставляем как ты предложил», «согласен». |
| 2026-09-27 | Пересмотр S4 и state/observer/prepaint дополнения приняты. | «да» на вопрос о пересмотре S4 и принятии дополнений. |
| 2026-09-28 | Продолжить реализацию React/Vue. | Пользователь поручил оркестрацию разработки; после смены даты — «продолжи». |

Одно подключение npm и build plugin автоматически отслеживает framework roots; компоненты, их бизнес-условия и разметка не меняются. Runtime не использует AI. Поддержка включает React и Vue CSR и обычную SSR/hydration. Next.js, streaming/RSC/selective hydration и произвольные structural edits framework tree отложены; static/script commands остаются в регрессии.

## Test matrix

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

## Task-to-test mapping

| Task | AGREED checks | Report |
| --- | --- | --- |
| s4-01 | UNIT, API, BROWSER | s4-spa-integration.html |
| s4-02 | UNIT, BROWSER, PERFORMANCE, PREPAINT | s4-spa-integration.html |
| s4-03 | BROWSER, ENGINES, PACKAGE, MANUAL | s4-spa-integration.html |
| s4-04 | UNIT, BROWSER, API, PACKAGE | s4-spa-integration.html |
| s4-05 | UNIT, FLOW, BROWSER, MANUAL | s4-editor-analytics.html |
| s4-06 | FLOW, API, BROWSER, ENGINES, MANUAL | s4-editor-analytics.html |
| s4-07 | PACKAGE, PERFORMANCE, ENGINES | s4-delivery-performance.html |
| s4-08 | UNIT, API, BROWSER, FLOW, PACKAGE, PERFORMANCE, ENGINES, MANUAL, PREPAINT | s4-acceptance.html |

## Commands and fixtures

Существующие команды: `npm run build`, `npm run typecheck`, `npm test`, `npm run test:e2e:http`, `npm run test:e2e:browser`, `npm run verify:consumer --workspace @lykar/sdk`. Новые fixtures: `tests/fixtures/spa`, `packages/frameworks`; suites: `s4-fixture-baseline`, `s4-spa-critical`, `s4-conditional-flow` и unit engine/SDK/editor. Отсутствие файла/нулевое discovery не означает PASS.

Targeted browser: `npx playwright test 's4-.*[.]spec[.]ts' --project=chromium`; critical/conditional flow также Firefox/WebKit после расширения testMatch. Targeted tests каждой задачи; полный build/typecheck/unit/HTTP/browser — G1 при интеграции и G4 финально; G2 editor/access/analytics; G3 package/resources. Shared dist и test stand требуют последовательных runs.

## Evidence policy

Записывать command, revision/working-tree snapshot, фактические версии, exit status/pass/fail/skip, expected/actual. Для state transitions фиксировать исходный/displayed text, color, disabled, node identity и counters. Test-only oracle не передаёт готовность или бизнес-state в SDK. S4 outputs не перезаписывают S1/S2/S3 evidence. Screenshots не заменяют prepaint/DOM проверки.

## Release-blocking checks

- Правка чужого состояния/элемента, устаревший откат, частичная группа.
- Hydration mismatch, повреждение host handlers/state/tree, mutation до подтверждённой readiness.
- Потеря pending edits, смешивание Page/access, analytics дубли от rerender.
- Зацикливание, неограниченное повторение, ресурсы после destroy, обязательный test skip/пустой suite/failure.
- При неоднозначности ожидается пропуск с диагностикой; он не заменяет позитивный обязательный сценарий.

## Out of scope and deferred

Next.js/streaming/RSC/selective hydration; полный visual/a11y audit, production load/pentest, npm publish/deploy. Новые absolute p95/heap budgets PROPOSED; существующие budgets сохраняются. При новой DB migration потребуется согласовать migration campaign; JSON operation extension сам не требует migration.

## Open questions

Обязательная матрица согласована. Механизм readiness, версии/framework/build combinations и ограниченные retries фиксируются реализацией/evidence. Prepaint scope: правила готовы, безопасный старт подтверждён; скрытие первого исходного кадра при поздней загрузке не обещается.

## Additional concrete acceptance coverage

On 2026-09-29 the agreed gates are exercised by delayed framework bundle with rules already loaded, A→B→A scoped share access, real SPA experiment/consent/exposure checks, duplicate target and mutation flood, ten remounts and runtime cleanup. `npm run verify:s4:framework-consumer` verifies packed types/SSR/esbuild/Vite; `npm run verify:s4:performance` writes only S4 output. Script delivery uses a separate integrity-checked runtime asset; npm ESM remains self-contained. Report initial bytes and total visitor bytes separately, including the extra request.
