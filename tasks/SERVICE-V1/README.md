# SERVICE-V1 — Быстрые правки сайта и A/B как готовый сервис

Plan format: 2
Sprint ID: SERVICE-V1
Status: IN_PROGRESS
Planning date: 2026-10-02

Это эпик из семи этапов, который доводит существующий Lykar до самостоятельно подключаемого сервиса быстрых правок и экспериментов. Клиент регистрируется, подключает свой сайт, сохраняет изменение и либо явно включает его для обычных посетителей, либо запускает A/B по специальной ссылке. Техническая приёмка, пользовательский пилот и решение об открытии сервиса имеют отдельные выходные критерии.

[TEST-PLAN.md](./TEST-PLAN.md) · [HTML-обзор](./plan.html)

Статусы: `PLANNED` — запланировано; `IN_PROGRESS` — выполняется; `BLOCKED` — есть явное препятствие; `DONE` — критерии подтверждены evidence; `CANCELLED` — отменено. При создании все задачи имели PLANNED; текущий статус отражён в таблице.

## Sprint goal

Первый клиент самостоятельно получает полезную правку на подключённом сайте и может безопасно включить, выключить либо откатить её. A/B в первой версии получает участников **только по специальной entry-ссылке**; клиент настраивает explicit conversion/consent, проверяет событие и видит корректный описательный отчёт. Публикация на обычном URL является отдельным осознанным действием; готовность требует работоспособных писем, доставки SDK, восстановления данных и поддержки.

- **E1 — Принять редактор и зафиксировать сервисный контракт** (SERVICE-V1-01, SERVICE-V1-02): Есть воспроизводимый исходный срез и принятые правила продукта/бюджеты.
- **E2 — S5: публикация, отключение и откат** (SERVICE-V1-03, SERVICE-V1-04, SERVICE-V1-05): Правка работает на обычном URL только после явного Deploy; Disable и Rollback проверены.
- **E3 — S6: регистрация и самостоятельное подключение** (SERVICE-V1-06, SERVICE-V1-07, SERVICE-V1-08, SERVICE-V1-09): Новый клиент получает письмо, создаёт сайт, подтверждает домен и подключает SDK без терминала Lykar.
- **E4 — A/B по ссылке: настройка и достоверный отчёт** (SERVICE-V1-10, SERVICE-V1-11): Клиент запускает A/B-ссылку, проверяет событие/consent и понимает результаты.
- **E5 — S6: доставка и эксплуатация** (SERVICE-V1-12, SERVICE-V1-13, SERVICE-V1-14, SERVICE-V1-15, SERVICE-V1-16): Есть staging, доставка SDK, защитные лимиты, jobs, удаление данных, мониторинг и проверенный restore.
- **E6 — Приёмка кандидата в выпуск** (SERVICE-V1-17, SERVICE-V1-18, SERVICE-V1-19): Один snapshot проходит согласованные проверки и воспроизводимо устанавливается.
- **E7 — Пилот и решение об открытии сервиса** (SERVICE-V1-20, SERVICE-V1-21, SERVICE-V1-22): Реальные пользователи выполняют сценарий; критичные проблемы закрыты, решение о запуске подтверждено evidence.

Подготовка инфраструктуры 12 начинается параллельно с backend 03, а support 20 — с regression 17. Это подготовительные работы; stage gates и реальный пилот сохраняют зависимости.

## Discovery and decisions

- Проверен monorepo `repositories/lykar/lykar`, HEAD `e565328c339af5f12e488c37e0c972ae181d3dc9`. По состоянию на 2026-10-02 есть незакоммиченные editor/UI/E2E изменения; задача 01 принимает фактическое дерево отдельно.
- Исторический [S4 report](../../docs/verification/reports/s4/s4-acceptance.html) подтверждает свою матрицу, но не новые изменения и не production readiness. В рамках планирования application build/tests не запускались.
- Владелец подтвердил приоритет: A/B-тестирование, быстрые правки и эксперименты над действующим сайтом. X1/X2 handoff не являются gate этого эпика.
- Владелец принял тестовую матрицу и границы ответом «Согласен с матрицей и границами (рекомендую)».
- Владелец выбрал «На первой версии достаточно A/B-ссылок». Обычный трафик не распределяется автоматически.
- Название SERVICE-V1 подтверждено ответом «да» на прямой вопрос о названии эпика.
- План сохраняет [SPEC](../../SPEC.md), [SDK compatibility](../../packages/sdk/COMPATIBILITY.md) и принятую S4 support boundary. Глобальная очередь обновлена в исполнении 02; новые budgets/providers ещё не утверждены.

