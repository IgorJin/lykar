# Lykar

Lykar is a platform for recording, reviewing, publishing, and replaying
versioned changes to static and server-rendered web pages.

The normative product and engineering contract is [SPEC.md](./SPEC.md). Coding
agents and contributors should read it before changing domain behaviour.

The current requirements register and implementation stages are in
[ROADMAP.md](./ROADMAP.md). The target script/npm SDK, Rollup distribution,
and SPA lifecycle are described in
[Technical vision](./docs/architecture/technical-vision.md).

The S0 implementation tasks and the ordered follow-up technical work are in
[TASKS.md](./TASKS.md).

The planned visual change request and source acceptance prototype is evaluated
in the [Visual Spec RFC](./docs/architecture/visual-spec-review.md).

This monorepo imports the histories of the original client and server projects.
The existing standalone repositories remain unchanged while the platform is
revived here.

## Repository layout

- `apps/api` — Fastify/PostgreSQL backend and same-origin admin host.
- `apps/admin` — Preact administration UI.
- `apps/playground` — full-stack interactive editor/runtime fixture.
- `packages/lykar-lib` — imported browser library and editor.
- `packages/protocol` — shared, serializable operation protocol.
- `packages/runtime` — token-gated variant and protected release playback runtime.
- `packages/editor-bridge` — DOM inspection and preview bridge.
- `packages/editor-ui` — editor interface.
- `packages/sdk` — integration entry points.
- `tests/fixtures` — static test sites.
- `tests/e2e` — end-to-end scenarios.

## Development

The repository uses npm workspaces and a single root lockfile. The verified S0
environment is macOS, Node.js 22, npm 10, PostgreSQL 15 CLI, and Playwright
Chromium. From a clean checkout in Ghostty or another terminal:

```sh
npm ci
npx playwright install chromium
npm run build
npm run typecheck
npm test
```

The PostgreSQL tools `initdb`, `pg_ctl`, `psql`, and `createdb` must be on
`PATH`. JavaScript dependencies come only from the root lockfile; no global npm
packages are required.

### Local stand

Run the complete platform with one command from the repository root:

```sh
npm run dev:e2e
```

It builds the browser bundles, starts a managed PostgreSQL cluster, applies the
migrations, seeds an idempotent `Northstar E2E` project, and starts the API,
admin, runtime, and playground. Open:

- admin: <http://127.0.0.1:3000/admin/>
- home fixture: <http://127.0.0.1:4173/>
- independent pricing fixture: <http://127.0.0.1:4173/pricing>

The Admin login screen has a **Войти как локальный владелец** button, so local
work does not require a magic link or account credentials. `dev:e2e` enables
this only for its loopback API; regular magic-link login remains available.
Invitation links created from the **Участники** tab are printed in the same
terminal. The managed database is kept in `.lykar/e2e` between runs, while
Ctrl+C stops all processes.

The command expects the PostgreSQL command-line tools (`initdb`, `pg_ctl`,
`psql`, and `createdb`). For the persistent developer stand only, an existing
server can be selected with `LYKAR_E2E_DATABASE_URL`; isolated HTTP/browser
tests always create their own temporary cluster and ignore inherited database
URLs. Stop the stand with `Ctrl+C`; it stops API,
playground, and the PostgreSQL process started by this command. The next launch
reuses `.lykar/e2e` and reruns migrations and the idempotent seed.

If a default port is occupied, the command exits before starting children and
names that port. Inspect it with `lsof -nP -iTCP:3000 -sTCP:LISTEN` (or 4173 /
55432), stop the process if it belongs to you, or choose free ports:

```sh
LYKAR_E2E_API_PORT=3010 \
LYKAR_E2E_PLAYGROUND_PORT=4183 \
LYKAR_E2E_POSTGRES_PORT=55442 \
npm run dev:e2e
```

With these values, Admin is at `http://127.0.0.1:3010/admin/` and the fixture
is at `http://127.0.0.1:4183/`. The addresses printed by the command are the
source of truth.

### Verification commands

Use each suite separately so a skipped database test cannot be mistaken for a
complete end-to-end pass:

```sh
npm run build             # workspace production builds
npm run typecheck         # workspace static type checks
npm test                  # unit/component suites; DB tests skip without a test URL
npm run test:e2e:http     # temporary PostgreSQL, 21 API tests, then HTTP smoke
npm run test:e2e:browser  # temporary PostgreSQL and the Chromium user workflows
```

`npm run test:e2e` remains an alias for `test:e2e:http`. Browser failures keep
screenshots, traces, video, and a Playwright HTML report under the ignored
`test-results/` and `playwright-report/` directories. The scenarios and their
isolation rules are documented in [tests/e2e/README.md](./tests/e2e/README.md).
The complete S0 evidence starts at
[docs/verification/s0-baseline.md](./docs/verification/s0-baseline.md).

### Focused development

Run the standalone static playground without API persistence with:

```sh
npm run dev:playground
```

Or run the API manually after configuring `apps/api/.env`:

```sh
npm run db:migrate
npm run build --workspace @lykar/admin
npm run dev:api
```

Then open `http://localhost:3000/admin/`; the development magic link appears in
the API terminal.
