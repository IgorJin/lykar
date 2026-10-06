# SERVICE-V1-15 — Журнал действий и удаление клиентских данных

Status: PLANNED
Priority: P0
Depends on: SERVICE-V1-14
Parallel wave: W14
Can run in parallel with: None

Stage: E5 — S6: доставка и эксплуатация
Planning date: 2026-10-02

## Goal

Сделать значимые действия объяснимыми, а удаление данных управляемым и проверяемым.

## Problem solved

Production требует audit и data deletion; история отдельных доменов не заменяет полный lifecycle клиента.

## Enables

- Поддержку инцидентов и запросов клиента.
- Безопасные backup/restore и готовность публичного сервиса.

## Scope

- Добавить auditable publish/deploy/disable/rollback/share/role/experiment lifecycle с actor/time/resource/outcome без secret payload.
- Определить роли просмотра журнала, retention и видимость только своего Project.
- Реализовать подтверждаемое удаление проекта с Pages/Drafts/Releases/capabilities/assignments/events/rollups/jobs согласно SPEC; scoped tenant deletion.
- Определить account deletion/ownership transfer препятствия: не оставлять сайт без Owner и не удалять чужие проекты.
- Задокументировать обращение с резервными копиями и deletion tombstones при restore; backup retention не обещает мгновенное физическое исчезновение каждой копии.

## Parallel execution

Последовательная работа над migrations, domain lifecycles и jobs после 14; не совмещать с release schema changes.

Hard prerequisites: SERVICE-V1-14. Все транзитивные prerequisites обязательны. Изменение общей схемы/контракта/lockfile или использование одного mutable стенда требует последовательного checkpoint.

## Acceptance criteria

- [ ] История объясняет кто/когда/что изменил, а чужой клиент её не читает.
- [ ] Удаление отзывает delivery/access и связанные jobs; concurrent requests не восстанавливают удалённый проект.
- [ ] Повтор удаления безопасен; сохранившийся audit не содержит запрещённых персональных/секретных данных.
- [ ] Restore не возобновляет удалённые проекты или отозванные capability вопреки выбранной политике.

## Checks

- `AGREED` — `CORE`: Unit, API/PostgreSQL, конкуренция и миграции: сохранение, права разных клиентов, публикация/откат, распределение A/B и точные счётчики.
- `AGREED` — `BROWSER`: Browser E2E: регистрация → подключение → правка → preview → публикация/эксперимент → отчёт → отключение; static, React/Vue в пределах принятой S4-матрицы. Полный проход Chromium, ключевые сценарии Firefox/WebKit.
- `AGREED` — `RELIABILITY`: Надёжность, безопасность и performance: потеря/задержка сети, исходная страница при сбое, отсутствие дублей аналитики, изоляция доступа, consent, лимиты запросов, отсутствие токенов в логах; измерение доставки/replay и согласование новых численных бюджетов до реализации.
- `AGREED` — `OPS`: Эксплуатация: тестовая среда, реальные тестовые письма, обновление версии, резервная копия/восстановление, фоновые задачи и сигнал о сбое.

Точная привязка согласованных слоёв к этой задаче:
- `AGREED` — Будущие deletion cascade/retry/race/tenant-isolation PostgreSQL cases и Admin confirmation flow.
- `AGREED` — Проверка audit полноты по набору actions и secret redaction; restore deletion policy передать в 16.

Необходимый environment и evidence — в [TEST-PLAN.md](./TEST-PLAN.md). Новые suites/commands сначала создаются в рамках scope; отсутствие команды не трактуется как успешная проверка.

## Expected deliverables

- Audit API/UI и data deletion workflow.
- Data lifecycle policy и evidence удаления.

## Evidence and report

Report: `docs/verification/reports/SERVICE-V1/operations.html`

Групповой report этапа E5; выделить отдельную запись/anchor `SERVICE-V1-15`, приложить machine evidence и ограничения. На стадии планирования отчёт ещё не создан и проверки не выполнены.

## Notes

- Реальное удаление клиентских данных не выполняется при планировании; acceptance использует специально созданные fixtures.
- Численные новые budgets и внешние prerequisites нельзя объявлять согласованными по наличию этого файла. Решения 02/20 и журнал соглашения обязательны.
