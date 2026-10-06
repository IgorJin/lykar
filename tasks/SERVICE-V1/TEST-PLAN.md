# SERVICE-V1 — Соглашение о проверках

Agreement status: AGREED
Agreement date: 2026-10-02
Planning date: 2026-10-02

## Decision log

- 2026-10-02: пользователь подтвердил основную задачу — A/B-тестирование, быстрая правка и эксперимент над действующим сайтом.
- 2026-10-02: предложена полная матрица слоёв, окружений, group evidence и блокеров; ответ пользователя: «Согласен с матрицей и границами (рекомендую)».
- 2026-10-02: на отдельный вопрос о трафике выбран ответ «На первой версии достаточно A/B-ссылок». Обычный traffic allocation не входит в согласованный scope.
- 2026-10-02: пользователь подтвердил идентификатор SERVICE-V1 ответом «да».
- Новые задачи имеют PLANNED. AGREED означает принятое обязательство выполнить проверки, не PASS.
- Численные budgets, provider/environment choices и количественные критерии пилота не утверждались этим ответом. Они вынесены в 02/20; изменение соглашения фиксируется новой записью, прежнее решение сохраняется.

- 2026-10-05: владелец поручил выполнить 06; почтовые лимиты и quota-based provider failover перенесены в план 07. Предложенные окно 1 час и пауза 60 секунд не считаются выбранными.

## Test matrix

Формулировки слоёв ниже скопированы из предложенной и принятой пользователем матрицы. Команды/fixtures — конкретизация по checkout; новые suites и ops commands ещё должны быть созданы.

| ID | Согласованный слой и scope | Команды / fixtures | Среда | Evidence | Блокирует выпуск |
| --- | --- | --- | --- | --- | --- |
| CORE | Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики. | npm test; npm run test:e2e:http; целевые workspace suites; существующие migrations 001–009 и будущие миграции эпика | Локально/CI, изолированная временная PostgreSQL; два клиента и конкурентные запросы | Логи, число найденных/выполненных tests, SQL-инварианты и результаты повторов | Да |
| BROWSER | Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit. | npm run test:e2e:browser; npx playwright test <существующий либо будущий файл> --project=<engine>; tests/fixtures/static и tests/fixtures/spa | Локальный стенд/CI; затем HTTPS staging; отдельные owner/visitor/client contexts | Playwright report; screenshots важных состояний; trace/video при сбое | Да |
| UI | UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения. | npm run dev:e2e; текущие editor-design, editor-style-reset, style-editor-acceptance suites; будущие service UI cases | Desktop/mobile viewport; поддержанная браузерная матрица; staging | Чеклист оператора, screenshots, воспроизводимые шаги дефектов | Да, основные сценарии и доступность их управления |
| RELIABILITY | Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации. | Unit/API/E2E fault cases; interception в Playwright; проверки logs/assets; существующие lifecycle/recovery/access suites | Временная БД и управляемый браузер; ограниченные проверки на staging | Отказы/таймауты, согласованные числа событий, редактированные логи, diagnostics | Да |
| OPS | Эксплуатация: тестовая среда, реальные тестовые письма, обновление версии, резервная копия/восстановление, фоновые задачи и сигнал о сбое. | Будущие deploy/smoke/jobs/restore команды фиксируются в задачах 12–16; существующие npm run build и db:migrate | Изолированная HTTPS staging, тестовые ящики владельца, отдельная БД восстановления | Версии артефактов, delivery receipts, результат restore, job retries и тестовый alert | Да до технической приёмки сервиса |
| COMMANDS | Используем существующие npm run build/typecheck/test, test:e2e:http, test:e2e:browser, Playwright и временную PostgreSQL; новые команды отмечаем как будущие. | npm run build; npm run typecheck; npm test; npm run test:e2e:http; npm run test:e2e:browser | Node/npm/PostgreSQL/браузеры фиксируются фактически; общий стенд используется последовательно | Exit codes, revision/tree hash, версии среды, число tests; отсутствие скрытых skip | Да |

## Exact agreed cross-cutting rules

- У каждой задачи — целевые проверки, у этапа — общий прогон и HTML-отчёт; логи и скриншоты, trace/video при сбое. Полные прогоны на одном стенде последовательные.
- Ошибки основных сценариев, потеря данных, нарушение доступа и неверные A/B-данные блокируют выпуск.
- Вне этой версии: X1/X2, AI, автоматический биллинг, новые framework-адаптеры, внешняя сертификация/pentest и статистические заявления о победителе без отдельной методики.
- Пользовательский пилот — отдельный этап после технической приёмки.