## Current gaps mapped to stages

| Наблюдение | Доказательство / контекст | Планируемый выход |
| --- | --- | --- |
| Production deployment ещё planned | SPEC §6.8; ordinary manifest resolve без selector возвращает204 | E2 |
| Новый произвольный email не создаёт account; default sender пишет ссылку в log | apps/api/src/domain/auth.ts; apps/api/src/app.ts | E3 |
| UI содержит localhost defaults и не даёт законченной проверки установки | apps/admin/src/main.tsx; INT-08/OPS требования | E3 |
| track/consent есть, но клиенту нужен понятный setup/diagnostics | packages/sdk/src/sdk.ts; experiments-panel.tsx | E4 |
| SDK/frameworks private, нет найденного CI/deploy recipe в checkout | packages/sdk/package.json; packages/frameworks/package.json | E5 |
| Есть health/logs/prune, но production ops в основном planned | SPEC §21; ROADMAP OPS-01…04 | E5 |
| Нужна целостная свежая проверка текущей UI и внешнего workflow | dirty tree + отдельные исторические reports | E1, E6, E7 |

## Testing agreement

Agreement status: AGREED.
Decision date: 2026-10-02.
Подтверждена приведённая ниже матрица и границы. Это соглашение о проверках, а не утверждение об их прохождении. Конкретные новые численные budgets и pilot sample остаются открытыми решениями в задачах 02/20; тестовые слои не пересогласовываются без изменения scope.

| ID | Согласованный слой и scope | Команды / fixtures | Среда | Evidence | Блокирует выпуск |
| --- | --- | --- | --- | --- | --- |
| CORE | Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики. | npm test; npm run test:e2e:http; целевые workspace suites; существующие migrations 001–009 и будущие миграции эпика | Локально/CI, изолированная временная PostgreSQL; два клиента и конкурентные запросы | Логи, число найденных/выполненных tests, SQL-инварианты и результаты повторов | Да |
| BROWSER | Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit. | npm run test:e2e:browser; npx playwright test <существующий либо будущий файл> --project=<engine>; tests/fixtures/static и tests/fixtures/spa | Локальный стенд/CI; затем HTTPS staging; отдельные owner/visitor/client contexts | Playwright report; screenshots важных состояний; trace/video при сбое | Да |
| UI | UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения. | npm run dev:e2e; текущие editor-design, editor-style-reset, style-editor-acceptance suites; будущие service UI cases | Desktop/mobile viewport; поддержанная браузерная матрица; staging | Чеклист оператора, screenshots, воспроизводимые шаги дефектов | Да, основные сценарии и доступность их управления |
| RELIABILITY | Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации. | Unit/API/E2E fault cases; interception в Playwright; проверки logs/assets; существующие lifecycle/recovery/access suites | Временная БД и управляемый браузер; ограниченные проверки на staging | Отказы/таймауты, согласованные числа событий, редактированные логи, diagnostics | Да |
| OPS | Эксплуатация: тестовая среда, реальные тестовые письма, обновление версии, резервная копия/восстановление, фоновые задачи и сигнал о сбое. | Будущие deploy/smoke/jobs/restore команды фиксируются в задачах 12–16; существующие npm run build и db:migrate | Изолированная HTTPS staging, тестовые ящики владельца, отдельная БД восстановления | Версии артефактов, delivery receipts, результат restore, job retries и тестовый alert | Да до технической приёмки сервиса |
| COMMANDS | Используем существующие npm run build/typecheck/test, test:e2e:http, test:e2e:browser, Playwright и временную PostgreSQL; новые команды отмечаем как будущие. | npm run build; npm run typecheck; npm test; npm run test:e2e:http; npm run test:e2e:browser | Node/npm/PostgreSQL/браузеры фиксируются фактически; общий стенд используется последовательно | Exit codes, revision/tree hash, версии среды, число tests; отсутствие скрытых skip | Да |

