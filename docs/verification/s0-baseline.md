# S0 baseline — S0-01…S0-08

> Исторический журнал последовательного выполнения задач. Актуальная ревизия
> с исправлениями и финальными числами находится в
> [s0-review.html](./reports/s0-review.html); её результаты имеют приоритет над
> промежуточными числами ниже.

Дата проверки: 2026-09-20 (Europe/Moscow)

Статус задач S0-01…S0-08: **выполнены**.

## Что зафиксировано

- Репозиторий: `/Users/igorjan/Documents/LYKAR/repositories/lykar/lykar`
- Ветка: `codex/analytics`
- Базовый commit: `1aa184838ee233d5d796513ba51334e7f02caf79`
- Рабочее дерево на момент проверки было изменено относительно этого commit.
  Изменения пользователя сохранены; S0-01 не создаёт commit и не переписывает
  историю.
- Полный source manifest hash: `3cf9f98759212ccaaec0c2580c8341d33b92ff24d11e398f49bab5c5e00af941`

Source manifest hash получен командой:

```sh
git ls-files -co --exclude-standard -z \
  | grep -z -v '^docs/verification/s0-baseline.md$' \
  | xargs -0 shasum -a 256 \
  | shasum -a 256
```

В manifest входят tracked и незакоммиченные неигнорируемые файлы текущего
snapshot. Из него исключены `.git`, `node_modules`, `dist`, `.lykar`, `coverage`
и этот отчёт, чтобы хэш не зависел от собственного содержимого отчёта.

## Версии инструментов

```text
Node.js  v22.23.1
npm      10.9.8
initdb   PostgreSQL 15.18 (Homebrew)
pg_ctl   PostgreSQL 15.18 (Homebrew)
psql     PostgreSQL 15.18 (Homebrew)
createdb PostgreSQL 15.18 (Homebrew)
```

В корне присутствуют `package.json` и `package-lock.json`. Хэш lockfile до и
после чистой установки:

```text
7376011b5a9469bb8f26898e39fe565e0c517632040a6ca1839e7880218e084b
```

## Чистая установка

Исходники скопированы во временную директорию без `.git`, `node_modules`,
`dist`, `.lykar` и `coverage`:

```text
/private/tmp/lykar-s0-01.UZeaiW
```

В этой копии выполнено:

```sh
npm ci
```

Результат: **успешно**, установлено 373 пакета, lockfile не изменился. npm
показал предупреждения о deprecated-зависимостях `inflight`, `stable`,
`rimraf@2` и `glob@7`; они не остановили установку и вынесены в будущую задачу
об обновлении зависимостей, если baseline потребует этого.

Проверка чистоты копии до установки подтвердила отсутствие `node_modules`,
`dist` и `.lykar`. После `npm ci` зависимости появились только внутри временной
копии.

Локальные PostgreSQL CLI проверены в этом запуске. Playwright и Chromium в
S0-01 не устанавливались: их версия, установка, изоляция контекстов и артефакты
закреплены отдельной задачей S0-04 в [TASKS.md](../../TASKS.md).

## Границы результата

S0-01 подтверждает воспроизводимость установки из текущего lockfile и наличие
локальных PostgreSQL CLI. Browser E2E относится к следующим задачам из
[TASKS.md](../../TASKS.md).

## S0-02 — baseline всех workspaces

Команды выполнены последовательно в той же чистой копии snapshot:

```sh
npm run build
npm run typecheck
npm test
```

Все три команды завершились с кодом `0`.

| Workspace | build | typecheck | test |
| --- | --- | --- | --- |
| `@lykar/admin` | PASS | PASS | NO SCRIPT |
| `lykar-lib-server` | PASS | PASS | 18 PASS, 3 SKIP |
| `@lykar/playground` | PASS | PASS | NO SCRIPT |
| `@lykar/editor-bridge` | PASS | PASS | 11 PASS |
| `lykar-lib` | PASS | PASS | 3 PASS |
| `@lykar/protocol` | PASS | PASS | 7 PASS |
| `@lykar/runtime` | PASS | PASS | 16 PASS |
| `@lykar/editor-ui` | NO SCRIPT | NO SCRIPT | NO SCRIPT |
| `@lykar/sdk` | NO SCRIPT | NO SCRIPT | NO SCRIPT |