## Task-to-test mapping

| Task | Stage | AGREED layers | Group checks / report |
| --- | --- | --- | --- |
| SERVICE-V1-01 | E1 | CORE, BROWSER, UI, COMMANDS | [editor-contract.html](../../docs/verification/reports/SERVICE-V1/editor-contract.html) |
| SERVICE-V1-02 | E1 | CORE, BROWSER, RELIABILITY | [editor-contract.html](../../docs/verification/reports/SERVICE-V1/editor-contract.html) |
| SERVICE-V1-03 | E2 | CORE, RELIABILITY | [deployment.html](../../docs/verification/reports/SERVICE-V1/deployment.html) |
| SERVICE-V1-04 | E2 | CORE, BROWSER, RELIABILITY | [deployment.html](../../docs/verification/reports/SERVICE-V1/deployment.html) |
| SERVICE-V1-05 | E2 | BROWSER, UI, CORE, RELIABILITY | [deployment.html](../../docs/verification/reports/SERVICE-V1/deployment.html) |
| SERVICE-V1-06 | E3 | CORE, BROWSER, UI, RELIABILITY | [onboarding.html](../../docs/verification/reports/SERVICE-V1/onboarding.html) |
| SERVICE-V1-07 | E3 | CORE, BROWSER, UI, RELIABILITY, OPS | [onboarding.html](../../docs/verification/reports/SERVICE-V1/onboarding.html) |
| SERVICE-V1-08 | E3 | CORE, BROWSER, RELIABILITY | [onboarding.html](../../docs/verification/reports/SERVICE-V1/onboarding.html) |
| SERVICE-V1-09 | E3 | BROWSER, UI, CORE, RELIABILITY | [onboarding.html](../../docs/verification/reports/SERVICE-V1/onboarding.html) |
| SERVICE-V1-10 | E4 | CORE, BROWSER, UI, RELIABILITY | [experiments.html](../../docs/verification/reports/SERVICE-V1/experiments.html) |
| SERVICE-V1-11 | E4 | CORE, BROWSER, UI, RELIABILITY | [experiments.html](../../docs/verification/reports/SERVICE-V1/experiments.html) |
| SERVICE-V1-12 | E5 | COMMANDS, CORE, BROWSER, RELIABILITY, OPS | [operations.html](../../docs/verification/reports/SERVICE-V1/operations.html) |
| SERVICE-V1-13 | E5 | CORE, BROWSER, RELIABILITY, OPS | [operations.html](../../docs/verification/reports/SERVICE-V1/operations.html) |
| SERVICE-V1-14 | E5 | CORE, RELIABILITY, OPS | [operations.html](../../docs/verification/reports/SERVICE-V1/operations.html) |
| SERVICE-V1-15 | E5 | CORE, BROWSER, RELIABILITY, OPS | [operations.html](../../docs/verification/reports/SERVICE-V1/operations.html) |
| SERVICE-V1-16 | E5 | CORE, BROWSER, RELIABILITY, OPS | [operations.html](../../docs/verification/reports/SERVICE-V1/operations.html) |
| SERVICE-V1-17 | E6 | CORE, BROWSER, UI, RELIABILITY, COMMANDS | [release-acceptance.html](../../docs/verification/reports/SERVICE-V1/release-acceptance.html) |
| SERVICE-V1-18 | E6 | RELIABILITY, BROWSER, COMMANDS | [release-acceptance.html](../../docs/verification/reports/SERVICE-V1/release-acceptance.html) |
| SERVICE-V1-19 | E6 | CORE, BROWSER, UI, RELIABILITY, OPS, COMMANDS | [release-acceptance.html](../../docs/verification/reports/SERVICE-V1/release-acceptance.html) |
| SERVICE-V1-20 | E7 | UI, OPS | [pilot-readiness.html](../../docs/verification/reports/SERVICE-V1/pilot-readiness.html) |
| SERVICE-V1-21 | E7 | BROWSER, UI, RELIABILITY | [pilot-readiness.html](../../docs/verification/reports/SERVICE-V1/pilot-readiness.html) |
| SERVICE-V1-22 | E7 | UI, RELIABILITY, OPS, COMMANDS | [pilot-readiness.html](../../docs/verification/reports/SERVICE-V1/pilot-readiness.html) |

