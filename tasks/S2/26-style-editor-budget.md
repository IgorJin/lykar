# S2-06.7 — P0: lazy delivery и бюджет веса editor UI

Status: DONE
Priority: P0
Depends on: S2-06.5
Evidence: report
Report group: S2-style-editor

## Goal

Сохранить минимальную стоимость Lykar для обычного посетителя и измеримо малый
вес полного Style Manager. Предпочтение владельца — самописный UI без тяжёлых
зависимостей — является критерием приёмки, а не пожеланием после реализации.

## Scope

- Загружать controls/config/codecs только в lazy editor asset. Проверить
  dependency graph script и npm entries; UI не импортируется runtime/SDK entry.
- В редакторе не добавлять UI kit, React/Preact runtime, icon pack, полный CSS
  reference database, CSS-in-JS, fonts/CDN assets или color-picker dependency.
- Измерить до/после на одинаковой production-сборке: raw/gzip/Brotli, request
  count, стоимость parse/init и input latency. Сравнивать с зафиксированным S1
  artifact либо воспроизводимым baseline до UI, с версией и средой.
- Рабочий целевой бюджет: прирост UI+config+codecs не более 20 KiB gzip;
  это проектный лимит для проверки, не уже измеренный результат. Protocol/core
  delta и суммарный editor asset также показать отдельно, не скрывать через chunks.
- UI-related прирост visitor entry — 0 bytes; обычный посетитель и share viewer
  не скачивают controls/config/codecs. Native controls не требуют сетевых ресурсов.
- На фиксированной fixture (1 000 DOM nodes) измерять выбор элемента и input
  до видимого preview; рабочая цель p95 ≤ 50 ms, с описанным устройством,
  прогревом и числом прогонов. Не превращать нестабильный wall-clock unit test
  в performance gate; использовать воспроизводимый browser harness.
- При превышении оптимизировать re-render, open-section rendering, imports и
  codecs. Если бюджет всё ещё превышен, зафиксировать результат и конкретный
  компромисс; не сокращать покрытие свойств и не повышать лимит молча.

## Acceptance criteria

- [x] Dependency/build audit подтверждает отсутствие нового UI runtime/vendor.
- [x] Network fixtures native/share не запрашивают style editor assets.
- [x] Все UI JS/CSS/chunks учтены в измерении, gzip/Brotli метод воспроизводим.
- [x] Целевые budgets выполнены либо задача остаётся незакрытой с численным
  превышением и предложением решения; статус DONE не ставится по оценке на глаз.
- [x] SDK lazy editor и npm consumer работают с production assets; SSR import
  не обращается к document и не монтирует UI на сервере.
- [x] CSS/controls не пересоздаются и не добавляют listeners при каждом input;
  destroy/повторный запуск освобождают listeners и DOM.

## Checks

- `npm run build`
- `npm run test:e2e:browser`
- Расширенный S1 measurement/dependency harness: size delta, network,
  selection/input latency, SSR consumer и destroy/restart.

## Expected deliverables

- Машинные budget measurements и graph audit, краткий разбор в общем report.
- Проверки защиты visitor path от случайного импорта editor UI.

## Evidence and report

Report: `docs/verification/reports/S2/s2-style-editor.html`

## Reproducible budget harness

From the repository root:

```sh
node scripts/style-editor-budget.mjs --artifacts-only
node scripts/style-editor-budget.mjs
node scripts/style-editor-budget.mjs --baseline-dir /path/to/baseline
```

`--artifacts-only` reads the existing SDK/editor distributions, asset manifest,
and source maps, then prints JSON. The default additionally bundles the current
`editor-ui` TypeScript entry in memory with esbuild (ES2018, IIFE, minified) to
measure its standalone raw/gzip/Brotli size; it writes no bundle. A baseline
directory may contain `sdk.iife.js`, `editor.iife.js`, and optionally
`editor-ui.iife.js`. The script reports per-file deltas only where matching
before and after artifacts exist. Preserve the baseline files from the same
production build/configuration; the script does not create or infer one.

The editor asset served by the SDK is `packages/sdk/dist/editor.iife.js`; the
visitor entry is `packages/sdk/dist/sdk.iife.js`. Source-map and package audits
show whether UI modules are bundled into each entry and whether third-party
runtime modules appear. Manifest hashes and byte counts are checked, and
versioned aliases are reported without counting duplicate payloads twice.
Standalone UI bytes are diagnostic and are not added to compressed full-editor
bytes because compression across a combined artifact is not additive.

## Notes

Final acceptance 2026-09-23: the reproducible S1 baseline and production audit are in `docs/verification/reports/S2/style-budget.json`. UI probe is 15,507 B gzip versus 20,480 B target; visitor source map has zero editor UI modules. Browser 1,000-node p95 stayed below 50 ms in Chromium, Firefox and WebKit. npm consumer/SSR fixture passed.
