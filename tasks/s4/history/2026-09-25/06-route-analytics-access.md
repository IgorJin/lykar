# s4-06 — Посещения маршрутов, аналитика и изоляция доступа

Status: PLANNED
Priority: P0
Depends on: s4-05
Parallel wave: W5
Can run in parallel with: None

## Goal

Считать SPA-посещения без дублей от render и сохранять page-bound доступ при переходах.

## Problem solved

Пересоздание runtime может повторно отправить exposure, потерять consent либо использовать контекст другой Page.

## Enables

- Достоверные experiment reports для React SPA.
- Отсутствие межстраничного доступа и поздних событий старого route.
- s4-07/s4-08: стабильный интегрированный consumer и финальная приёмка.

## Scope

- Связать analytics context с visit identity из s4-01/02; render/refresh/remount того же посещения не отправляет новое exposure.
- Подтверждённый новый visit A после A→B→A/back-forward получает новую view при действующем experiment access и granted consent; visitors/assignment остаются по существующей S3 семантике.
- Сохранить явно установленный consent при создании runtime для следующей страницы в пределах SDK instance; pending/denied не отправляют события.
- Проверить одновременные callbacks/retry exposure, stable clientEventId для повторной отправки одного события и существующую PostgreSQL дедупликацию.
- На A/B проверить разрешённый и запрещённый доступ, истечение/отзыв share/experiment token и возврат A после использования launch/share exchange.
- Не начинать новые события от retired generation; уже принятый сервером event остаётся привязан к исходному посещению и не учитывается в B.
- Проверить Native A/Release B, sticky assignment, explicit conversions и totals через реальные API/PostgreSQL; winner остаётся metadata.
- Если обнаружена необходимость новой wire/schema/миграции, описать совместимость и согласовать дополнительную migration test scope до её введения; базовый план использует существующую модель.

## Parallel execution

W5 начинается после s4-05. SDK, runtime, access и общей fixture не меняют параллельно с editor work; final report собирается одним владельцем.

## Acceptance criteria

- [ ] Серия render/refresh/dev remount одного visit при granted consent даёт ровно одно exposure.
- [ ] Два подтверждённых посещения A дают две views при одном visitor/assignment по S3 семантике; B учитывается только при собственном действующем контексте.
- [ ] Pending/denied дают ноль принятых exposure/conversion; повтор granted и одновременные callbacks не дублируют exposure.
- [ ] Replay старого clientEventId дедуплицируется PostgreSQL; lost response не приводит к повторному логическому событию.
- [ ] Capability A не читает/редактирует B; отозванный/недействительный selector не расширяет права и оставляет host native.
- [ ] События, начатые после retirement, не отправляются; ранее принятые события не переатрибутируются другой Page.
- [ ] Числа отчёта совпадают с вручную заданной последовательностью visits/conversions; завершение experiment не запускает deployment.

## Checks

- `AGREED` — `UNIT` — Отмена устаревших операций, повторные вызовы, очистка ресурсов, ограничения команд.
- `AGREED` — `BROWSER` — A→B→A, назад/вперёд, поздняя загрузка элементов, hydration, повторный рендер и mount/unmount.
- `AGREED` — `API` — Изоляция страниц и прав доступа; аналитика учитывает посещения без дублей от re-render.
- `AGREED` — `ENGINES` — полный сценарий в Chromium, ключевые SPA-сценарии также в Firefox и WebKit.

- `AGREED` — `npm test --workspace @lykar/runtime` и `npm test --workspace @lykar/sdk` — targeted consent/visit/idempotency cases.
- `AGREED` — `npm run test:e2e:http` — существующая команда с временной PostgreSQL; relevant DB cases не пропущены.
- `AGREED` — `npx playwright test tests/e2e/s4-analytics-access.spec.ts tests/e2e/s3-acceptance.spec.ts --project=chromium` — новый SPA suite и существующая S3 регрессия.
- `AGREED` — `npx playwright test tests/e2e/s4-spa-critical.spec.ts --project=chromium` и последовательно Firefox/WebKit — ключевые access/no-duplicate cases.

Задержка ответа моделируется на границе HTTP; проверяются browser outcome и persisted API/DB totals. Событие, уже принятое сервером до retirement, не объявляется отменённым задним числом.
Новые suites/пакеты в командах выше — ожидаемые deliverables, а не уже существующие проверки. Согласованные формулировки и общий порядок: [TEST-PLAN.md](./TEST-PLAN.md).

## Expected deliverables

- Стабильный visit/consent/event lifecycle и проверенная page isolation.
- Unit, browser и PostgreSQL cases на дубли/races/revoke.
- Групповой `s4-editor-analytics.html` с результатами s4-05/06.

## Evidence and report

Report: `docs/verification/reports/s4/s4-editor-analytics.html`

Сохранять сценарную таблицу expected/actual counts, DB-backed results и browser traces без raw tokens. Native fallback и denied access показывать отдельными outcomes.
Будущий отчёт создаётся при реализации; текущий статус задачи — PLANNED.

## Notes

Требования: ANA-05, INT-06, QLT-02/06. s4-05 указан как hard dependency из-за общего SDK route/access поведения и последовательной интеграции.
