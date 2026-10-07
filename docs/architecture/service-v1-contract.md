# SERVICE-V1 — контракт первого сервиса

Дата: 2026-10-03. Владелец продуктовых и эксплуатационных решений: владелец проекта.
Статус: **IN_PROGRESS**; продуктовый scope подтверждён, новые численные пределы и поставщики **PROPOSED / OPEN**.

Основания: [SPEC](../../SPEC.md), [план](../../tasks/SERVICE-V1/README.md),
[согласованная матрица](../../tasks/SERVICE-V1/TEST-PLAN.md),
[текущий baseline](../verification/reports/SERVICE-V1/editor-contract.html).
Этот документ не объявляет будущие API реализованными и не заменяет согласование новых бюджетов.

## 1. Подтверждённая цель и границы

Клиент самостоятельно меняет действующий сайт: делает быструю правку либо эксперимент,
проверяет результат и управляет его включением. A/B первой версии получает участников
только по специальной ссылке. Распределение обычного трафика, X1/X2, AI, автоматический
billing и новые framework adapters находятся вне SERVICE-V1.

Поддержка SPA ограничена принятой [S4-матрицей](../../packages/sdk/COMPATIBILITY.md).
Deployment (03–05) и регистрация (06) реализованы и проверены локально. Реальные письма, подтверждение домена и внешняя эксплуатация остаются последующими этапами.

## 2. Состояния и язык интерфейса

| Состояние / действие | Значение для клиента | Влияние на обычный URL |
| --- | --- | --- |
| Исходная страница / Native | Страница самого сайта без операций Lykar | Базовое состояние |
| Черновик / Save draft | Изменяемая последовательность правок; сохранение не означает включение | Нет |
| Сохранённая версия / Create version / Publish API | Immutable Release с фиксированным manifest и hash | Нет |
| Предпросмотр / Preview | Проверка конкретной версии по защищённому доступу | Нет |
| Включить на сайте / Deploy | Явная активация одного Release для Page | Да, при включённом deployment delivery |
| Отключить / Disable | Новая activation с пустым указателем | Возврат исходной страницы при следующем resolve |
| Откатить / Rollback | Новая activation на выбранную прежнюю версию той же Page | Да; история и Release сохраняются |
| Завершить эксперимент | Остановка A/B; winner A/B/null — только метаданные | Нет |

Нельзя показывать «Изменения на сайте включены» после одного Save/Publish.
Статусы Draft, Release и Deployment отображаются отдельно. Несохранённые правки
и конфликт revision не должны выглядеть как успешное сохранение.

## 3. Матрица режимов доставки

Каждый resolve выбирает ровно один источник операций. Deployment никогда не является
базовым слоем для preview, варианта или editor. Native A остаётся исходной страницей
даже при активном deployment. При смене режима прежние Lykar-операции снимаются через
существующие ownership/journal правила, с сохранением более новых host-изменений.

| Вход | Проверка доступа | Источник страницы | A/B analytics |
| --- | --- | --- | --- |
| Editor launch | One-use code, Page/Draft, разрешение редактирования | Исходная страница + выбранный Draft | Нет |
| Share exchange / version=N | Share/editor capability на конкретную Page/Release | Исходная страница + один pinned Release | Нет |
| lykar_variant | Валидная QA-ссылка, Page/path и состояние варианта | Native либо один pinned Release | Нет |
| lykar_experiment | Валидная entry-ссылка, active Experiment, exact pathname | Sticky A или B: native либо pinned Release | Exposure/conversion только при granted consent |
| Обычный URL, links-only | Project integration contract | Native, без deployment resolve | Нет |
| Обычный URL, deployment | Подтверждённый origin, Page/path; публичный project key не даёт write access | Active Release либо Native | Нет |
| Неверный/истёкший/отозванный explicit selector; неправильный path | Отказ соответствующего режима | Native, без fallback к deployment | Нет |
| Paused/completed experiment entry | Эксперимент не принимает участников | Native | Нет |
| Несколько взаимоисключающих selectors | Ambiguous mode; не угадывать приоритет | Native + безопасная диагностика | Нет |
| Timeout/network/invalid manifest | Fail open с cleanup Lykar-операций | Исходная страница | Не записывать ложный exposure |