- У каждой задачи — целевые проверки, у этапа — общий прогон и HTML-отчёт; логи и скриншоты, trace/video при сбое. Полные прогоны на одном стенде последовательные.
- Ошибки основных сценариев, потеря данных, нарушение доступа и неверные A/B-данные блокируют выпуск.
- Вне этой версии: X1/X2, AI, автоматический биллинг, новые framework-адаптеры, внешняя сертификация/pentest и статистические заявления о победителе без отдельной методики.
- Пользовательский пилот — отдельный этап после технической приёмки.

Полный decision log, task-to-test mapping, команды и вопросы находятся в [TEST-PLAN.md](./TEST-PLAN.md). Выполнение обязательной проверки блокируется при отсутствии environment/provider/access; отсутствие evidence нельзя считать PASS.

## Tasks

| ID | Title | Status | Priority | Depends on | Parallel wave | Problem solved | Enables | Task file |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SERVICE-V1-01 | Приёмка текущего редактора | DONE | P0 | None | W1 | После S4 в рабочем дереве есть изменения редактора и новые tests; историческая приёмка не подтверждает их состояние. | Надёжную основу для сервисных сценариев и сравнения регрессий. | [01](01-editor-baseline.md) |
| SERVICE-V1-02 | Контракт сервиса и решения перед реализацией | IN_PROGRESS | P0 | SERVICE-V1-01 | W2 | Документы смешивают очередь X1/X2 с запуском сервиса, а provider, budgets и UX активации ещё не выбраны. | Согласованные API/UI сценарии для публикации, регистрации, подключения и отчёта.; Однозначные входные условия инфраструктуры и приёмки. | [02](02-service-contract.md) |
| SERVICE-V1-03 | Deployment: схема, API и история активаций | DONE | P0 | SERVICE-V1-02 | W3 | Release существует, но нет активной публикации и auditable Deploy/Disable/Rollback. | Получение production выбора runtime.; Управление публикацией из Admin. | [03](03-deployment-api.md) |
| SERVICE-V1-04 | Доставка активной версии и безопасное отключение | DONE | P0 | SERVICE-V1-03 | W4 | Опция delivery существует, но обычный manifest resolve без selector сейчас возвращает native. | Реальное применение быстрой правки на обычном URL.; Проверяемые Disable/Rollback и совместимость с preview/A/B. | [04](04-deployment-runtime.md) |
| SERVICE-V1-05 | Публикация в Admin и проверка применимости правок | DONE | P0 | SERVICE-V1-04 | W5 | Сохранённая версия и реальный результат сайта не собраны в один ежедневный workflow. | Полный сценарий быстрой правки и отката.; Понятные результаты для будущего onboarding. | [05](05-deployment-admin-repair.md) |
| SERVICE-V1-06 | Регистрация и независимые владельцы сайтов | DONE | P0 | SERVICE-V1-05 | W6 | Текущий auth создаёт пользователя только для заранее заданного owner email либо находит существующего. | Самостоятельный вход нового клиента.; Реальные письма и сценарий первого сайта. | [06](06-signup-tenancy.md) |
| SERVICE-V1-07 | Доставка писем, лимиты и переключение провайдеров | IN_PROGRESS | P0 | SERVICE-V1-06, SERVICE-V1-12 | W7 | По умолчанию sender печатает секретную ссылку в API log, а пользователю нечего открыть в почте. | Регистрацию и приглашения вне локального стенда.; Последующую очередь повторной отправки. | [07](07-email-delivery.md) |
| SERVICE-V1-08 | Подтверждение сайта и диагностика подключения | DONE | P0 | SERVICE-V1-07 | W8 | Создание Project/allowed origin само по себе не подтверждает право на сайт и успешную интеграцию. | Мастер подключения с проверяемым результатом.; Понятную диагностику CSP, assets и framework readiness. | [08](08-site-verification-health.md) |
| SERVICE-V1-09 | Мастер подключения и первый полезный результат | DONE (local; external 07/12 pending) | P0 | SERVICE-V1-08 | W9 | Admin показывает localhost, ключи и технические состояния, а клиент должен самостоятельно соединять установку, страницу и редактор. | Самостоятельную активацию клиента.; Проверяемую точку входа в публикацию и A/B. | [09](09-onboarding-admin.md) |
| SERVICE-V1-10 | Настройка конверсии и consent для A/B | PLANNED | P0 | SERVICE-V1-09 | W10 | Explicit track/consent есть в SDK, но нулевой отчёт не объясняет отсутствие события, согласия или посещений. | Осмысленный отчёт A/B с выбранным событием.; Диагностику интеграции до отправки трафика. | [10](10-analytics-setup.md) |
| SERVICE-V1-11 | Полный A/B-сценарий по ссылке и читаемый отчёт | PLANNED | P0 | SERVICE-V1-10 | W11 | Технический эксперимент работает, но setup, QA-ссылки, traffic entry и результаты требуют продуктовой ясности. | Рабочую A/B-функцию первого сервиса.; Проверенный путь от варианта страницы до отчёта. | [11](11-ab-workflow-report.md) |
| SERVICE-V1-12 | Среды, CI и доставка SDK клиентам | PLANNED | P0 | SERVICE-V1-02 | W3 | В репозитории не найдены production deployment pipeline; SDK/frameworks пока private и требуют ручного размещения assets. | HTTPS staging для email/onboarding и финальных проверок.; Управляемый выпуск и откат версии самого SDK. | [12](12-staging-ci-distribution.md) |
| SERVICE-V1-13 | Лимиты сервиса и безопасная диагностика | PLANNED | P0 | SERVICE-V1-11, SERVICE-V1-12 | W12 | Public auth, resolve и analytics требуют контролируемого поведения при большом числе запросов; лимиты пока не оформлены. | Эксплуатацию регистрации и public runtime.; Предсказуемую работу jobs и monitoring. | [13](13-limits-safe-logs.md) |
| SERVICE-V1-14 | Надёжные фоновые письма и очистка данных | PLANNED | P0 | SERVICE-V1-13, SERVICE-V1-07 | W13 | Есть ручной prune command и синхронная email граница; нет завершённого планировщика/jobs. | Регулярную эксплуатацию без ручного запуска скриптов.; Мониторинг отказов и restore background state. | [14](14-background-jobs.md) |
| SERVICE-V1-15 | Журнал действий и удаление клиентских данных | PLANNED | P0 | SERVICE-V1-14 | W14 | Production требует audit и data deletion; история отдельных доменов не заменяет полный lifecycle клиента. | Поддержку инцидентов и запросов клиента.; Безопасные backup/restore и готовность публичного сервиса. | [15](15-audit-data-lifecycle.md) |
| SERVICE-V1-16 | Мониторинг, резервные копии и восстановление | PLANNED | P0 | SERVICE-V1-15, SERVICE-V1-12 | W15 | Health endpoint и логи не доказывают обнаружение отказа БД/email/jobs или возможность восстановить данные. | Работу сервиса под наблюдением.; Техническую приёмку и пользовательский пилот. | [16](16-observability-recovery.md) |
| SERVICE-V1-17 | Сквозная регрессия и приёмка интерфейсов | PLANNED | P0 | SERVICE-V1-16 | W16 | Локальные успешные tests отдельных функций не доказывают работу сервиса через реальные UI/API. | Кандидат в выпуск без функциональных и access-блокеров.; Измерение производительности принятого workflow. | [17](17-service-regression.md) |
| SERVICE-V1-18 | Бюджеты производительности и поведение доставки | PLANNED | P0 | SERVICE-V1-17 | W17 | JSDOM CPU и размер начального SDK не измеряют полную загрузку, layout, cache и поведение при медленной сети. | Обоснованный release gate по производительности.; Честные ограничения latency/flicker для клиента. | [18](18-performance-delivery.md) |
| SERVICE-V1-19 | Итоговая техническая приёмка одного кандидата | PLANNED | P0 | SERVICE-V1-18, SERVICE-V1-20 | W18 | Отчёты разных revisions и раздельные unit/browser/ops PASS могут скрыть неработающую интеграцию. | Начало пилота после технической готовности.; Повторяемый выпуск и расследование дефектов. | [19](19-release-candidate-acceptance.md) |
| SERVICE-V1-20 | Материалы поддержки и подготовка пилота | PLANNED | P1 | SERVICE-V1-16 | W16 | Без понятной поддержки и протокола наблюдения пилот не покажет, где клиент не может завершить работу. | Контролируемую проверку на внешних сайтах.; Осмысленное решение о запуске. | [20](20-support-pilot-preparation.md) |
| SERVICE-V1-21 | Пилот на согласованных реальных сайтах | PLANNED | P0 | SERVICE-V1-19, SERVICE-V1-20 | W19 | Техническая матрица не доказывает самостоятельное использование клиентом и совместимость конкретного внешнего сайта. | Проверенную готовность первой версии сервиса.; Приоритизацию обнаруженных проблем по влиянию на клиента. | [21](21-external-pilot.md) |
| SERVICE-V1-22 | Решение о готовности сервиса | PLANNED | P0 | SERVICE-V1-21 | W20 | Набор закрытых задач не равен подтверждённой готовности обслуживать внешних клиентов. | Отдельное осознанное открытие сервиса.; Следующую очередь улучшений по evidence пользователей. | [22](22-service-launch-decision.md) |