Итого выполнено 55 тестов, ошибок нет. Три API integration-теста пропущены по
явному условию `LYKAR_TEST_DATABASE_URL is not configured`; они направлены в
S0-03, где тестовый PostgreSQL поднимается отдельно. `--if-present` не считает
отсутствующие scripts успехом: они перечислены в таблице как `NO SCRIPT`.

HTML-отчёты этапов: [S0-01](./reports/s0-01.html) и
[S0-02](./reports/s0-02.html).

## S0-03 — локальный стек, PostgreSQL и HTTP smoke

`npm run test:e2e` запущен с автоматически выбранными портами и временным
PostgreSQL cluster. Все 21 API-тест, включая три PostgreSQL integration-теста,
прошли без skip. HTTP smoke прошёл сценарий dev login, editor capability,
операцию, Release, version access, A/B links, analytics и share exchange.

Обычный `npm run dev:e2e` дважды поднят на одинаковых тестовых портах. Проверены
`/admin`, `/admin/`, `app.js`, `styles.css`, `/`, `/pricing`, runtime и editor
bundles. Повторный seed сохранил 2 drafts, 1 release и 1 operation; legacy
фиксированная session отсутствует.

В ходе проверки исправлены lifecycle-дефекты: процесс больше не считает чужой
ранее запущенный PostgreSQL своим, а занятые API/playground порты проверяются до
сборки и запуска дочерних процессов. Негативный тест сохранил внешний listener,
а завершение дочернего API и Ctrl+C освободили API, playground и PostgreSQL.

Полный HTML-отчёт: [S0-03](./reports/s0-03.html).

## S0-04 — инфраструктура browser E2E

В корневом lockfile закреплён `@playwright/test` 1.63.0. Используется скачанный
Playwright Chromium 153.0.8010.12 (revision 1243) через `channel: chromium`.
Команда `npm run test:e2e:browser` самостоятельно создаёт временный PostgreSQL,
собирает приложения, применяет миграции, seed и запускает API, playground и
отдельный API без dev auth для magic-link сценария.

Playwright работает одним worker без retries. Владелец и посетитель получают
отдельные browser contexts. При падении сохраняются screenshot, trace, video и
HTML report в игнорируемых Git каталогах; успешный и неуспешный запуск завершают
стенд и удаляют временный cluster. Первый infrastructure test прошёл в Chromium.

Команды разделены: `test:e2e:http` — явное имя HTTP smoke,
`test:e2e:browser` — браузер, `test:e2e` сохранён совместимым HTTP alias.

Полный HTML-отчёт: [S0-04](./reports/s0-04.html).

## S0-05 — вход и открытие редактора

Три Playwright-сценария прошли в реальном Chromium за 11.2 s. Dev login создал
обычную HttpOnly session, dashboard пережил reload, а клик Admin открыл popup с
видимой панелью редактора в Shadow DOM. Второй API подтвердил отсутствие быстрой
кнопки, вход через одноразовый magic link и HTTP 401 при повторном использовании.

В чистом playground исправлено начальное состояние без editor capability:
ссылка с адресом Admin теперь показывается сразу, открывает рабочий `/admin/`, а
обе формы `/admin` и `/admin/` подтверждены браузером. Page errors и failed
requests собираются тестом и приводят к его падению.

Полный HTML-отчёт: [S0-05](./reports/s0-05.html).

## S0-06 — edit, save, reload, Release и share

Реальный browser flow дважды прошёл на двух независимых временных PostgreSQL
clusters (11.7 s и 11.6 s). Пользователь выбрал `hero-title`, изменил текст,
увидел preview и сохранил одну операцию в revision 1. Reload той же вкладки и
повторное открытие Draft из Admin восстановили текст из backend.

