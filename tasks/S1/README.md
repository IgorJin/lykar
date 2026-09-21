# S1 — Единый SDK и поставка библиотеки

Status: DONE
Planning date: 2026-09-21

S1 собирает текущие protocol/runtime/editor в один публичный SDK для script и
npm. Спринт переносит launch/share orchestration из playground, отделяет editor
asset и фиксирует совместимость, но не реализует полное target/lifecycle ядро S2.
На выходе две независимые установки проходят один static/SSR сценарий.

## Status legend

`PLANNED` — запланировано; `IN_PROGRESS` — выполняется; `BLOCKED` — заблокировано;
`DONE` — подтверждено; `CANCELLED` — отменено.

## Task order

| ID | Title | Status | Priority | Depends on | Task |
| --- | --- | --- | --- | --- | --- |
| S1-01.1 | Public API and compatibility matrix | DONE | P0 | S0-08 | [01](./01-public-api.md) |
| S1-01.2 | Common bootstrap and access modes | DONE | P0 | S1-01.1 | [02](./02-common-bootstrap.md) |
| S1-01.3 | Lazy editor and access boundaries | DONE | P0 | S1-01.2 | [03](./03-lazy-editor.md) |
| S1-01.4 | Playground compatibility bridge | DONE | P0 | S1-01.3 | [04](./04-playground-bridge.md) |
| S1-02.1 | Rollup artifact entries | DONE | P1 | S1-01.4 | [05](./05-rollup-entries.md) |
| S1-02.2 | Versioned assets and compatibility | DONE | P1 | S1-02.1 | [06](./06-versioned-assets.md) |
| S1-02.3 | Independent consumer fixtures | DONE | P1 | S1-02.2 | [07](./07-consumer-fixtures.md) |
| S1-02.4 | Dependency audit | DONE | P1 | S1-02.1 | [08](./08-dependency-audit.md) |
| S1-02.5 | Metrics, budgets and acceptance | DONE | P1 | S1-02.3, S1-02.4 | [09](./09-performance-baseline.md) |

## Sprint goal

Обычный сайт подключает Lykar одним script или npm SDK; visitor получает native
или разрешённый playback, а editor/share запускаются через общий bootstrap.

## Definition of done

- Script и локальный npm tarball используют одну реализацию и один manifest flow.
- Native visit не загружает editor и не ждёт analytics без явного режима.
- ESM import безопасен для SSR; IIFE, declarations и lazy editor assets проверены.
- Старые поддерживаемые entry points/manifests проходят compatibility fixtures.
- Size, replay и network deadline измерены на versioned fixtures и записаны в отчёте.

Acceptance result: 9/9 task records completed. S2 remains the next sprint for
TargetRegistry, PageSession, dependency-aware replay and full persistence
guarantees.

## Execution order and dependency notes

Порядок: `S1-01.1 → S1-01.2 → S1-01.3 → S1-01.4 → S1-02.1 → S1-02.2 →
S1-02.3 → S1-02.5`. S1-02.4 может выполняться после S1-02.1 параллельно с
consumer fixture, но S1-02.5 ждёт оба результата. Внешняя зависимость S0-08 уже
завершена; S2 начинается после приёмки всех девяти задач.

## Checks

- `npm ci --offline`
- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:http`
- `npm run test:e2e:browser`
- npm pack/consumer/SSR checks, добавленные в S1-02
- network assertions для native, editor и share modes

## Evidence and reports

| Group | Tasks | Evidence |
| --- | --- | --- |
| `S1-sdk-structure` | S1-01.1…S1-01.4 | [group report](../../docs/verification/reports/S1/s1-sdk-structure.html) |
| `S1-distribution` | S1-02.1…S1-02.4 | [group report](../../docs/verification/reports/S1/s1-distribution.html) + audit output |
| `S1-performance` | S1-02.5 | [group report](../../docs/verification/reports/S1/s1-performance.html) |

Reports are created once after the group reaches its acceptance gate. The task
files point to the group report; they do not imply one HTML file per task.