Deployment delivery — явный режим интеграции. Существующий links-only сохраняет
своё поведение. Live push в уже открытые вкладки не входит в V1: обновление происходит
при новом page load/navigation/refresh. Повторный start() той же generation memoized.
Реализация 04 использует no-store без shared pointer cache и сохраняет существующий
network default 5000 ms, replay 2000 ms и lazy asset load 10000 ms как отдельные
фазы. Это не принятие предлагаемого D03 deadline 2000 ms и не общий delivery SLA.

## 4. Права и активация клиента

| Действие | Owner | Admin | Editor | Viewer |
| --- | --- | --- | --- | --- |
| Просмотр доступного проекта | Да | Да | Да | Да |
| Draft/editor и подготовка draft Experiment | Да | Да | Да | Нет |
| Release/share, Deploy/Disable/Rollback, запуск A/B | Да | Да | Нет | Нет |
| Отчёт visitor analytics | Да | Да | Нет | Нет |
| Members/invitations | Да | Да, в пределах действующей role policy | Нет | Нет |
| Передача ownership | Да | Нет | Нет | Нет |

Роли и tenant isolation проверяются на backend, включая Page/Release/Experiment ID
из другого проекта. Capability editor не становится publishing credential.
Deploy/Disable/Rollback требуют expected revision и ключ идемпотентности; retry после
потери ответа возвращает прежний результат. Другая мутация с устаревшей revision даёт
явный conflict. Audit history хранит actor/time/reason и не переписывает Release.

Клиент считается активированным, когда самостоятельно:

1. Получил реальное письмо и вошёл по одноразовой ссылке.
2. Создал проект, подтвердил контроль origin и получил диагностику установки SDK.
3. Открыл Page, изменил её, сохранил Draft, создал Release и проверил preview.
4. Включил/отключил правку либо запустил A/B-ссылку и увидел проверенное conversion event.

Для A/B до первого activation фиксируются ровно A/B, weights и ссылки на Release/native.
Изменение после старта требует копии эксперимента. Отчёт описательный, без автоматического
«статистического победителя». Setup использует существующие explicit track/consent и
проверку именованного события; автоматические click/URL goals остаются PROPOSED.

## 5. Решения до зависимой реализации

Все строки ниже требуют явного решения владельца; наличие предложения не означает согласие.
Техническую реализацию и доказательства ведёт исполнитель соответствующей задачи.