Групповые проверки:
- E1: текущая UI/style/recovery регрессия и contract review; report editor-contract.html.
- E2: PostgreSQL deployment races + ordinary URL/explicit selectors + Admin/repair.
- E3: новый независимый клиент, реальные email, origin verification и cold-start onboarding.
- E4: A/B-ссылка, named conversion/consent, точные контрольные totals и ручной winner без auto-deploy.
- E5: clean deployment/upgrade, packed delivery, limits, jobs, audit/deletion, реальные restore/alert checks.
- E6: SERVICE-V1-19 последовательно выполняет все обязательные группы на финальном candidate, используя актуальное неизменное evidence 18/ops.
- E7: SERVICE-V1-21 начинает реальный пилот только после 19;22 принимает launch decision на основании результатов.
- Все слои наследуются final gate 19 даже если не перечислены в docs-only task 20. В 21 повторяется пользовательский workflow, а не имитируется исходными fixtures.

## Commands and fixtures

Существующие команды, запускать из корня monorepo последовательно при общей среде:

```sh
npm run build
npm run typecheck
npm test
npm run test:e2e:http
npm run test:e2e:browser
npm run dev:e2e
npm run verify:consumer --workspace @lykar/sdk
npm run verify:s4:framework-consumer
git diff --check
```

`npm test` без test DATABASE_URL может пропускать DB suites; это не заменяет `test:e2e:http` с временной PostgreSQL. `dev:e2e` — ручной стенд, не автоматическое доказательство PASS. Точный toolchain фиксируется по фактическому запуску; репозиторий использует Node 22/npm 10/PostgreSQL 15 baseline и собственный lockfile.

Существующие fixtures: `tests/fixtures/static`, `tests/fixtures/spa`, packed SDK consumer, `apps/playground`. Важные suites: auth-and-editor, versioning-flow, persistence-recovery, editor-design, editor-style-reset, style-editor-acceptance, page-session-lifecycle, replay-safety, s3-acceptance, s4-conditional-flow и s4-spa-critical. Точные версии и boundaries — в [SDK compatibility](../../packages/sdk/COMPATIBILITY.md). Старый tests/e2e/README описывает исторические шесть cases и не является актуальным количеством tests.

Текущее Firefox/WebKit testMatch ограничено style/S4 именами; новая service suite должна быть явно включена в 17. Ноль найденных tests и пропуск обязательного browser engine являются FAIL/BLOCKED, а не PASS.

Будущие deployment/signup/domain/onboarding/goal/limits/jobs/deletion/service suites и команды staging smoke/restore/measurement определяются и документируются в соответствующих задачах. Их названия в task scope — ожидаемые deliverables, не утверждение о существующих CLI.

Текущие `verify:performance` и `verify:s4:performance` пишут в исторические S1/S4 paths. В 18 добавить отдельный output или изолировать исполнение; не запускать их поверх сохранённого evidence. Измерения начального SDK не подменяют стоимость runtime/manifest/API/editor.

## Environments and evidence

- Unit/API: изолированные данные, реальная PostgreSQL для transactions/concurrency/migrations; mock provider допустим в unit, но не вместо настоящего staging email gate.
- Browser: separate owner/visitor/two-tenant contexts, ephemeral ports/DB; static и React/Vue CSR/ordinary hydration. Не добавлять новые supported frameworks молча.
- Staging: отдельные HTTPS domain/data/secrets/test mailboxes; восстановление только в отдельную disposable DB.
- На каждый run сохранять candidate/tree hash, время, toolchain, commands, exit codes, число найденных/выполненных/skipped tests, logs и diagnostics.
- Screenshots основных UI состояний и trace/video при сбое; logs и reports без tokens/full URLs с секретами, PII и provider secrets.
- Group HTML описывает изменения структуры/контрактов, тесты и ограничения; machine artifacts лежат отдельно под run-id.
- Существующие S0–S4 reports не перезаписываются. В planning turn не создаются фиктивные application verification reports.

## Release-blocking checks

- Основной сценарий не завершается, потеря/перезапись правок, некорректный rollback либо migration failure.
- Чужой tenant/Page/capability получает доступ, invalid explicit token раскрывает/применяет deployment, утечка secret в logs/assets.
- Неверное распределение/назначение A/B, duplicate events, incorrect totals/goal filtering, события без допустимого consent.
- Отказ SDK/API оставляет host скрытым/сломленным или нарушает согласованный deadline; принятый performance budget не выполнен.
- Отсутствует реальное evidence email/backup restore/jobs/alerts/upgrade для эксплуатации.
- Mandatory DB/browser tests не обнаружены/пропущены; один snapshot не подтверждён.
- Критические проблемы внешнего пилота либо отсутствие согласованного пилота блокируют 22, но не переписывают факт уже пройденной технической приёмки 19.

## Out of scope and deferred

