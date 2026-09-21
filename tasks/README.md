# Sprint task plans

Подробные задачи проекта хранятся по спринтам. `TASKS.md` остаётся коротким
навигационным индексом; здесь находятся планы, зависимости, критерии приёмки и
ожидаемые evidence.

| Спринт | Статус | Цель | План |
| --- | --- | --- | --- |
| S0 | DONE | Воспроизводимый baseline и первый browser flow | [tasks/S0](./S0/README.md) |
| S1 | DONE | Единый SDK, script/npm delivery и артефакты — 9 tasks | [tasks/S1](./S1/README.md) |
| S2 | PLANNED | P0 полный Style Manager, надёжное ядро и сохранение — 27 tasks | [tasks/S2](./S2/README.md) |

Порядок выполнения: `S0 → S1 → S2 → S3 → S4 → S5 → S6`. Статусы в планах:
`PLANNED`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELLED`.

Приоритет от 2026-09-21: S2-06.1…06.8 — полный редактор любого поддерживаемого
CSS-свойства, отдельная конфигурация и самописный лёгкий UI kit. Конфигурацию
и controls начинать первыми в S2, остальное — по зависимостям. Приёмка S2
заблокирована до завершения style editor acceptance.

## Evidence policy

HTML создаётся только для групп задач, где нужно зафиксировать изменение
структуры проекта, пользовательский browser flow, визуальный результат,
performance baseline или сложное recovery/concurrency поведение.

- `Evidence: report` — задача входит в групповой HTML report; отдельный файл для
  неё не создаётся.
- `Evidence: machine` — достаточно test/audit/fixture output и короткой записи
  результата; HTML не нужен.
- `Evidence: inline` — достаточно статуса, diff и notes в task file.

Групповой report должен отвечать на вопрос «что изменилось в структуре проекта»:
новые/изменённые пакеты, public contracts, migrations, assets, compatibility,
проверки и открытые риски. Подробные логи остаются в машинных artifacts.

Минимальная структура группового HTML: `Changed structure`, `Public/API or data
contracts`, `Verification`, `Open risks`, `Next tasks`. Отдельные command logs,
повторяющие test output, в HTML не копируются.
