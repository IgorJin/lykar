# s4-04 — React npm adapter и cooperative overrides

Status: PLANNED
Priority: P0
Depends on: s4-02, s4-03
Parallel wave: W3
Can run in parallel with: None

## Goal

Поставить первый React adapter, связывающий host lifecycle и разрешённые overrides с SDK.

## Problem solved

Одного npm import недостаточно, чтобы согласовать изменения Lykar с React render и hydration.

## Enables

- s4-05: полноценный editor workflow в React.
- s4-06: аналитика и доступ на реальных SPA переходах.
- Первое проверенное использование общего lifecycle на Vue fixture.

## Scope

- Создать `packages/react` с типизированным API из s4-01 и React peer dependency; core SDK/script не должны импортировать framework runtime.
- Связать ready/mount/unmount и route hooks с PageSession, включая отмену старого маршрута до окончания асинхронного нового render.
- До host readiness/hydration внешних DOM mutations нет; server import/provider render не требуют window/document и не создают request/browser resources.
- Регистрировать targets и разрешённые text/style/attribute overrides; host отображает их через props/store. Не заменять child component tree и не исполнять код из manifest.
- Для Lykar-owned islands использовать общий DOM replay; для nested managed nodes и неизвестного ownership применять ограничения общего контракта.
- Подключить CSR/SSR React fixtures к собранному adapter и Vue fixture — к общему API без публичного Vue package.
- Покрыть `s4-react-lifecycle.spec.ts` и первоначальные `s4-spa-critical.spec.ts` cases, проверить host handlers/state после изменений и cleanup.
- После интеграции двух ветвей W2 собрать первый групповой отчёт со структурой пакетов, public contracts и проверенными ограничениями.

## Parallel execution

W3 начинается после завершения обеих задач W2. Здесь совместно затрагиваются adapter, SDK hooks, fixture wiring, exports и lockfile, поэтому параллельная работа по следующему editor/analytics контракту не заявляется.

## Acceptance criteria

- [ ] React fixture проходит A→B→A, back/forward, async child/root readiness и отменённые переходы с ожидаемым Page/Release.
- [ ] SSR hydration не выдаёт новых warnings/mismatch, а Lykar не меняет разметку до сигнала готовности.
- [ ] Повторный render и dev remount не плодят sessions, subscriptions или вставленные nodes; после unmount ресурсы освобождены.
- [ ] Разрешённые overrides переживают render; host input state, click handlers и nested component сохраняются.
- [ ] Неподдерживаемая managed structural operation возвращает diagnostic до мутации; unmanaged island поддерживает protocol commands.
- [ ] Vue fixture проходит общий root/route lifecycle, что отражено как fixture-level support, без заявления о готовом Vue adapter.
- [ ] Ключевые lifecycle/hydration/cleanup/ownership cases проходят Chromium, Firefox и WebKit; точные версии сохранены в evidence.

## Checks

- `AGREED` — `UNIT` — Отмена устаревших операций, повторные вызовы, очистка ресурсов, ограничения команд.
- `AGREED` — `BROWSER` — A→B→A, назад/вперёд, поздняя загрузка элементов, hydration, повторный рендер и mount/unmount.
- `AGREED` — `ENGINES` — полный сценарий в Chromium, ключевые SPA-сценарии также в Firefox и WebKit.
- `AGREED` — `PERFORMANCE` — Размер пакета, ограниченные повторные применения, отсутствие накопления listeners и observers.
- `AGREED` — `PACKAGE` — Установка из собранного пакета, TypeScript, импорт на сервере, сохранение работы script-подключения.

- `AGREED` — `npm test --workspace @lykar/react` и `npm run typecheck --workspace @lykar/react` — workspace/команды создаются этой задачей.
- `AGREED` — `npm test --workspace @lykar/sdk` и `npm test --workspace @lykar/runtime` — targeted интеграционные регрессии.
- `AGREED` — `npx playwright test tests/e2e/s4-react-lifecycle.spec.ts tests/e2e/s4-spa-critical.spec.ts --project=chromium` — новые suites.
- `AGREED` — `npx playwright test tests/e2e/s4-spa-critical.spec.ts --project=firefox` и аналогично `--project=webkit` — выполнять последовательно.
- `AGREED` — G1 после первой интеграции: последовательно `npm run build`, `npm run typecheck`, `npm test`, `npm run test:e2e:http`, `npm run test:e2e:browser`; полная согласованная регрессия на интегрированном revision.

Проверка packed npm consumers целиком завершается в s4-07; здесь обязательны корректные exports, server-safe import/render и отсутствие framework dependency в core.
Новые suites/пакеты в командах выше — ожидаемые deliverables, а не уже существующие проверки. Согласованные формулировки и общий порядок: [TEST-PLAN.md](./TEST-PLAN.md).

## Expected deliverables

- React adapter, hooks/provider/registration API согласно контракту.
- Интегрированные React/Vue fixtures и browser cases.
- Групповой `s4-spa-integration.html` с результатами s4-01…04.

## Evidence and report

Report: `docs/verification/reports/s4/s4-spa-integration.html`

В отчёте отделить unit/jsdom, реальные browser results и ещё не пройденные editor/analytics/packaging gates; приложить exact versions и machine output.
Будущий отчёт создаётся при реализации; текущий статус задачи — PLANNED.

## Notes

Требования: INT-06/07/09/10, QLT-04. Next.js App Router, Server Components, streaming SSR и специфичные router integrations остаются отдельным будущим срезом. Обычная React SSR/hydration fixture обязательна сейчас.