## Definition of done

- [ ] Текущий editor принят отдельным snapshot; новые задачи не наследуют DONE исторических этапов.
- [ ] Publish/Deploy/Disable/Rollback различимы; replay/cache/failure semantics и immutable Release проверены.
- [ ] Новый клиент регистрируется, получает реальные письма, подтверждает и подключает свой сайт, понимает диагностику.
- [ ] Есть доступный и проверенный script/npm либо явно названный beta delivery path; обещания установки соответствуют реальным артефактам.
- [ ] A/B entry-ссылка работает независимо от ordinary deployment; QA/share не считаются experiment traffic, winner не включает deployment.
- [ ] Explicit goal/consent настройка проверена; counts/CVR/uplift корректны, significance не заявляется.
- [ ] CI/staging, limits, jobs, audit/deletion, safe logs, backups/restore и alerts имеют evidence.
- [ ] Поддержка ограничена static и принятой React/Vue CSR/обычной hydration матрицей; unsupported modes видны пользователю.
- [ ] Все AGREED release-blocking checks пройдены на одном candidate; обязательные skip/отсутствующие tests отсутствуют.
- [ ] Пилот выполнен после технической приёмки по согласованному протоколу, критические defects закрыты с regression.
- [ ] Решение о готовности сервиса 22 опирается на reports, не выдаёт готовый план за размещённый сервис.
- [ ] Открытые обязательные решения 02/20 закрыты; отложенные функции не превращены в скрытые gates.