Вне этой версии: X1/X2, AI, автоматический биллинг, новые framework-адаптеры, внешняя сертификация/pentest и статистические заявления о победителе без отдельной методики.

A/B по обычному трафику, больше двух вариантов, автоцели click/URL/form, полномасштабная нагрузочная кампания, полный visual/WCAG audit и новые framework adapters не входят. Базовая visual/keyboard/focus приёмка, bounded failure tests и эксплуатационные limits входят. Текущие static/React/Vue ограничения сохраняются. Маркетинговые обещания статистического эффекта и readiness внешнего сервиса без evidence запрещены.

## Open questions

- Новые численные budgets (editor size, browser latency/layout, cache deadline, нагрузочные пределы), quotas, RPO/RTO — решить и записать в SERVICE-V1-02 до зависимой реализации. Нельзя считать отсутствующее число принятым.
- Production domain, hosting/CDN, email provider, registry/tarball delivery, data region и права настройки — внешние решения SERVICE-V1-02; получить доступ до 07/12. Изменений внешних сервисов при планировании нет.
- Метод domain ownership verification и безопасная работа с локальными fixtures — решение 02 до 08; браузерный heartbeat не заменяет proof of ownership.
- Именованная цель A/B и совместимость event-specific отчёта — контракт 02 до 10; автоматические click/URL/form goals PROPOSED и не блокируют минимальный explicit-track путь.
- Участники, сайты, права вмешательства, размер выборки и thresholds пилота — решение 20 до 21; число 3–5 является предложением, а не согласованной проверкой.
- Внешнее открытие SaaS, выпуск npm пакетов и отправка приглашений выполняются при исполнении отдельными явными действиями; это план, а не подтверждение размещённого сервиса.

## Agreement changes

Менять согласованные слои, release blockers или расширять support matrix можно только видимым изменением TEST-PLAN с decision log и подтверждением владельца. Конкретизация тестовых файлов/команд внутри уже согласованного слоя не является новым продуктовым обещанием. PROPOSED пункты в 02/10/18/20 не считаются AGREED до решения; выполнение обязательных критериев не подменяется исключением без записи.

## Execution note — 2026-10-03

Согласованная матрица и границы не менялись. SERVICE-V1-01 имеет свежий [отчёт](../../docs/verification/reports/SERVICE-V1/editor-contract.html). Предложения новых численных пределов D01–D10 находятся в [контракте](../../docs/architecture/service-v1-contract.md); они пока не утверждены и не подменяют действующие budgets. Legacy editor-size FAIL показан явно.

SERVICE-V1-03: API build/typecheck, 31/31 API/PostgreSQL tests и HTTP smoke PASS. Новые unit, migration и deployment integration cases реализованы в рамках прежних CORE/RELIABILITY слоёв; тестовые границы не менялись. Browser deployment acceptance остаётся 04.


### 07 — локальный checkpoint без ключа (2026-10-05)

По команде владельца выполнена локальная часть до подключения provider/staging.
`npm run test:e2e:http` включает email adapters/templates/policy/router, PostgreSQL
shared quotas/restart/concurrency, API 429/Retry-After, token preservation и safe
unknown outcome. `npx playwright test tests/e2e/auth-and-editor.spec.ts --reporter=line,json`
проверяет auth и email countdown в Chromium/Firefox/WebKit. `npm run typecheck` —
вся workspace. Fake fetch/file capture не являются evidence реальной доставки.
Секретные capture-файлы не копируются в reports; внешняя OPS-проверка остаётся открытой.


### 08 — DNS ownership и connection probe (2026-10-06)

`npm run test:e2e:http`: controlled DNS matcher/deadline/security cases и реальные
PostgreSQL transactions — tenant/origin/nonce binding, expiry/revoke/replay,
revocation during DNS lookup, permissions, deploy gate, stale/no-signal/new generation.
`npm test --workspace @lykar/sdk`: passive probe, no ordinary-visit diagnostics,
CSP classification, API/asset errors, framework registry и lifecycle invalidation.
`npx playwright test tests/e2e/site-connection.spec.ts tests/e2e/auth-and-editor.spec.ts --reporter=line,json`:
реальные browser SDK/assets и CSP, wrong key, missing SDK inconclusive, React/Vue
CSR/ordinary hydration, Admin desktop/mobile и существующий auth/editor путь.
Workspace typecheck запускать последовательно со сборками browser, не параллельно.
Live DNS changes/HTTPS staging не входят в этот локальный evidence; HTTP verifier
не реализован, поэтому HTTP redirect/rebinding транспортных запросов здесь нет.
