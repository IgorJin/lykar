# s4-08 — Итоговая приёмка и передача в следующий этап

Status: PLANNED
Priority: P0
Depends on: s4-07
Parallel wave: W7
Can run in parallel with: None

## Goal

Подтвердить согласованную матрицу S4 на одном revision и зафиксировать готовые возможности, ограничения и evidence.

## Problem solved

Разрозненные зелёные проверки разных snapshots не доказывают целостный React editor/share/analytics workflow.

## Enables

- Обоснованное закрытие S4 и переход к следующей работе по roadmap.
- Проверенный baseline для будущих Next.js/Vue integrations.

## Scope

- После интеграционного checkpoint прогнать полный build/typecheck/unit/HTTP/PostgreSQL/browser набор на финальном revision.
- Выполнить полный React workflow в Chromium, ключевые SPA checks в Firefox/WebKit и существующие static/style S0–S3 regressions.
- Выполнить packed consumer и resource/size evidence без повторных полных прогонов при неизменном коде и уже валидном результате.
- Пройти manual desktop/mobile checklist и приложить screenshots важных UI состояний, host behavior и unsupported mutation feedback.
- Проверить task-to-test mapping, exact versions, отсутствие skipped обязательных DB/browser checks и закрытие release blockers.
- Обновить task statuses только с evidence; при исполнении спринта синхронизировать sprint index, TASKS/ROADMAP и implementation docs, зафиксировав Next.js/Vue adapter как будущие срезы.
- Собрать `s4-acceptance.html`, дать ссылки на групповые отчёты, проверки, ограничения и оставшиеся вопросы.

## Parallel execution

Финальный gate выполняется последовательно после s4-07 на фиксированном revision. Проверки, меняющие общие build outputs или управляемый стенд, не запускаются конкурентно в одном checkout.

## Acceptance criteria

- [ ] Все восемь задач имеют выполненные критерии или явно описанный blocker; DONE не ставится при незакрытой обязательной проверке.
- [ ] Полный build/typecheck/unit/HTTP/browser набор прошёл на одном финальном revision; relevant PostgreSQL cases реально исполнились.
- [ ] Полный Chromium flow и ключевые Firefox/WebKit suites прошли; отсутствие обнаруженных tests не трактуется как PASS.
- [ ] Нет hydration defects, потери правок, смешивания Page/Release/access, дублей analytics, накопления ресурсов или бесконечного reconciliation.
- [ ] Есть ручные desktop/mobile результаты и evidence packed install/SSR, а также измерения размера/ресурсов.
- [ ] В summary поддержка ограничена проверенной matrix; Next.js и полноценный Vue adapter обозначены deferred.
- [ ] Итоговый отчёт позволяет воспроизвести проверки из чистой установки по documented commands.

## Checks

- `AGREED` — `UNIT` — Отмена устаревших операций, повторные вызовы, очистка ресурсов, ограничения команд.
- `AGREED` — `BROWSER` — A→B→A, назад/вперёд, поздняя загрузка элементов, hydration, повторный рендер и mount/unmount.
- `AGREED` — `FLOW` — Открыть редактор → изменить → сохранить → опубликовать Release → открыть share на React-странице.
- `AGREED` — `API` — Изоляция страниц и прав доступа; аналитика учитывает посещения без дублей от re-render.
- `AGREED` — `PACKAGE` — Установка из собранного пакета, TypeScript, импорт на сервере, сохранение работы script-подключения.
- `AGREED` — `PERFORMANCE` — Размер пакета, ограниченные повторные применения, отсутствие накопления listeners и observers.
- `AGREED` — `ENGINES` — полный сценарий в Chromium, ключевые SPA-сценарии также в Firefox и WebKit.
- `AGREED` — `MANUAL` — ручная приёмка редактора на desktop и mobile viewport.

- `AGREED` — `npm run build`, затем `npm run typecheck`, затем `npm test` — существующие команды, выполнять последовательно.
- `AGREED` — `npm run test:e2e:http`, затем `npm run test:e2e:browser` — групповой final gate с изолированной PostgreSQL.
- `AGREED` — `npm run verify:consumer --workspace @lykar/sdk` — итоговые packed artifacts; использовать уже валидное evidence того же revision, если оно не изменилось.
- `AGREED` — `npm run verify:performance --workspace @lykar/sdk` — с отдельным S4 output из s4-07; resource checks входят в browser suite.
- `AGREED` — `npm run dev:e2e` — финальная ручная desktop/mobile приёмка.
- `AGREED` — `git diff --check` — чистота изменений и отчётов.

Полный регрессионный прогон выполняется при финальной приёмке; повторять его после новых исправлений в затронутом объёме. Один неуспешный test не скрывать retries или снятием обязательности.
Новые suites/пакеты в командах выше — ожидаемые deliverables, а не уже существующие проверки. Согласованные формулировки и общий порядок: [TEST-PLAN.md](./TEST-PLAN.md).

## Expected deliverables

- Итоговый acceptance report и ссылки на machine artifacts/screenshots.
- Синхронизированные статусы и support matrix.
- Краткая инструкция начала следующего этапа и список deferred integrations.

## Evidence and report

Report: `docs/verification/reports/s4/s4-acceptance.html`

`s4-acceptance.html` содержит revision, commands, environment, pass/fail/skips, Changed structure, Public/API or data contracts, Verification, Open risks и Next tasks.
Будущий отчёт создаётся при реализации; текущий статус задачи — PLANNED.

## Notes

Все runtime/browser/API результаты ещё предстоит получить при реализации. Само создание этого плана не подтверждает готовность S4 и не публикует пакеты.