Для этого editor capability сохраняется только в `sessionStorage` текущей
вкладки, а scoped GET `/api/editor/drafts/:draftId` загружает revision и операции
после reload или нового launch. Bearer token проверяется тем же page/draft scope,
что и запись. Истёкшие capability автоматически удаляются.

Admin создал immutable Version 1 и share URL. В отдельном чистом context share
показал изменённый текст без панели; в другом чистом context обычный `/` сохранил
исходный текст, а `/pricing` — свой заголовок.

Полный HTML-отчёт: [S0-06](./reports/s0-06.html).

## S0-07 — реестр дефектов и полный regression

На финальном коде повторены `npm run build`, `npm run typecheck`, `npm test`,
`npm run test:e2e:http` и `npm run test:e2e:browser`. Все команды завершились
с кодом `0`: 57 unit/component тестов прошли, 3 PostgreSQL теста ожидаемо
пропущены без test URL; в изолированной БД те же API suites дали 21/21 без skip,
HTTP smoke прошёл, а Chromium workflow дал 5/5 за 11.9 s.

| ID | Воспроизведение и влияние | Причина и исправление | Regression case | Статус |
| --- | --- | --- | --- | --- |
| `S0-BUG-001` | Повторный стенд с existing managed PostgreSQL на другом порту подключался неверно и мог остановить не свой процесс. Блокировал start/restart. | Владение присваивается только процессу, который действительно запустил cluster; running cluster проверяется на запрошенном порту. | Два запуска, mismatch порта, остановка и сохранение внешнего listener. | Закрыт |
| `S0-BUG-002` | Занятый API-порт мог выглядеть готовым из-за ответа чужого HTTP server, затем child process завершался. | API, playground и magic API проходят bind preflight до build и запуска children. | Занятый порт даёт exit 1; внешний listener остаётся жив; свободные порты освобождаются после Ctrl+C. | Закрыт |
| `S0-BUG-003` | Импорт `seed.mjs` через `node -e` падал на отсутствующем `process.argv[1]`. Мешал автоматической проверке idempotency. | Direct-run guard проверяет наличие аргумента до `pathToFileURL`. | Двойной seed сохраняет 2 drafts, 1 release и 1 operation; import и typecheck проходят. | Закрыт |
| `S0-BUG-004` | Страница без editor capability сначала показывала служебный runtime JSON; кнопка Admin появлялась только после restart. | Native/runtime ветка `boot()` сразу вызывает единый renderer состояния без capability. | Playwright открывает чистый playground, видит кликабельный адрес и рабочие `/admin` и `/admin/`. | Закрыт |
| `S0-BUG-005` | Reload терял bearer capability; новый launch не воспроизводил сохранённые операции. Блокировал обязательный edit → save → reload. | Capability хранится в sessionStorage с origin/path/expiry validation; защищённый GET Draft загружает backend revision/operations; bridge применяет их как committed до local pending. | 13 editor-bridge unit tests и полный browser flow: same-tab reload, новый popup, release и clean share context. | Закрыт |
| `S0-BUG-006` | Первичная browser-проверка считала пустой custom-element host невидимым, хотя panel в открытом Shadow DOM был видим. Ошибка test oracle. | Проверка нацелена на доступный заголовок и controls внутри Shadow DOM. | Infrastructure Playwright test падает на реальной невидимости и проходит на видимой панели. | Закрыт |
| `S0-BUG-007` | Исторически `/admin` без slash не обслуживал SPA. | API явно обслуживает `/admin`, `/admin/`, assets и fallback. | HTTP и Chromium проверяют обе формы адреса. | Закрыт |
| `S0-BUG-008` | Исторически async editor launch попадал под popup blocker. | `about:blank` открывается синхронно внутри click, URL подставляется после API response; при ошибке окно закрывается. | Реальный Admin click ловит popup и видимую panel editor. | Закрыт |

