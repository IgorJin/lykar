# SERVICE-V1-05 — Публикация в Admin и проверка применимости правок

Status: DONE
Priority: P0
Depends on: SERVICE-V1-04
Parallel wave: W5
Can run in parallel with: None

Stage: E2 — S5: публикация, отключение и откат
Planning date: 2026-10-02

## Goal

Дать владельцу понятное управление активной версией и восстановлением сломанных правок.

## Problem solved

Сохранённая версия и реальный результат сайта не собраны в один ежедневный workflow.

## Enables

- Полный сценарий быстрой правки и отката.
- Понятные результаты для будущего onboarding.

## Scope

- Добавить Deploy/Disable/Rollback, текущую активную версию, actor/time/reason, history и состояния загрузки/conflict/retry.
- Перед активацией показать доступный operation report и source drift; отсутствие проверки обозначать «не проверено».
- Связать applied/skipped/error с editor Change Tree и существующим ручным repair; исправление создаёт новый Draft/Release.
- Показать предел диагностики: structural fingerprint не определяет CSS-only drift и не гарантирует состояние всех посетителей.
- Завершить единые подписи состояний, desktop/mobile и keyboard/focus для публикации.

## Parallel execution

Последовательная интеграция Admin/editor после runtime; page-workspace, UI терминология и fixtures принадлежат этой задаче.

Hard prerequisites: SERVICE-V1-04. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [x] Пользователь отличает черновик, зафиксированную версию и активную публикацию без технических идентификаторов.
- [x] Ошибки/конфликты не теряют локальный выбор и не показывают ложный успех.
- [x] Mutation errors блокируются по принятой политике; skipped targets видны, не становятся скрытым auto-rebind.
- [x] Repair → preview → new Release → Deploy проходит; исходный Release неизменен.

## Checks

- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `UI`: UI и ручная приёмка: desktop/mobile, клавиатура, фокус, ошибки, сохранность правок и диагностика подключения.
- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Будущий Admin deployment/repair E2E и расширение существующего versioning-flow.spec.ts.
- `AGREED` — Ручной desktop/mobile: история, disabled controls, focus, conflict/retry; screenshot каждой основной стадии.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Admin deployment workflow и связанный repair/preflight.
- Групповой отчёт E2 с обычным посетителем.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/deployment.html`

Завершено 2026-10-05. [Раздел отчёта](../../docs/verification/reports/SERVICE-V1/deployment.html#SERVICE-V1-05).
Evidence: `docs/verification/reports/SERVICE-V1/artifacts/2026-10-04-deployment-admin/` (работа 4–5 октября).

- Build/typecheck всех workspaces PASS; protocol 23, runtime 109, SDK 84, editor bridge 86: 302 unit PASS.
- API/PostgreSQL 31/31 + HTTP smoke PASS, включая baseOperations immutable same-Page Release.
- Browser regression 74/74: Chromium 32, Firefox 21, WebKit 21; без skipped/flaky. 15 новых Admin/repair cases.
- Real preview popup, missing report/target, revision conflict, lost-response idempotent retry; deploy/disable/rollback с отдельным посетителем.
- Repair → save/reload → new Release → preview → Deploy сохраняет исходный manifest/hash. Static и React/Vue S4 regression сохранены.
- Desktop/390px, клавиатура/фокус, screenshots и source/asset hashes; failed attempts сохранены отдельно. Mobile overflow исправлен, старые E2E подписи и общий pricing fixture обновлены.


## Notes

- Постоянный обход всех клиентских сайтов и автоматический fuzzy repair в этот эпик не входят.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.

Реализовано без внешних providers и новых численных budgets. Preview report — диагностика
одного окна, не постоянный мониторинг. Известные ошибки/отсутствующие targets блокируют
проверенную версию в панели; отсутствие отчёта явно обозначено. Первая версия A/B по ссылкам
сохранена. SERVICE-V1-02 остаётся IN_PROGRESS; следующий последовательный шаг — 06.
