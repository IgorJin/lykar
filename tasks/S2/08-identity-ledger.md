# S2-03.1 — Operation identity и ledger

Status: PLANNED
Priority: P0
Depends on: S2-02.3
Evidence: report
Report group: S2-replay-safety

## Goal

Определить identity операций и созданных узлов, включая text nodes, чтобы replay
был повторяемым и не создавал дубли.

## Scope

- Element, child и text-node identity.
- Page/Release/Draft/generation/operation/node dimensions.
- Insert → edit child → move → copy → delete chain.
- In-memory DOM references и serialized descriptors.

## Acceptance criteria

- [ ] Каждая созданная node/text insertion имеет стабильную identity.
- [ ] Повтор replay не создаёт второй экземпляр insertion.
- [ ] Edit/move/delete после insertion адресуют созданный узел.
- [ ] DOM references не сериализуются в protocol/storage.

## Checks

- `npm test`
- Inserted element and text-node replay fixtures
- Repeat replay browser fixture

## Expected deliverables

- Ledger/identity model.
- Node identity regression cases.

## Evidence and report

Report: `docs/verification/reports/S2/s2-replay-safety.html`

## Notes

Identity должна учитывать actual node, а не только CSS selector.
