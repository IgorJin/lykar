# S2-03.1 — Operation identity и ledger

Status: DONE
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

- [x] Каждая созданная node/text insertion имеет стабильную identity.
- [x] Повтор replay не создаёт второй экземпляр insertion.
- [x] Edit/move/delete после insertion адресуют созданный узел.
- [x] DOM references не сериализуются в protocol/storage.

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

Результат: добавлен scoped `ReplayLedger` с element attributes и comment markers
для text nodes. `nodeRef` хранит только operation/path, а live references остаются
в памяти. Unit fixture выполняет insert → edit text → move → delete → forced
replay; browser fixture подтверждает повторный PageSession без дублей.
