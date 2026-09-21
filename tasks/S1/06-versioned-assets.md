# S1-02.2 — Версии и совместимость assets

Status: DONE
Priority: P1
Depends on: S1-02.1
Evidence: report
Report group: S1-distribution

## Goal

Сделать artifact set версионированным и не допустить смешивания несовместимых
SDK/runtime/editor/protocol версий до первой DOM mutation.

## Scope

- Asset manifest с hashes и compatibility metadata.
- Versioned paths и immutable output names.
- Разделение SDK version, protocol schema и Page Release version.
- Проверка old manifest и mixed/incompatible asset sets.

## Acceptance criteria

- [x] Все assets одного set имеют согласованную compatibility metadata.
- [x] Старый поддерживаемый manifest воспроизводится.
- [x] Несовместимый manifest отклоняется до DOM mutation с reason code.
- [x] Новый build не перезаписывает уже выпущенный versioned asset.
- [x] Package/protocol/Release versions видны отдельно в diagnostics.

## Checks

- `npm test`
- Old/new manifest compatibility fixtures
- Mixed asset browser fixture

## Expected deliverables

- Asset manifest schema и validator.
- Versioning/compatibility notes.

## Evidence and report

Report: `docs/verification/reports/S1/s1-distribution.html`

## Notes

Production CDN publication не входит в S1; проверяется локальная immutable semantics.

Результат: build-assets.mjs создаёт stable/versioned names без перезаписи уже
существующего versioned файла, SHA-256/SRI и compatibility metadata в
dist/asset-manifest.json. SDK проверяет весь compatibility set до загрузки
editor, а consumer check пересчитывает hashes из npm tarball. CDN publication
остаётся вне S1.