## Execution order

SERVICE-V1-01 → SERVICE-V1-02 → SERVICE-V1-03 + SERVICE-V1-12 → SERVICE-V1-04 → SERVICE-V1-05 → SERVICE-V1-06 → SERVICE-V1-07 → SERVICE-V1-08 → SERVICE-V1-09 → SERVICE-V1-10 → SERVICE-V1-11 → SERVICE-V1-13 → SERVICE-V1-14 → SERVICE-V1-15 → SERVICE-V1-16 → SERVICE-V1-17 + SERVICE-V1-20 → SERVICE-V1-18 → SERVICE-V1-19 → SERVICE-V1-21 → SERVICE-V1-22.

Первой выполняется [SERVICE-V1-01](./01-editor-baseline.md): принять существующее рабочее дерево. Задача 02 фиксирует общие правила перед расширением. Номера задач сгруппированы по этапам; раньше своей группы могут стартовать только 12 и 20 по явным зависимостям.

Hard dependencies записаны в task files и транзитивно наследуются. Ребро 05→06 дополнительно сериализует общий API/Admin/migration checkpoint; это coordination dependency, а не утверждение о том, что signup логически требует Deploy. Аналогично 11→13 фиксирует интеграцию auth/analytics/delivery перед общими middleware/limits.

## Parallel execution map

Разрешены только две пары: W3 = 03 + 12, W16 = 17 + 20. Во всех прочих волнах один владелец интеграционной поверхности. Изолированные рабочие каталоги и среды обязательны для параллельных mutations/builds; один checkout или shared DB/ports переводят выполнения в последовательный режим.

