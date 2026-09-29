# s4-07 — Пакеты, матрица совместимости и измерения

Status: PLANNED
Priority: P1
Depends on: s4-06
Parallel wave: W6
Can run in parallel with: None

## Goal

Проверить установку готовых npm artifacts, сохранить script delivery и измерить стоимость SPA-интеграции.

## Problem solved

Успех workspace imports не доказывает пригодность опубликованного package artifact или отсутствие регрессии размера и ресурсов.

## Enables

- Воспроизводимая установка SDK/React adapter обычным consumer.
- Проверенная support matrix и эксплуатационные ограничения.
- s4-08: финальная приёмка на фиксированном artifact set.

## Scope

- Расширить `scripts/sdk-consumer-fixture.mjs`/`verify-sdk-consumer.mjs` для локально упакованных SDK и React adapter; consumer не использует workspace source aliases.
- Проверить ESM, TypeScript declarations, server import и React server render в процессе без window/document; затем browser hydration из этого же artifact set.
- Подтвердить React как peer dependency adapter, отсутствие React/Vue в core SDK/script и отсутствие editor bundle у обычного visitor.
- Сохранить script/npm manifests, asset hashes/version boundaries и существующие static consumer flows.
- Расширить performance evidence на adapter size, время browser replay/reconciliation и ресурсы после серии mount/navigation/destroy.
- Переиспользовать измерители S1/S2, но сохранить новые результаты под s4: текущий `measure-performance.mjs` пишет `s1-performance.json`, поэтому добавить выбор output перед S4 измерением.
- Разделить существующие jsdom/size budgets и новые browser measurements. Численный browser p95/heap threshold не объявлять согласованным без отдельного решения.
- Обновить install/cold-start/SSR инструкции и matrix точных framework/browser versions × ownership × commands, со ссылками на реальные passed cases и явно deferred Next.js/Vue adapter.

## Parallel execution

W6 следует за готовыми editor/analytics contracts. Общие bundle outputs, lockfile, consumer scripts и performance fixtures создают coupling с предыдущими задачами; измерения на промежуточном artifact set не считаются финальной приёмкой.

## Acceptance criteria

- [ ] Изолированный consumer устанавливает локальные tarballs, компилирует TS, импортирует SDK/adapter на сервере и проходит browser hydration.
- [ ] Один комплект artifacts проходит script/static и npm/React сценарии; asset compatibility checks остаются действующими.
- [ ] Обычный visitor не скачивает editor/framework adapter без необходимости; core bundle не содержит framework runtime.
- [ ] Приведены raw/gzip adapter/core sizes и browser measurements с окружением, fixture revision и повторяемой методикой.
- [ ] После согласованной серии циклов не накапливаются активные listeners/observers/timers/Lykar nodes; bounded retry завершается при установленном лимите.
- [ ] Существующие performance baselines не перезаписаны; выявленные failures старых budget scripts описаны с причиной, а новые лимиты не подменяют соглашение.
- [ ] Compatibility matrix отмечает только реально пройденные комбинации; Next.js и полноценный Vue adapter не заявлены поддержанными.

## Checks

- `AGREED` — `PACKAGE` — Установка из собранного пакета, TypeScript, импорт на сервере, сохранение работы script-подключения.
- `AGREED` — `PERFORMANCE` — Размер пакета, ограниченные повторные применения, отсутствие накопления listeners и observers.
- `AGREED` — `ENGINES` — полный сценарий в Chromium, ключевые SPA-сценарии также в Firefox и WebKit.

- `AGREED` — `npm run verify:consumer --workspace @lykar/sdk` — существующая команда, расширяется для packed adapter и SSR/TS consumers.
- `AGREED` — `npm run verify:performance --workspace @lykar/sdk` — существующая команда; перед S4 запуском добавить отдельный output, чтобы сохранить S1 evidence.
- `AGREED` — `npx playwright test tests/e2e/s4-package-consumer.spec.ts tests/e2e/s4-resources.spec.ts --project=chromium` — новые browser suites.
- `AGREED` — `npm run build` и `npm run typecheck` — групповой интеграционный checkpoint.
- `PROPOSED` — Новые абсолютные browser latency/heap budgets, значения и блокирующий статус не согласованы; в S4 обязательны измерения и проверка bounded work.

Исторический jsdom p95 не выдаётся за browser performance. Полный визуальный/a11y audit и production load test не добавляются в эту задачу.
Новые suites/пакеты в командах выше — ожидаемые deliverables, а не уже существующие проверки. Согласованные формулировки и общий порядок: [TEST-PLAN.md](./TEST-PLAN.md).

## Expected deliverables

- Packed SDK/adapter consumer verification.
- Отдельный performance artifact для s4 и отчёт с методикой/ограничениями.
- Install instructions и проверенная compatibility matrix.

## Evidence and report

Report: `docs/verification/reports/s4/s4-delivery-performance.html`

Сохранить artifact hashes, exact versions, сборочные размеры, browser measurements и resource counters в `s4-delivery-performance.html`; рядом машинные artifacts.
Будущий отчёт создаётся при реализации; текущий статус задачи — PLANNED.

## Notes

Требования: INT-03/07/09, QLT-04/05. Tarball packaging не означает npm publish; внешняя публикация не входит в sprint execution. При расхождении текущих size baselines после S2 фиксировать причину, не увеличивать budget молча.
