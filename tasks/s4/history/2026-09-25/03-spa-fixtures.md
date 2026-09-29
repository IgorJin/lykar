# s4-03 — React/Vue fixtures и изолированный SPA-стенд

Status: PLANNED
Priority: P1
Depends on: s4-01
Parallel wave: W2
Can run in parallel with: s4-02

## Goal

Создать воспроизводимые React и Vue test fixtures и расширить существующий Playwright/PostgreSQL стенд для S4.

## Problem solved

Статическая HTML-страница и ручной вызов navigate не доказывают поведение настоящего framework при hydration, re-render и unmount.

## Enables

- s4-04: browser integration с настоящим React и проверка общего API на Vue.
- s4-05/s4-06: независимые страницы и пользователи для editor/access/analytics.
- s4-08: одинаково воспроизводимая приёмка в трёх browser engines.

## Scope

- В `tests/fixtures/spa` подготовить React CSR и SSR/hydration страницы A/B с pathname navigation, back/forward, поздним child mount, повторным render и dev remount.
- Добавить Vue fixture для общего lifecycle/root contract; полнофункциональный публичный Vue adapter не создавать.
- В fixtures включить управляемый текст/стили/атрибуты, unmanaged island, вложенный managed component, кнопку с handler и поле с состоянием для наблюдаемой проверки сохранности host.
- Подключить loopback serving/SSR к существующему `scripts/e2e-stack.mjs` и тестовому lifecycle, с уникальными `/__e2e__/s4-*` Page paths и изолированными origin/ports.
- Сохранять временную PostgreSQL, отдельные owner/visitor contexts, уникальные IDs и cleanup после прерванного запуска; permanent developer database для acceptance не использовать.
- В `playwright.config.ts` добавить `s4-spa-critical.spec.ts` в Firefox/WebKit selection, сохранив существующие style suites; Chromium исполняет все S4 suites.
- Добавить fixture baseline test и readiness diagnostics; выводить фактические версии React/Vue, Node, Playwright и browser engines. Браузерные ошибки и hydration warnings должны быть видимыми отказами.
- Эта задача владеет изменениями dev dependencies/root lockfile в W2. Host fixture собирается до готовности адаптера; его подключение и проверка Lykar выполняются в s4-04.

## Parallel execution

Можно параллельно с s4-02 только после фиксации s4-01. Здесь не менять SDK/runtime types и tests ядра. Root package/lockfile, Playwright config и e2e harness принадлежат этой задаче; общий dist и регрессионные запуски в одном checkout сериализуются.

## Acceptance criteria

- [ ] Страницы A/B открываются напрямую и через History API; reload SSR URL отдаёт настоящую server-rendered разметку.
- [ ] Без Lykar проходят mount/hydration/render/unmount сценарии, сохраняются handler, состояние поля и nested component.
- [ ] Есть deterministic controls для задержки mount, переключения root и сетевого ответа; тесты не зависят от фиксированных sleeps.
- [ ] Запуск сам выбирает свободные порты, изолирует PostgreSQL и останавливает свои процессы при успехе и ошибке.
- [ ] Chromium обнаруживает все новые suites, Firefox/WebKit — ключевой SPA suite и прежние style suites; ноль найденных S4 tests считается ошибкой.
- [ ] Установка fixture dependencies воспроизводима из root lockfile; fixture contract совпадает с s4-01 и не требует незавершённой реализации s4-02.
- [ ] Есть инструкция `dev:e2e` для ручной desktop/mobile приёмки; baseline fixture не объявлен доказательством готовности адаптера.

## Checks

- `AGREED` — `BROWSER` — A→B→A, назад/вперёд, поздняя загрузка элементов, hydration, повторный рендер и mount/unmount.
- `AGREED` — `ENGINES` — полный сценарий в Chromium, ключевые SPA-сценарии также в Firefox и WebKit.
- `AGREED` — `MANUAL` — ручная приёмка редактора на desktop и mobile viewport.

- `AGREED` — `npx playwright test tests/e2e/s4-fixture-baseline.spec.ts --project=chromium` — новый файл создаётся этой задачей.
- `AGREED` — `npx playwright test --list` — подтвердить discovery новых suites и сохранение существующих projects.
- `AGREED` — `npm run typecheck:e2e` — существующая команда.
- `AGREED` — `npm run dev:e2e` — существующая команда с новыми fixture URLs; проверить native baseline в browser.

Настоящие React/Vue runtimes обязательны; jsdom/fake framework lifecycle не считаются browser evidence. Полная интеграция ключевого suite дополняется в s4-04/05/06.
Новые suites/пакеты в командах выше — ожидаемые deliverables, а не уже существующие проверки. Согласованные формулировки и общий порядок: [TEST-PLAN.md](./TEST-PLAN.md).

## Expected deliverables

- React CSR/SSR и Vue fixtures, typed fixture controls и описание.
- S4 serving/seed/readiness/cleanup в существующем harness.
- Browser selection и baseline suite с доказанной установкой точных версий.

## Evidence and report

Report: `docs/verification/reports/s4/s4-spa-integration.html`

Собственные fixture logs/traces; итоговый групповой HTML составляет s4-04 после W2.
Будущий отчёт создаётся при реализации; текущий статус задачи — PLANNED.

## Notes

Требования: QLT-02/04/06. Использовать установленный build tooling проекта; новый application framework и Next.js не нужны. Публикация или production hosting не входят в эту задачу.
