# Lykar tasks

Это короткий индекс спринтов. Подробные task records, зависимости, критерии,
проверки и evidence policy находятся в папке [`tasks/`](./tasks/). Для S1/S2
36 task records S1/S2 объединены в групповые HTML reports. S3 закрыт шестью
task records и итоговой browser/PostgreSQL-проверкой. Исторические S0 evidence
сохранены.

## Порядок спринтов

**S0 → S1 → S2 → S3 → S4 → S5 → S6**

| Спринт | Статус | Назначение | Подробный план |
| --- | --- | --- | --- |
| S0 | DONE | Проверенный baseline и первый browser flow | [tasks/S0](./tasks/S0/README.md) |
| S1 | DONE | Единый SDK, script/npm delivery и библиотечные артефакты | [tasks/S1](./tasks/S1/README.md) |
| S2 | DONE | P0 Style Manager, надёжные targets, replay, save/recovery | [tasks/S2](./tasks/S2/README.md) |
| S3 | DONE | Admin → release → share → experiment → report | [tasks/S3](./tasks/S3/README.md), [acceptance report](./docs/verification/reports/S3/s3-acceptance.html) |
| S4 | PLANNED | React/SPA adapter и cooperative integration | [ROADMAP § S4](./ROADMAP.md) |
| S5 | PLANNED | Deploy/Disable/Rollback и delivery semantics | [ROADMAP § S5](./ROADMAP.md) |
| S6 | PLANNED | Production operations и public SaaS baseline | [ROADMAP § S6](./ROADMAP.md) |

## S0 — Проверенный baseline

S0 завершён после ревизии 2026-09-21. Он подтверждает воспроизводимую установку,
локальный стек и основной flow в Chromium/Chrome. Подробные архивные записи:
[tasks/S0](./tasks/S0/README.md), evidence — в
[docs/verification/reports](./docs/verification/reports/).

### S0-01 — Чистая установка

Зафиксировать snapshot и подтвердить `npm ci` без глобальных зависимостей.

### S0-02 — Baseline workspaces

Проверить build, typecheck и unit suites всех доступных workspaces.

### S0-03 — Локальный стек и HTTP smoke

Подтвердить PostgreSQL/API/Admin/playground, seed, restart, Ctrl+C и smoke.

### S0-04 — Browser E2E harness

Запустить изолированный Chromium suite с реальными HTTP endpoints и diagnostics.

### S0-05 — Login и открытие editor

Проверить local login, magic link, Admin click и recovery без capability.

### S0-06 — Edit → save → reload → Release → share

Подтвердить сохранение изменения, reload, immutable Release и visitor share.

### S0-07 — Regression fixes

Устранить блокирующие дефекты S0 и добавить regression cases.

### S0-08 — Документация и приёмка

Закрыть инструкции, отчёты и ручной проход основного сценария.

## S1 — Единый SDK и поставка библиотеки

S1 собирает общий bootstrap для script/npm, отделяет editor asset, фиксирует
public API/compatibility и измеряет размер, replay и network deadline. Внутри S1
9 отдельных task records; полный TargetRegistry и PageSession реализуются в S2.

Подробный план: [tasks/S1/README.md](./tasks/S1/README.md).

### S1-01 — SDK bootstrap и compatibility bridge

Перенести launch/share orchestration из playground в публичный SDK и сохранить
совместимость текущих entry points, modes и access boundaries.

### S1-02 — Rollup artifacts и performance baseline

Собрать IIFE/ESM/declarations/lazy editor, проверить npm tarball/SSR consumer и
зафиксировать проверяемые delivery budgets.

## S2 — Надёжное ядро и полный editor workflow

S2 устраняет неоднозначный replay, устаревшие async mutations, дубли save и
необъяснимые editor failures. Внутри S2 27 отдельных task records; зависимости
обязательны. Требование владельца от 2026-09-21: **полный редактор любого
поддерживаемого CSS-стиля как в GrapesJS — P0 и условие приёмки S2**.
Сначала S2-06.1/06.2 (конфигурация и лёгкие controls), интеграция — по готовности
необходимых core contracts. Все 8 style tasks имеют P0.

Подробный план: [tasks/S2/README.md](./tasks/S2/README.md).

### S2-01 — TargetRegistry и строгий resolver

Ввести logical targets, versioned bindings и результаты unique/missing/ambiguous/invalid.

### S2-02 — PageSession и lifecycle cleanup

Связать lifecycle с generation, abort, root ownership и безопасным destroy.

### S2-03 — Executor, dependencies, ledger и journal

Обеспечить identity новых nodes, dependency-aware replay, partial failure и compensation.

### S2-04 — Идемпотентный save и recovery

Сделать сохранение Draft атомарным и восстановимым при lost response, reload и conflict.

### S2-05 — Editor workflow, repair и acceptance

Связать ядро с Change Tree, undo/redo, ручным repair, overlay и полным browser flow.

### S2-06 — P0: полноценный редактор стилей и минимальный UI kit

Отдельная конфигурация `styles-config.ts`; самописные TypeScript/DOM controls:
select, text input, color input, number+unit, composite/stack. Все legacy styles
получают поля, любое дополнительное поддерживаемое CSS-свойство доступно через
Advanced. Единые preview/reset/undo/redo/save/reload, без новой UI runtime
зависимости; controls/config загружаются только в lazy editor.

Начать с [S2-06.1: конфигурация](./tasks/S2/20-style-schema.md), затем
[S2-06.2: самописный UI kit](./tasks/S2/21-native-style-controls.md).
Полный порядок, budgets и критерии: [план S2](./tasks/S2/README.md).

## S3 — Admin, releases, sharing, experiments and reports

S3 завершён 2026-09-23. Полный путь проверен браузером и PostgreSQL-backed API:
Members/Admin, независимые Page versions, stale revision retry, scoped share
preview/revoke, sticky native-vs-release experiment, consent-gated totals и
winner без deployment на обычном URL. Все 6 task records и screenshots находятся
в [S3 task index](./tasks/S3/README.md) и
[acceptance report](./docs/verification/reports/S3/s3-acceptance.html).

## Правила статусов

`PLANNED` — запланировано; `IN_PROGRESS` — выполняется; `BLOCKED` — заблокировано;
`DONE` — подтверждено evidence; `CANCELLED` — отменено.

Для выполнения задачи использовать task file соответствующего спринта. После
изменения кода обновлять status только вместе с критериями и verification report.