Открытых блокеров S0 нет. Отсутствующие scripts у `editor-ui`/`sdk`, широкая
browser matrix, полноценный SDK/distribution и SPA lifecycle остаются в задачах
S1/S2/S4 из [TASKS.md](../../TASKS.md); они не входят в static Chromium scope S0.

Полный HTML-отчёт: [S0-07](./reports/s0-07.html).

## S0-08 — финальная приёмка

Финальный проверяемый snapshot использует базовый commit
`1aa184838ee233d5d796513ba51334e7f02caf79` и незакоммиченные изменения ветки
`codex/analytics`. Hash исходников без generated verification reports:

```text
3a87046b8f8cd48566e49921da466f6d295e4e42b9d7e09ce9ccc1061fea3d9b
```

Он рассчитан тем же source-manifest способом, но с исключением всего
`docs/verification/`, чтобы HTML-отчёт не менял собственный идентификатор.
Текущий `package-lock.json` имеет SHA-256
`b12bdb1f61957221f6e8f817b12b8921fd7e237ba6eda8d5415109bc3b970297`.

Среда финального прогона: macOS, Node.js 22.23.1, npm 10.9.8, PostgreSQL CLI
15.18, `@playwright/test` 1.63.0 и Playwright Chromium 153.0.8010.12 revision
1243. Все итоговые команды дали exit code `0`.

### Ручной проход

Обычный `npm run dev:e2e` поднят 2026-09-21 на API 3010, playground 4183 и
PostgreSQL 55442, потому что preflight обнаружил занятый стандартный порт 3000.
В обычном Google Chrome вручную выполнены выход и повторный локальный вход,
создание Draft, выбор H1, ввод `S0 проверено полностью 2026-09-21`, preview, Apply
до revision 1 и reload. После reload заголовок и сохранённая команда
восстановились. В Admin создан immutable Version 3 и share; отдельная вкладка
посетителя показала изменённый H1, runtime report `version: 3`, `errors: 0` и не
показала editor panel. `Ctrl+C` завершил процессы с exit code 0.

Автоматический браузер: Chromium 153.0.8010.12 (revision 1243). Ручной проход
выполнен в Google Chrome 153.0.8010.48; версия получена локальной командой
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version`.

### Итоговые доказательства

| Проверка | Результат |
| --- | --- |
| Чистая установка финального lockfile | `npm ci`, 376 packages, exit 0; lockfile неизменен |
| Build / typecheck | PASS / PASS, exit 0 |
| Unit/component/lifecycle | 69 PASS, 3 ожидаемых DB SKIP без test URL |
| PostgreSQL integration + HTTP | 21/21 PASS, 0 SKIP; smoke PASS |
| Browser automation | 6/6 PASS, Chromium 153.0.8010.12 |
| Ручной workflow | обычный Chrome: login → edit → save → reload → Release → share PASS |
| Lifecycle | port preflight, restart, Ctrl+C и cleanup PASS |
| Открытые блокеры | 0 |

В актуальной чистой копии `npm ci --offline` установил 376 packages, а
`npm audit --offline` сообщил 0 vulnerabilities. Более ранние числа и audit
предупреждения в промежуточных секциях сохранены как исторический журнал; для
текущего состояния используйте [s0-review.html](./reports/s0-review.html).

HTML-отчёты по каждой последовательной задаче: [S0-01](./reports/s0-01.html),
[S0-02](./reports/s0-02.html), [S0-03](./reports/s0-03.html),
[S0-04](./reports/s0-04.html), [S0-05](./reports/s0-05.html),
[S0-06](./reports/s0-06.html), [S0-07](./reports/s0-07.html) и
[S0-08](./reports/s0-08.html).

S0 закрыт. Следующая задача — S1-01: публичный SDK bootstrap, contracts и
compatibility bridge; затем S1-02 закрепляет Rollup artifacts, npm consumer
fixtures и performance budgets.
