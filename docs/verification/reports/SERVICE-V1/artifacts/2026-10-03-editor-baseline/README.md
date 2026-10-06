# Editor baseline — 2026-10-03

Summary: [E1 report](../../editor-contract.html). This is local technical acceptance
of SERVICE-V1-01; SERVICE-V1-02 and the whole epic remain incomplete.

Each command has `<label>.json` with exact argv, UTC timestamps and exit code,
plus a sanitized `<label>.log`. Browser summaries enumerate the executed tests.
Three PostgreSQL-only skips in `npm test` are covered by the separate API run.
The six evidence-path tests repeat part of the 55-test browser run.

The application source stayed unchanged. Before/after manifests include the same
277 source/config files; only the screenshot directory overrides in three E2E files
changed. The final manifest states its canonical hash method. The initial Git status
records pre-existing edits. Historical S2 tracked screenshots were clean initially,
restored from HEAD after the first run, and remained unchanged in the targeted rerun.

## Reproduction

Run commands from the monorepo root. Use a **new dated artifact directory** rather
than overwriting this accepted evidence. Set these variables for browser checks:

```text
LYKAR_EDITOR_SCREENSHOT_DIR=<new directory>/editor-screenshots
LYKAR_STYLE_SCREENSHOT_DIR=<new directory>/style-screenshots
PLAYWRIGHT_HTML_OUTPUT_DIR=<new directory>/browser-report
PLAYWRIGHT_JSON_OUTPUT_FILE=<new directory>/browser-results.json
```

The initial 55-test run set the editor override; the later six-test rerun also set
the style override added after identifying the historical screenshot destination.
Exact suites, project filters and output arguments are in the command JSON files.
Use one mutable test stack at a time; the project harness creates and stops its own
temporary PostgreSQL. Browsers/PostgreSQL require execution outside the restricted
sandbox on this host. See `environment.json` for versions.

`measure-baseline.mjs` measures production dist using the legacy S1 method and
records its failure rather than silently changing budgets. Its output is relative
to the script location, so copy it to the new run directory before repeating.
`render-report.mjs` reconstructs this E1 report from saved evidence; it is specific
to this dated run and is not a general sprint-report generator.

No external deployment, paid resource, user pilot or production email was involved.
Screenshot review was performed by the agent, not by an external pilot participant.
