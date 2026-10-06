# SERVICE-V1-09 — Мастер подключения и первый полезный результат

Status: DONE
Acceptance scope: local implementation; external acceptance remains gated by SERVICE-V1-07/12.
Priority: P0
Depends on: SERVICE-V1-08
Parallel wave: W9
Can run in parallel with: None

Stage: E3 — S6: регистрация и самостоятельное подключение
Planning date: 2026-10-02

## Goal

Провести нового клиента от входа до первой сохранённой правки.

## Problem solved

Admin показывает localhost, ключи и технические состояния, а клиент должен самостоятельно соединять установку, страницу и редактор.

## Enables

- Самостоятельную активацию клиента.
- Проверяемую точку входа в публикацию и A/B.

## Scope

- Собрать путь новый сайт → origin verification → персональная инструкция → connection check → выбор Page → editor.
- Выдать готовый snippet с project key и согласованными адресами assets; для React/Vue показать отдельную npm/build-plugin инструкцию в поддержанной матрице.
- Завершить пустые/ошибочные/loading состояния Admin, единый язык и статусы; убрать жёсткие localhost defaults в production.
- Добавить управление разрешёнными origins и ручными страницами; sitemap import реализовать с preview/dedup/allowlist и bounded fetch согласно текущему Production requirement.
- Объяснить одноразовую установку разработчиком, типы допустимых правок и связь Save/Release/Deploy; сохранять прогресс при reload.
- Использовать versioned artifact URLs из контракта 12; полный внешний проход повторить после его интеграции.

## Parallel execution

Общая Admin shell, installation UI, integration docs и fixtures изменяются одним владельцем после verifier.

Hard prerequisites: SERVICE-V1-08. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [x] Новый клиент с доступом к установке script проходит путь без доступа к терминалу сервиса.
- [x] Copy snippet/install instructions содержат корректный origin и key; диагностика предлагает конкретный следующий шаг.
- [x] Page exact pathname/query semantics сохраняются; sitemap preview не импортирует чужие origins и дубликаты.
- [x] Ограничения React/Vue, structural edits и CSP видны до неработающего действия.
- [ ] Ручной внешний desktop/mobile и keyboard проход завершается первой правкой, save и preview — после 07/12. Локальный browser-проход с keyboard действиями и визуальной проверкой screenshots: PASS.

## Checks

- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `UI`: UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения.
- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Будущий onboarding E2E через UI; static/script и existing packed React/Vue fixtures.
- `AGREED` — API sitemap cases: malformed XML, большие ответы, redirect/SSRF, duplicate paths и allowlist; skip import через ручное добавление страницы.
- `AGREED` — Ручной cold-start по инструкции в чистом browser context.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Onboarding wizard, customer Admin shell и инструкции.
- Групповой E3 report нового клиента.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/onboarding.html`

Групповой report этапа E3; выделить отдельную запись/anchor `SERVICE-V1-09`, приложить machine evidence и ограничения. Локальные проверки и артефакты добавлены 2026-10-06.

## Notes

- Sitemap не должен блокировать ручное добавление одной страницы; CMS-плагины и новые framework adapters отложены.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.

## Реализация — 2026-10-06

Мастер объединяет подтверждение адреса, персональную инструкцию, диагностику
выбранной Page и первый черновик/Release/preview. Создание сайта открывает новый
проект, а не предыдущий; адрес пустой, без localhost defaults. Шаг хранится локально
по account/project, Page и раздел — в URL; proof и правки — на сервере.

Установка использует authenticated configuration с явными SDK/runtime/editor/manifest
URL. В production без согласованного versioned выпуска snippet не выдаётся.
React/Vue инструкции описывают private tarballs, build plugin и проверенную матрицу;
публичная доставка SDK всё ещё зависит от этапа 12.

Owner/Admin добавляет и удаляет origins; удаление уничтожает старые proof/probes,
а повторное добавление не восстанавливает подтверждение. Последний адрес нельзя
удалить. Sitemap: предварительный просмотр, выбор страниц, текущий allowlist внутри
транзакции, дедупликация и ручное добавление без зависимости от импорта.
HTTPS fetch фиксирует проверенный публичный DNS-адрес, запрещает redirects/gzip/DTD
и sitemap indexes. Защитные пределы: 2 MiB, 10 000 URL, 5 секунд; это ограничения
ресурсов реализации, не принятие численных customer quotas/SLA.

Browser cold start использует реальную signup-ссылку из локального file sender,
сохраняет точный код из мастера в HTML тестового HTTP-сайта и выполняет первую
правку, Save, reload, Release и preview. API и SDK в этом сценарии не подменены.
Отдельный UI sitemap case подменяет только результат preview; transport/parser
и транзакции проверяются unit/API/PostgreSQL.

Внешние gates 07 (реальная почта) и 12 (HTTPS staging/versioned assets) остаются
открытыми. Live DNS/почта/CDN этим этапом не настраиваются. Физический ручной
пользовательский проход на внешнем сайте потребуется после этапа 12.

Local acceptance: 92/92 API/PostgreSQL + HTTP smoke, 72/72 browser (24 per engine), full workspace/E2E typecheck and snippet verification PASS. Report: [SERVICE-V1-09](../../docs/verification/reports/SERVICE-V1/onboarding.html#SERVICE-V1-09).
