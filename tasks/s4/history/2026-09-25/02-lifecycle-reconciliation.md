# s4-02 — Общий lifecycle и ограниченное повторное применение

Status: PLANNED
Priority: P0
Depends on: s4-01
Parallel wave: W2
Can run in parallel with: s4-03

## Goal

Подключить route/root lifecycle и ограниченное reconciliation к существующим PageSession, journal и replay ledger.

## Problem solved

Поздние ответы и повторный render могут применить старую версию к новой странице, продублировать узлы или запустить бесконечное повторное применение.

## Enables

- s4-04: подключение React hooks к готовому lifecycle.
- s4-05: безопасное восстановление editor targets.
- s4-06: независимость visit identity от технического replay.

## Scope

- В `packages/sdk` и `packages/runtime` реализовать согласованный navigation lifecycle: немедленная invalidation при смене маршрута, ожидание committed root, generation checks перед mutation/report/event.
- Сохранять route visit при render/refresh того же посещения; техническое поколение и node identity могут меняться независимо.
- Observer ограничить зарегистрированным root, исключить editor и собственные mutations, объединять события и ограничивать количество/время retries. Поздний или неоднозначный target получает диагностируемый результат.
- Сверять actual node identity и desired value после render; не форсировать всю цепочку. Новые nodes не дублировать, зависимые операции не применять после отказа их prerequisite.
- Применять ownership policy и для старых manifests при запуске в managed root; отсутствие новых metadata не даёт разрешения на произвольную структурную мутацию.
- Cleanup снимает собственные listeners/observers/timers/overrides; journal восстанавливает значения только когда они всё ещё принадлежат Lykar.
- Обеспечить ограниченное ожидание при unavailable API/late mount и сохранение native host UI после отказа.

## Parallel execution

Можно параллельно с s4-03 после s4-01: эта задача владеет SDK/runtime и их tests, s4-03 — fixture/harness/config/lockfile. Здесь не менять root scripts, lockfile, fixture contract или общие отчёты. Сборки и browser suites в одном checkout запускать последовательно, поскольку npm pretest очищает общий dist.

## Acceptance criteria

- [ ] Поздний ответ A после начала A→B не мутирует A/B, не публикует отчёт или событие в B; transport без поддержки abort тоже безопасен.
- [ ] Повторные start/refresh/destroy соответствуют контракту и не создают дубликаты работы.
- [ ] После destroy нет активных ресурсов Lykar; последующий mount создаёт один рабочий контекст.
- [ ] Re-render сохранившегося узла и замена узла новым экземпляром не дублируют insert/move и правильно восстанавливают разрешённые изменения.
- [ ] По достижении заданного retry/time limit попытки прекращаются с diagnostic; фоновые изменения вне root не запускают replay.
- [ ] Сторонние изменения host не затираются при компенсации; вложенные managed roots сохраняют свою границу владения.
- [ ] Существующие static PageSession/replay cases проходят; для W2 результат подтверждён unit и существующим browser fixture, React-specific cases проходят после s4-04.

## Checks

- `AGREED` — `UNIT` — Отмена устаревших операций, повторные вызовы, очистка ресурсов, ограничения команд.
- `AGREED` — `BROWSER` — A→B→A, назад/вперёд, поздняя загрузка элементов, hydration, повторный рендер и mount/unmount.
- `AGREED` — `PERFORMANCE` — Размер пакета, ограниченные повторные применения, отсутствие накопления listeners и observers.

- `AGREED` — `npm test --workspace @lykar/sdk` и `npm test --workspace @lykar/runtime` — существующие команды, выполнять последовательно из-за общих build outputs.
- `AGREED` — `npx playwright test tests/e2e/page-session-lifecycle.spec.ts tests/e2e/replay-safety.spec.ts --project=chromium` — существующий статический стенд, отдельный запуск после сборки.
- `AGREED` — Новые React/reconciliation browser cases — групповой check s4-04, когда завершены обе ветви W2.

Накопление ресурсов проверяется счётчиками активных подписок/таймеров/observers и DOM результатом до и после серии циклов; один heap snapshot не заменяет эту проверку.
Новые suites/пакеты в командах выше — ожидаемые deliverables, а не уже существующие проверки. Согласованные формулировки и общий порядок: [TEST-PLAN.md](./TEST-PLAN.md).

## Expected deliverables

- Реализация route lifecycle и bounded reconciliation в SDK/runtime.
- Targeted unit tests и расширение существующих lifecycle regressions.
- Диагностика прекращения retries и освобождения ресурсов.

## Evidence and report

Report: `docs/verification/reports/s4/s4-spa-integration.html`

Машинные результаты хранить в собственном task output; общий HTML в W2 не редактировать, s4-04 объединяет evidence.
Будущий отчёт создаётся при реализации; текущий статус задачи — PLANNED.

## Notes

Требования: INT-06, COR-03/07, QLT-05/06. Численные параметры retry выбираются по контракту s4-01 и тестируются на границе; новый browser p95 budget не становится согласованным от записи числа в коде.
