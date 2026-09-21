# S1-02.3 — Независимые consumer fixtures

Status: DONE
Priority: P1
Depends on: S1-02.2
Evidence: report
Report group: S1-distribution

## Goal

Проверить script и npm delivery в окружениях, которые не используют workspace aliases
или исходники соседних пакетов.

## Scope

- Static script installation fixture.
- npm consumer из локального `npm pack` tarball.
- TypeScript declarations и ESM import.
- SSR import без DOM globals и browser workflow из tarball.

## Acceptance criteria

- [x] Consumer устанавливает tarball и не использует workspace symlinks/aliases.
- [x] TypeScript consumer видит поставленные declarations.
- [x] SSR import не обращается к `window`/`document` и не делает запросов.
- [x] Script fixture и npm consumer используют общий SDK flow; browser flow
  проходит через script installation.
- [x] Lazy editor assets доступны из package artifact.

## Checks

- `npm pack`
- Clean consumer install
- TypeScript consumer build
- Node SSR import check
- `npm run test:e2e:browser`

## Expected deliverables

- Две независимые installation fixtures.
- Consumer test script и recorded artifact versions.

## Evidence and report

Report: `docs/verification/reports/S1/s1-distribution.html`

## Notes

Consumer fixture должна использовать тот же protocol/manifest, что и script installation.

Результат: scripts/verify-sdk-consumer.mjs пакует SDK/runtime/protocol во
временный независимый consumer, проверяет declarations, SSR construction,
каждый manifest hash/SRI и one-script editor workflow из tarball. Browser E2E
также обслуживает playground из установленного tarball, поэтому stale workspace
dist больше не может скрыть ошибку сборки. Static script fixture добавлена в
tests/fixtures/sdk-consumer.