| Wave | Safe set | Ownership / coordination | Serialized prerequisite edges |
| --- | --- | --- | --- |
| W1 | SERVICE-V1-01 | Последовательно; общие контракты/стенд не разделяются. | None |
| W2 | SERVICE-V1-02 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-01 → SERVICE-V1-02 |
| W3 | SERVICE-V1-03 + SERVICE-V1-12 | Параллельно только с 12: здесь apps/api domain/routes/migrations, там CI и упаковка. Общие package scripts/lockfile принадлежат 12; если 03 требует их изменения, checkpoint сериализуется. Общий стенд не запускается конкурентно. | SERVICE-V1-02 → SERVICE-V1-03; SERVICE-V1-02 → SERVICE-V1-12 |
| W4 | SERVICE-V1-04 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-03 → SERVICE-V1-04 |
| W5 | SERVICE-V1-05 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-04 → SERVICE-V1-05 |
| W6 | SERVICE-V1-06 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-05 → SERVICE-V1-06 |
| W7 | SERVICE-V1-07 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-06 → SERVICE-V1-07; SERVICE-V1-12 → SERVICE-V1-07 |
| W8 | SERVICE-V1-08 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-07 → SERVICE-V1-08 |
| W9 | SERVICE-V1-09 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-08 → SERVICE-V1-09 |
| W10 | SERVICE-V1-10 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-09 → SERVICE-V1-10 |
| W11 | SERVICE-V1-11 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-10 → SERVICE-V1-11 |
| W12 | SERVICE-V1-13 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-11 → SERVICE-V1-13; SERVICE-V1-12 → SERVICE-V1-13 |
| W13 | SERVICE-V1-14 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-13 → SERVICE-V1-14; SERVICE-V1-07 → SERVICE-V1-14 |
| W14 | SERVICE-V1-15 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-14 → SERVICE-V1-15 |
| W15 | SERVICE-V1-16 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-15 → SERVICE-V1-16; SERVICE-V1-12 → SERVICE-V1-16 |
| W16 | SERVICE-V1-17 + SERVICE-V1-20 | Параллельно с 20 только как code/testing против docs-only поддержки. 17 владеет tests/app fixes; 20 не меняет code, contracts, fixtures или общий acceptance report. Стенд принадлежит 17. | SERVICE-V1-16 → SERVICE-V1-17; SERVICE-V1-16 → SERVICE-V1-20 |
| W17 | SERVICE-V1-18 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-17 → SERVICE-V1-18 |
| W18 | SERVICE-V1-19 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-18 → SERVICE-V1-19; SERVICE-V1-20 → SERVICE-V1-19 |
| W19 | SERVICE-V1-21 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-19 → SERVICE-V1-21; SERVICE-V1-20 → SERVICE-V1-21 |
| W20 | SERVICE-V1-22 | Последовательно; общие контракты/стенд не разделяются. | SERVICE-V1-21 → SERVICE-V1-22 |

Dependency edges:

```text
SERVICE-V1-01 -> SERVICE-V1-02
SERVICE-V1-02 -> SERVICE-V1-03
SERVICE-V1-03 -> SERVICE-V1-04
SERVICE-V1-04 -> SERVICE-V1-05
SERVICE-V1-05 -> SERVICE-V1-06
SERVICE-V1-06 -> SERVICE-V1-07
SERVICE-V1-12 -> SERVICE-V1-07
SERVICE-V1-07 -> SERVICE-V1-08
SERVICE-V1-08 -> SERVICE-V1-09
SERVICE-V1-09 -> SERVICE-V1-10
SERVICE-V1-10 -> SERVICE-V1-11
SERVICE-V1-02 -> SERVICE-V1-12
SERVICE-V1-11 -> SERVICE-V1-13
SERVICE-V1-12 -> SERVICE-V1-13
SERVICE-V1-13 -> SERVICE-V1-14
SERVICE-V1-07 -> SERVICE-V1-14
SERVICE-V1-14 -> SERVICE-V1-15
SERVICE-V1-15 -> SERVICE-V1-16
SERVICE-V1-12 -> SERVICE-V1-16
SERVICE-V1-16 -> SERVICE-V1-17
SERVICE-V1-17 -> SERVICE-V1-18
SERVICE-V1-18 -> SERVICE-V1-19
SERVICE-V1-20 -> SERVICE-V1-19
SERVICE-V1-16 -> SERVICE-V1-20
SERVICE-V1-19 -> SERVICE-V1-21
SERVICE-V1-20 -> SERVICE-V1-21
SERVICE-V1-21 -> SERVICE-V1-22
```

Общие protocol/API types, migration numbering, fixtures, root lockfile/package scripts и mutable staging являются coupling. Любое незапланированное пересечение останавливает параллельную часть до contract checkpoint; разные имена файлов сами по себе не доказывают безопасность. Команды полного build/test и работа со staging никогда не исполняются конкурентно на одном стенде.

