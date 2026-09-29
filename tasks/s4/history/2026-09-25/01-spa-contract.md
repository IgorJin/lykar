# s4-01 — Контракт SPA-интеграции и границы поддержки

Status: PLANNED
Priority: P0
Depends on: None
Parallel wave: W1
Can run in parallel with: None

## Goal

Зафиксировать общий контракт маршрута, владения DOM и cooperative overrides, по которому независимо реализуются ядро и fixtures.

## Problem solved

Без явного контракта повторный рендер может считаться новым посещением, а DOM executor — менять узлы, которыми управляет framework.

## Enables

- s4-02: реализация общего lifecycle без привязки к React.
- s4-03: создание fixtures по стабильному интерфейсу.
- Проверяемая матрица root × operation × framework/browser.

## Scope

- Сопоставить существующие `PageSession`, TargetRegistry, journal и SDK API; переиспользовать S2, сохраняя static/SSR entry points.
- Зафиксировать переходы route begin → committed root ready → resolve/replay, ожидание hydration, отмену незавершённого перехода и cleanup. Старое поколение перестаёт мутировать DOM сразу при начале смены страницы.
- Разделить идентичность посещения маршрута и generation выполнения: render/refresh/remount того же посещения не создаёт exposure; подтверждённый переход, включая back/forward, создаёт новое посещение.
- Определить регистрацию root/target, unregister, стабильные logical IDs, ownership и разрешённые overrides. Root может содержать вложенное framework-owned поддерево: владение не наследуется слепо от внешнего root.
- Зафиксировать default-deny для managed tree, безопасный subset text/style/attributes через props/store и diagnostic `UNSUPPORTED_HOST_MUTATION`. `setText` не заменяет дочернее дерево компонентов.
- Определить page-bound access при A→B→A: capability A не разрешает B; отсутствие доступа оставляет B native. Не расширять права и не переносить pending Draft между страницами.
- Зафиксировать размещение `packages/react` (`@lykar/react`), `tests/fixtures/spa`, именование S4 browser suites и контракт управления fixture. Выбрать одну точную версию React и одну Vue для реализации; диапазон peer dependencies не объявлять доказанной матрицей.
- Фиксировать pathname-based routing и host callback API; Next.js, отдельный router adapter, hash routing и route patterns не входят в S4.

## Parallel execution

W1 выполняется отдельно и фиксирует общие интерфейсы. Любое изменение этого контракта в W2 требует остановить зависимую интеграцию и согласованно обновить обе ветви; создавать ложную параллельность нельзя.

## Acceptance criteria

- [ ] Есть таблица состояний navigation/render/hydration/destroy с результатом для отменённого и завершённого перехода.
- [ ] Для каждой команды protocol v1 указаны ownership mode, способ применения и причина отказа; copy описан через `insertNode`.
- [ ] Unit-проверки контракта различают незарегистрированный target, неподдерживаемую операцию, конфликт регистрации, root другого document и вложенную границу владения.
- [ ] Контракт сохранения props/store ограничивает имена и значения; исполняемые callbacks остаются в host, сериализуются только существующие безопасные операции.
- [ ] Определены visit identity, root identity и generation, поведение repeated start/destroy и сохранение consent в пределах SDK instance.
- [ ] Зафиксированы точные framework versions для fixtures, предполагаемые exports, имена команд и единственный владелец lockfile в W2.
- [ ] Интерфейс fixtures и события navigation/hydration опубликованы до запуска s4-02 и s4-03; неопределённость не переносится на параллельную реализацию.

## Checks

- `AGREED` — `UNIT` — Отмена устаревших операций, повторные вызовы, очистка ресурсов, ограничения команд.
- `AGREED` — `API` — Изоляция страниц и прав доступа; аналитика учитывает посещения без дублей от re-render.

- `AGREED` — `npm test --workspace @lykar/sdk` — существующая команда; добавить проверки нового контракта.
- `AGREED` — `npm run typecheck --workspace @lykar/sdk` — совместимость типов существующих consumers.
- `AGREED` — `npm test --workspace @lykar/runtime` — затронутые ownership/operation boundaries; без расширения до общего регрессионного прогона.

Матрица ниже является контрактом для реализации. Browser-доказательства и итоговая поддержка версий появляются в s4-04/s4-08.
Новые suites/пакеты в командах выше — ожидаемые deliverables, а не уже существующие проверки. Согласованные формулировки и общий порядок: [TEST-PLAN.md](./TEST-PLAN.md).

## Expected deliverables

- Типы/валидация общего SPA-контракта и unit cases.
- Обновлённые техническое описание, SDK compatibility matrix и fixture contract.
- Запись выбранных версий и рабочих параметров bounded reconciliation с обоснованием.

## Evidence and report

Report: `docs/verification/reports/s4/s4-spa-integration.html`

Индивидуальные машинные результаты и запись в task notes; групповой отчёт собирает s4-04 после W3.
Будущий отчёт создаётся при реализации; текущий статус задачи — PLANNED.

## Notes

Требования: INT-05/06/07/09/10, ANA-05; SPEC §16.2. Выбор точных названий exports и версий — инженерное решение этой задачи, без расширения согласованного объёма. Новая схема операций или миграция БД заранее не предполагается.
