# s4-05 — Редактор в SPA: команды, сохранение и восстановление

Status: PLANNED
Priority: P0
Depends on: s4-04
Parallel wave: W4
Can run in parallel with: None

## Goal

Сделать полный цикл редактирования React-страницы устойчивым к render и смене маршрута.

## Problem solved

Editor selection и pending изменения могут ссылаться на старые DOM nodes или потеряться при unmount/переходе на другую Page.

## Enables

- Пользователь редактирует React-страницу, сохраняет Draft и открывает immutable Release по share.
- s4-06: единая проверка page-scoped доступа через готовый editor.
- s4-08: ручная desktop/mobile приёмка.

## Scope

- Связать `packages/editor-bridge`/editor UI с регистрацией targets/roots и cooperative adapter; обновлять selection/highlight после замены actual node.
- В Lykar-owned regions проверить setText/setStyle/setAttribute/removeAttribute/insertNode/removeNode/moveNode и copy через безопасный insertNode, включая зависимости новых nodes.
- В managed tree показывать только разрешённые операции и объяснять `UNSUPPORTED_HOST_MUTATION` до preview/save; загруженная неподдерживаемая операция тоже не применяется молча.
- Перед route cleanup сохранить локальный recovery snapshot по Page/Draft; не сохранять на backend автоматически и не переносить правки A на B.
- Покрыть undo/redo, reset, preview → save → reload, lost response/retry и remount; восстановление A учитывает revision/conflict и существующую S2 recovery policy.
- Пройти через реальные Admin/editor UI до Release/share. При отсутствии доступа к B редактор закрывается безопасно, native UI остаётся доступным, pending A восстановимы.
- Расширить `s4-editor-flow.spec.ts` и ключевые cases в `s4-spa-critical.spec.ts`; выполнить ручной проход desktop/mobile.

## Parallel execution

W4 сериализован относительно s4-06: оба направления затрагивают смену Page, SDK runtime/editor handles, capability scope и общие browser scenarios. Отдельные UI/API файлы не делают эти задачи независимыми.

## Acceptance criteria

- [ ] Все protocol commands внутри Lykar-owned island проходят preview, undo/redo, save, reload и visitor replay, включая copy/add dependencies.
- [ ] Разрешённые managed text/style/attribute changes сохраняются после render через host contract.
- [ ] Удалённый/replaced target не оставляет stale selection или overlay; новые DOM references разрешаются по logical target.
- [ ] A→B→A с несохранёнными правками не теряет pending A, не меняет B и не создаёт скрытый save; конфликт восстановления видим пользователю.
- [ ] Повтор save после lost response не дублирует операции; immutable старый Release остаётся неизменным.
- [ ] Admin → editor → save → Release → share проходит в отдельном visitor context; visitor не получает editor assets/panel без права.
- [ ] Ручной desktop/mobile проход подтверждает выбор элемента, доступность controls, понятное ограничение managed mutations и восстановление после навигации.

## Checks

- `AGREED` — `UNIT` — Отмена устаревших операций, повторные вызовы, очистка ресурсов, ограничения команд.
- `AGREED` — `BROWSER` — A→B→A, назад/вперёд, поздняя загрузка элементов, hydration, повторный рендер и mount/unmount.
- `AGREED` — `FLOW` — Открыть редактор → изменить → сохранить → опубликовать Release → открыть share на React-странице.
- `AGREED` — `API` — Изоляция страниц и прав доступа; аналитика учитывает посещения без дублей от re-render.
- `AGREED` — `ENGINES` — полный сценарий в Chromium, ключевые SPA-сценарии также в Firefox и WebKit.
- `AGREED` — `MANUAL` — ручная приёмка редактора на desktop и mobile viewport.

- `AGREED` — `npm test --workspace @lykar/editor-bridge` и `npm test --workspace @lykar/editor-ui` — существующие команды.
- `AGREED` — `npx playwright test tests/e2e/s4-editor-flow.spec.ts tests/e2e/s4-spa-critical.spec.ts --project=chromium` — новые suites.
- `AGREED` — `npx playwright test tests/e2e/persistence-recovery.spec.ts tests/e2e/versioning-flow.spec.ts --project=chromium` — целевые S2/S3 регрессии.
- `AGREED` — `npx playwright test tests/e2e/s4-spa-critical.spec.ts --project=firefox` и аналогично `--project=webkit`.
- `AGREED` — `npm run dev:e2e` — ручной desktop/mobile проход по checklist TEST-PLAN.

Browser flow использует реальные API и PostgreSQL; перехват ответа допустим для lost-response/race injection при реальном server commit.
Новые suites/пакеты в командах выше — ожидаемые deliverables, а не уже существующие проверки. Согласованные формулировки и общий порядок: [TEST-PLAN.md](./TEST-PLAN.md).

## Expected deliverables

- SPA editor integration и recovery/diagnostics.
- Browser cases для полного command workflow и межстраничного восстановления.
- Скриншоты desktop/mobile, machine outputs и draft секции editor для группового отчёта.

## Evidence and report

Report: `docs/verification/reports/s4/s4-editor-analytics.html`

Зафиксировать Page/Draft/Release контексты и наблюдаемый UI результат. Итоговый групповой отчёт завершает s4-06 после своей интеграции.
Будущий отчёт создаётся при реализации; текущий статус задачи — PLANNED.

## Notes

Требования: INT-06/10, QLT-02/06; SPEC §22.1.6/10/11. Полный каталог host components/actions FUT-08 и копирование бизнес-логики не входят в S4.
