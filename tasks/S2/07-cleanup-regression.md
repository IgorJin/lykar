# S2-02.3 — Cleanup и lifecycle regression matrix

Status: PLANNED
Priority: P0
Depends on: S2-02.2
Evidence: report
Report group: S2-target-lifecycle

## Goal

Гарантировать, что destroy/root change освобождают все resources и не оставляют
старую работу в следующем context.

## Scope

- Listeners, observers, timers, selection, overlay и pending work ownership.
- Root replacement и `start/destroy/start`.
- Pending edits scoped по Page/Draft.
- Browser regression matrix и journal cleanup hook.

## Acceptance criteria

- [ ] Destroy останавливает listeners, observers, timers и pending work.
- [ ] После destroy не создаются nodes, overlays или events.
- [ ] Root replacement отключает старый root.
- [ ] Pending edits не переносятся автоматически на другую Page.
- [ ] Journal cleanup contract готов для S2-03.

## Checks

- `npm test`
- `npm run test:e2e:browser`
- Root replacement, late node and start/destroy/start fixtures

## Expected deliverables

- Cleanup implementation.
- Lifecycle browser evidence.

## Evidence and report

Report: `docs/verification/reports/S2/s2-target-lifecycle.html`

## Notes

React remount matrix и framework adapters относятся к S4.
