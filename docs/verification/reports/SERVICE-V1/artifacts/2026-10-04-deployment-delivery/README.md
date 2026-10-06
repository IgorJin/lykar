# SERVICE-V1-04 evidence — 2026-10-04

Final: runtime 106/106, SDK 62/62, browser 55/55; build and typecheck PASS.
See `test-summary.json`, `source.json`, `asset-sizes.json` and the E2 HTML report.
`*-complete-results.json` contains final unit results; `browser-results.json`
contains final browser results. `*-regression` uses a fresh local API/PostgreSQL,
then tears the cluster down. No external deployment was performed.

Earlier failing attempts remain visible: runtime worker startup timeout; browser
fixture selector and interrupted cleanup; conditional-unit fixture readiness.
They are explained in `test-summary.json` and the report. `browser-artifacts`
contains first-attempt failure screenshots/video/traces. `regression-artifacts`
contains successful S4 screenshot evidence; no failed final cases.

`document-qa.json` and `*-qa.png` verify report/plan at 1440 and 390 px. Future
report links in the plan are explicitly recorded as pending, not treated as
completed artifacts. Rebuild the report with `python3 .../render-report.py` and
run document QA with `node .../check-documents.mjs` from the repository root.