## Checks and evidence policy

- На задаче выполняются узкие проверки изменяемого поведения; integration group включает наследованные regressions. Единственный финальный полный прогон на одном candidate —19.
- После изменений в 18/пилоте повторяются затронутые проверки и обновляется candidate; evidence другого snapshot не переносится без обоснования.
- Group reports — семь файлов, указанных ниже. Внутри отчёта отдельные anchors/строки task IDs, структуры/контракты, проверки, ограничения и next tasks. Машинные логи не копируются целиком в HTML.
- При исполнении artifacts хранятся в `docs/verification/reports/SERVICE-V1/artifacts/<run-id>/`; secrets/PII редактируются. Исторические S0–S4 отчёты не перезаписываются.
- Пока создаётся только план. Ссылки на будущие reports не являются evidence; пустые PASS отчёты не создаются.

| Stage | Назначение | Tasks | Будущий групповой report |
| --- | --- | --- | --- |
| E1 | Принять редактор и зафиксировать сервисный контракт | SERVICE-V1-01, SERVICE-V1-02 | [editor-contract.html](../../docs/verification/reports/SERVICE-V1/editor-contract.html) |
| E2 | S5: публикация, отключение и откат | SERVICE-V1-03, SERVICE-V1-04, SERVICE-V1-05 | [deployment.html](../../docs/verification/reports/SERVICE-V1/deployment.html) |
| E3 | S6: регистрация и самостоятельное подключение | SERVICE-V1-06, SERVICE-V1-07, SERVICE-V1-08, SERVICE-V1-09 | [onboarding.html](../../docs/verification/reports/SERVICE-V1/onboarding.html) |
| E4 | A/B по ссылке: настройка и достоверный отчёт | SERVICE-V1-10, SERVICE-V1-11 | [experiments.html](../../docs/verification/reports/SERVICE-V1/experiments.html) |
| E5 | S6: доставка и эксплуатация | SERVICE-V1-12, SERVICE-V1-13, SERVICE-V1-14, SERVICE-V1-15, SERVICE-V1-16 | [operations.html](../../docs/verification/reports/SERVICE-V1/operations.html) |
| E6 | Приёмка кандидата в выпуск | SERVICE-V1-17, SERVICE-V1-18, SERVICE-V1-19 | [release-acceptance.html](../../docs/verification/reports/SERVICE-V1/release-acceptance.html) |
| E7 | Пилот и решение об открытии сервиса | SERVICE-V1-20, SERVICE-V1-21, SERVICE-V1-22 | [pilot-readiness.html](../../docs/verification/reports/SERVICE-V1/pilot-readiness.html) |

## Open questions and external prerequisites

- Новые численные budgets (editor size, browser latency/layout, cache deadline, нагрузочные пределы), quotas, RPO/RTO — решить и записать в SERVICE-V1-02 до зависимой реализации. Нельзя считать отсутствующее число принятым.
- Production domain, hosting/CDN, email provider, registry/tarball delivery, data region и права настройки — внешние решения SERVICE-V1-02; получить доступ до 07/12. Изменений внешних сервисов при планировании нет.
- Метод domain ownership verification и безопасная работа с локальными fixtures — решение 02 до 08; браузерный heartbeat не заменяет proof of ownership.
- Именованная цель A/B и совместимость event-specific отчёта — контракт 02 до 10; автоматические click/URL/form goals PROPOSED и не блокируют минимальный explicit-track путь.
- Участники, сайты, права вмешательства, размер выборки и thresholds пилота — решение 20 до 21; число 3–5 является предложением, а не согласованной проверкой.
- Внешнее открытие SaaS, выпуск npm пакетов и отправка приглашений выполняются при исполнении отдельными явными действиями; это план, а не подтверждение размещённого сервиса.

## Out of scope

X1/X2/handoff; AI provider; автоматический billing; полноценный Workspace; новые framework/CMS adapters; Next.js/RSC/streaming/selective hydration и framework structural edits; A/B обычного трафика; multi-variant/автоматический statistical winner; автоматические click/URL/form goals; внешний pentest/сертификация и полный WCAG audit. Базовая keyboard/focus проверка, quotas, privacy/data lifecycle и поддержка входят в эпик.