| ID | Решение и предлагаемое значение | Статус | Зависимые задачи |
| --- | --- | --- | --- |
| D01 | Email magic link для регистрации/входа; новый подтверждённый email создаёт независимого владельца; общий публичный ответ и one-use/expiry/hash; приглашения отдельно; local login только dev/test | ACCEPTED: команда выполнить 06 от 2026-10-05 | 06, 07 |
| D02 | Проверка origin через DNS TXT с случайным server-bound challenge; отдельно для каждого разрешённого host, без неявного wildcard. Проверка установки SDK отдельно от подтверждения контроля. HTTP/sitemap fetch требует SSRF-защиты | IMPLEMENTED in 08 по поручению владельца; live DNS/staging не проверены | 08, 09 |
| D03 | Deployment decision без shared cache в первой версии; новый resolve видит committed revision. Сетевой deadline resolve 2000 ms, затем Native. Уже открытая вкладка обновляется на lifecycle/refresh; прежние 60 секунд не являются SLA | PROPOSED | 03–05, 12, 18 |
| D04 | Сохранить visitor bootstrap ≤80000 raw / 25000 gzip bytes и legacy replay p95 ≤250 ms. Предлагаемые дополнительные пределы: bootstrap+runtime ≤120000 raw / 36000 gzip; lazy editor ≤300000 raw / 80000 gzip | PROPOSED для новых лимитов | 12, 18 |
| D05 | Сохранить selection/input p95 ≤50 ms на 1000 nodes; deployment/replay не меняет layout до готовности и корректно снимает Lykar hiding при timeout. Измерять дополнительный CLS ≤0.02 на versioned fixture без intentional layout edits; ready→settled replay p95 ≤250 ms | PROPOSED для CLS и нового replay-сценария | 04, 18 |
| D06 | Начальный пилот: ≤3 сайта/owner, ≤100 Pages/сайт, ≤1000 operations/Release, ≤1 MiB JSON manifest; один active Experiment/Page уже является инвариантом. Превышение отклоняется явно, без частичного сохранения | PROPOSED | 13 |
| D07 | Resend письма: пауза 60s, ≤3 запросов/email/час (окно пока предложено), ≤30/IP/час; authenticated writes ≤120/user/min; public resolve ≤120/browser+project/min; analytics ≤600/browser+project/min. 429 + Retry-After; серверная проверка без логирования raw IP/token, тесты shared-IP и подмены visitor ID | PROPOSED; стартовый профиль, не защита от всех атак | 07, 13 |
| D08 | Пилотные RPO ≤24h, RTO ≤4h; backup ежедневно, хранить 14 дней; репетиция restore в изолированную БД до пилота; получатель alerts должен быть назначен | PROPOSED | 16, 20 |
| D09 | Raw analytics 90 дней — существующий контракт; operational logs 14 дней, audit 180 дней, job metadata 30 дней; удаление активных данных ≤7 дней по запросу, исчезновение из backup ≤14 дней; tombstone повторяется при restore | PROPOSED кроме raw analytics | 14–16 |
| D10 | Основной домен и поддомены Admin/API/CDN; hosting, PostgreSQL/backup, CDN, email provider, регион данных и тестовый почтовый ящик | OPEN: запрошены у владельца; ничего не создано и не оплачено | 07, 12, 16 |

Методики D04/D05: production dist, raw и gzip level 9; указать отдельно initial,
lazy runtime и editor. Локальный replay — 7 свежих jsdom документов (100/25 и 500/100
nodes/operations), p95 nearest-rank; UI — 5 warmup +30 samples/engine. Новая delivery
матрица: HTTPS staging, desktop 1440×960 и mobile 390×844, cold/warm cache,
фиксированные RTT 150 ms / 1.6 Mbps, 30 samples после 5 warmup; network timeout
проверяется детерминированно. Числа staging становятся подтверждёнными только после
измерений 18. Intentional geometry edits исключаются из CLS-бюджета с явным перечнем
fixture changes; нестабильность исходного host измеряется контрольным Native-прогоном.

Размер текущего editor: **276518 raw / 71977 gzip bytes**. Старый предел 100000 raw
превышен. D04 предлагает принять фактический функциональный объём с небольшим запасом;
альтернатива — оставить 100000 и сначала отдельно декомпозировать editor. Ни один
вариант пока не утверждён. Увеличение editor budget не увеличивает visitor budget;
проверка visitor never requests editor обязательна.

## 6. Правило → проверка → задача

