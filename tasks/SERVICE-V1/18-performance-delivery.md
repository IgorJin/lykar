# SERVICE-V1-18 — Бюджеты производительности и поведение доставки

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-17
Parallel wave: W17
Can run in parallel with: None

Stage: E6 — Приёмка кандидата в выпуск
Planning date: 2026-10-02

## Goal

Проверить влияние SDK/редактора и production delivery на реальный браузер.

## Problem solved

JSDOM CPU и размер начального SDK не измеряют полную загрузку, layout, cache и поведение при медленной сети.

## Enables

- Обоснованный release gate по производительности.
- Честные ограничения latency/flicker для клиента.

## Scope

- Сохранить начальные budgets SDK 80 000 raw/25 000 gzip и legacy replay p 95 250 ms с исходной методикой; editor budget разрешить по решению 02.
- Измерить весь выбранный путь: initial SDK + runtime + manifest + API + lazy editor, cold/warm cache и network settings.
- Добавить реальные browser observations layout/first frame/deadline/resource cleanup на static/React/Vue; новые численные пределы только после решения 02.
- Проверить принятую задержку Deploy/Disable/cache и поведение открытых вкладок; timeout не оставляет hide overlay.
- Исправить performance regressions без расширения support scope; повторить затронутые проверки 17.
- Добавить отдельный output для SERVICE-V1: текущие measure scripts пишут в S1/S4 paths, их нельзя использовать поверх исторического evidence без доработки.

## Parallel execution

Последовательно после 17: runtime/SDK bundles, generated outputs, profiling и стенд требуют единого владельца.

Hard prerequisites: SERVICE-V1-17. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] Исходные и новые принятые budgets имеют методику, среду и измеренный PASS/FAIL.
- [ ] Editor-size exception не спрятан; превышение принятого budget блокирует gate.
- [ ] Не заявляется отсутствие первого native frame при поздней загрузке; измерения CPU не выдаются за браузерную latency.
- [ ] Длительная серия route/render/destroy не накапливает observers/listeners/owned styles; malformed/large manifests ограничены.
- [ ] Смена deployment соответствует принятому cache contract; новые artifacts записаны отдельно.

## Checks

- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `COMMANDS`: Используем существующие npm run build/typecheck/test, test:e2e:http, test:e2e:browser, Playwright и временную PostgreSQL; новые команды отмечаем как будущие.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Будущие SERVICE-V1 measurement commands на основе verify:performance/measure-s4 с отдельным output; существующие packed consumer checks.
- `AGREED` — Browser performance cases с сохранёнными параметрами сети/viewport/версий; repeated lifecycle resource counters.

- `PROPOSED` — Любые новые absolute p 95/layout/heap/CDN/RPO числа остаются PROPOSED до явного решения 02; после него локальный бюджетный реестр фиксирует владельца, дату и значение.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Browser/size/cache measurements и budgets report.
- Безопасные measurement outputs и remediation подтверждённых regressions.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/release-acceptance.html`

Групповой report этапа E6; выделить отдельную запись/anchor `SERVICE-V1-18`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Исторический editor limit 100 000 raw уже превышен в принятом S2/S4; это исходный открытый вопрос, а не автоматически принятый новый порог.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