Это большой эпик с 22 исполняемыми задачами в семи этапах, а не обещание завершить всё за один короткий спринт. Календарные оценки назначаются после 01 и внешних решений 02.

## Execution — 2026-10-03

SERVICE-V1-01 DONE: build/typecheck, unit 223, API 23 и browser 55 прошли; 6 browser cases перепроверены. Legacy editor size budget превышен и показан в [отчёте E1](../../docs/verification/reports/SERVICE-V1/editor-contract.html).

SERVICE-V1-02 IN_PROGRESS: [контракт](../../docs/architecture/service-v1-contract.md) и глобальная очередь обновлены. D01–D10 остаются PROPOSED/OPEN. После повторной команды продолжения backend 03 выполнен независимо от provider/budget решений; 12 ожидает инфраструктуры.

SERVICE-V1-03 DONE: explicit Deploy/Disable/Rollback, revision/idempotency и immutable history. API build/typecheck и 31 PostgreSQL/API тест с HTTP smoke прошли. [Отчёт E2](../../docs/verification/reports/SERVICE-V1/deployment.html). SDK delivery 04 завершён 2026-10-04; следующий срез — Admin 05.

Уточнение исходного порядка: ребро 02→03 сохраняет происхождение mode/access контракта. По команде владельца «продолжи» backend выполнен после готовности этой части 02, без ожидания не используемых им новых лимитов и providers. Это точечное исключение из полного gate; 02 не помечена DONE, 12 и release gates сохраняются. Согласованная тестовая матрица не изменена.


SERVICE-V1-04 DONE (2026-10-04): opt-in SDK delivery, no-store/lifecycle, cleanup и selector isolation.
Runtime 106/106, SDK 62/62, browser regression 55/55; build/typecheck PASS.
[Evidence E2](../../docs/verification/reports/SERVICE-V1/deployment.html#SERVICE-V1-04).
02 остаётся IN_PROGRESS: численные предложения и providers не приняты автоматически.
Следующая задача — SERVICE-V1-05, Admin Deploy/Disable/Rollback и repair.

### Checkpoint 2026-10-05

SERVICE-V1-05 завершён: технический workflow E2 теперь включает Admin → preview/repair →
Release → Deploy/Disable/Rollback и обычного посетителя. 302 unit, 31 API/PostgreSQL,
74 browser tests прошли; build/typecheck PASS. [Отчёт E2](../../docs/verification/reports/SERVICE-V1/deployment.html#SERVICE-V1-05).
На момент завершения 05 следующим шагом был 06; он завершён ниже. Решения/инфраструктура 02/12 остаются открытыми.

### Checkpoint 2026-10-05 — регистрация

SERVICE-V1-06 DONE: подтверждённый email создаёт независимый аккаунт, старые ссылки и
сессии сохранены, права Project/memberships изолированы. 36 API/PostgreSQL tests + HTTP
smoke, 18 browser tests (все три движка), общий typecheck PASS.
[Отчёт регистрации](../../docs/verification/reports/SERVICE-V1/onboarding.html#SERVICE-V1-06).
Следующий продуктовый срез — 07: реальные письма, лимит 3 запросов/email и переключение
настроенных провайдеров по квотам. Для внешней доставки нужен инфраструктурный prerequisite
12; окно лимита, пауза, провайдеры, квоты и даты сброса ещё уточняются. 08–09 остаются PLANNED.


### Checkpoint 2026-10-05 — письма без API-ключа

SERVICE-V1-07: локальная реализация adapters, quotas, request limits и безопасной
диагностики готова. Реальная доставка/HTTPS staging отложены по поручению владельца;
поэтому полный gate 07 остаётся IN_PROGRESS. Default без ключа — disabled (503),
тестовый file mode доступен только локально. [Отчёт 07](../../docs/verification/reports/SERVICE-V1/onboarding.html#SERVICE-V1-07).


### Checkpoint 2026-10-06 — подтверждение и подключение

08 реализует DNS TXT proof, deploy gate, отдельный dev-loopback путь, page-bound
connection reports и вкладку Admin. Внешняя доставка 07 и инфраструктура 12 остаются
открытыми: владелец явно поручил переход к технической реализации 08 без ожидания ключей.
[Отчёт 08](../../docs/verification/reports/SERVICE-V1/onboarding.html#SERVICE-V1-08).
Следующий функциональный этап — 09, мастер самостоятельного подключения.