| Правило | Наблюдаемый сценарий | Проверка / задача |
| --- | --- | --- |
| Draft/Release/Deployment независимы | Save/Publish/complete A/B не меняют ordinary URL | API + E2E: 03–05, 11 |
| Атомарная activation | Два клиента, stale revision, lost response/retry, чужой Release | PostgreSQL/concurrency/migration: 03 |
| Ровно один источник | Deployment + native A; pinned B; editor/share; invalid и ambiguous selectors; SPA переход и cleanup | Runtime unit + browser matrix: 04 |
| Правка обратима | Deploy → Disable → Rollback, host handlers и newer host styles живы | Chromium + critical Firefox/WebKit: 04–05 |
| Новый клиент изолирован | Два новых email, invitation race, ID enumeration, отозванная capability | PostgreSQL + signup E2E: 06 |
| Письмо работает | Реальная доставка, expiry/reuse, provider failure, отсутствие секретов | Unit/API + staging: 07 |
| Origin подтверждён | Верный/чужой/replayed challenge, wildcard, DNS failure, SSRF | Unit/API + onboarding E2E: 08–09 |
| Данные A/B достоверны | Consent pending/denied/granted, event test, dedup/retry, точные counters | Unit/PostgreSQL/browser: 10–11 |
| Ограничения безопасны | Boundary values, burst, 429/retry, no partial writes, no token logs | API/security: 13 |
| Удаление и восстановление | Cleanup/jobs idempotency, backup restore с tombstones | Integration + isolated staging: 14–16 |
| Размеры и задержки | Cold/warm, slow/offline, no editor on visitor, native контроль | Performance/browser: 18 |
| Клиент выполняет сценарий | Полная техническая регрессия, затем отдельный внешний пилот | 17–22 |

Тестовый договор остаётся AGREED. Новые значения D01–D10 не становятся release gates
до записи ответа владельца. SERVICE-V1-02 остаётся IN_PROGRESS. После команды владельца «продолжи» 2026-10-03
разрешено независимое локальное выполнение backend 03 по подготовленному mode/access
контракту; это исключение из первоначального полного gate 02. Новые SLA/quotas/editor
limits не утверждены автоматически. Инфраструктура 12 и внешняя эксплуатация ожидают
относящихся к ним решений. Обновления статуса и evidence — в task records.

2026-10-05: владелец поручил выполнить 06 после обсуждения email magic-link регистрации. D01 принят в этом scope. Лимит 3 запроса и переключение email-провайдеров перенесены в 07; окно, пауза, провайдеры и quotas остаются предложениями до настройки.


2026-10-05, реализация 07 по команде владельца без реального API-ключа:
email-часть D07 имеет настраиваемые defaults 3/email/час, 60s, 30/IP или actor/час;
login/invitation лимиты раздельные, provider quotas общие и persisted. Числа остальных
D07 middleware остаются PROPOSED. Adapters Resend/MailerSend подготовлены, но D10
аккаунты/квоты/staging не закрыты. Unknown/pending delivery не имеет автоматического
retry/fallback; accepted означает API acceptance. Конфигурация billing period,
headroom и эксплуатационные ограничения описаны в apps/api/README.md.


2026-10-06: технический D02 реализован в 08 — DNS TXT per Project/exact origin,
one-use expiring hash challenge, отзыв и server-side recheck при завершении lookup.
HTTP verifier отсутствует; browser diagnostics не заменяет ownership. Deployment
требует все origins verified, resolve блокирует revoked/unverified. Loopback proof
действует только при explicit non-production разрешении. Probe freshness 15min,
TTL 2min, DNS challenge 24h/cooldown5s/deadline3s — implementation defaults без SLA.
DNS propagation/availability и real staging не объявлены проверенными.

### SERVICE-V1-10 — именованная цель (2026-10-07)

По поручению выполнить этап 10 реализуется минимальный explicit-track путь:
`conversionEventName` выбирается до первого запуска и затем неизменяем.
CVR сохраняет существующую семантику: уникальные посетители с выбранной
конверсией / посетители с exposure; повторные события показаны отдельным total.
Другие именованные события не входят в выбранную цель. Старые эксперименты
с null-целью сохраняют общий исторический отчёт; migration/backfill не
восстанавливает уже удалённые raw events и не переопределяет историю.

Consent по умолчанию pending. Granted/denied/pending передаются из системы
согласия host; сброс/отзыв останавливает последующие exposure/conversion.
Короткоживущая analytics-test ссылка проверяет track и состояние consent на
исходной странице, в отдельных таблицах без assignment и production totals.
Статусы теста означают отсутствие сигнала SDK, отсутствие согласия, отсутствие
выбранного события либо его успешное поступление; они не позволяют делать
вывод о consent всех production посетителей.

Внешние gates 07/12 остаются открытыми. Общие D03–D10 этим изменением не приняты.
