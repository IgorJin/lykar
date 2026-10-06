# SERVICE-V1-05 verification evidence — 2026-10-04–05

Local development checkout, no external deployment. Commands run sequentially against the same build tree; PostgreSQL and browser stacks are disposable and stopped by the harness. Source identity and final results are generated after verification.

## Retained attempts

- `build`: failed because Admin consumed a newly exported protocol type before the protocol workspace was built. Added protocol prebuild/pretypecheck to Admin; `build-fixed` passed.
- `editor-bridge` / `runtime`: new conditional test fixtures lacked a ready framework root; one cleanup fixture attempted a forbidden inline style attribute. Fixed fixtures to exercise the existing S4 contract and safe attributes; final suites pass.
- `browser-admin-first`: 3 passed / 1 failed. Mobile Admin overflow from the header and long Page pathname was fixed with wrapping. Evidence: `browser-first-artifacts/`.
- `browser-admin-repair`: 14 passed / 1 failed. WebKit/macOS default Tab navigation skips buttons; a minimal real WebKit check confirmed Option+Tab focuses them. Test uses that key, preserving actual keyboard activation. Evidence: `browser-second-artifacts/`.
- `browser-regression`: first broad run exposed old Admin revision labels and shared /pricing baseline in the persistence fixture. Updated labels, scoped a command-count assertion to exact text, and gave each persistence case a real unique Page; no product assertion was removed. The following 74-case run passed 73 and found two more old revision labels in S3 acceptance; those were updated before the final run.

`run-command.mjs` records timestamps, exit codes and redacts share/capability query strings in logs. Faults are explicit fixture injections, not staging network or SLA evidence. Reports are advisory per-preview; budget/provider decisions remain open in SERVICE-V1-02.
