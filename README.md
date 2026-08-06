# Lykar

Lykar is a platform for recording, reviewing, publishing, and replaying
versioned changes to static and server-rendered web pages.

This monorepo imports the histories of the original client and server projects.
The existing standalone repositories remain unchanged while the platform is
revived here.

## Repository layout

- `apps/api` — Fastify/PostgreSQL backend and same-origin admin host.
- `apps/admin` — Preact administration UI.
- `apps/playground` — full-stack interactive editor/runtime fixture.
- `packages/lykar-lib` — imported browser library and editor.
- `packages/protocol` — shared, serializable operation protocol.
- `packages/runtime` — public release playback runtime.
- `packages/editor-bridge` — DOM inspection and preview bridge.
- `packages/editor-ui` — editor interface.
- `packages/sdk` — integration entry points.
- `tests/fixtures` — static test sites.
- `tests/e2e` — end-to-end scenarios.

## Development

The repository uses npm workspaces and a single root lockfile.

```sh
npm install
npm run build
npm run typecheck
npm test
```

Run the complete local platform with one command:

```sh
npm run dev:e2e
```

It builds the browser bundles, starts a managed PostgreSQL cluster, applies the
migrations, seeds an idempotent `Northstar E2E` project, and starts the API,
admin, runtime, and playground. Open:

- admin: <http://127.0.0.1:3000/admin/>
- home fixture: <http://127.0.0.1:4173/>
- independent pricing fixture: <http://127.0.0.1:4173/pricing>

Use `owner@lykar.local` on the login screen. The development magic link is
printed in the same terminal. The managed database is kept in `.lykar/e2e`
between runs, while Ctrl+C stops all processes.

The command expects the PostgreSQL command-line tools (`initdb`, `pg_ctl`,
`psql`, and `createdb`). To use an existing server instead, set
`LYKAR_E2E_DATABASE_URL`.

Run the isolated end-to-end smoke test with:

```sh
npm run test:e2e
```

Smoke mode uses random ports and a temporary database cluster, exercises login
state, editor capability exchange, draft persistence, publishing, direct
version access, page isolation, and share access, then removes its database.

For focused work, run the standalone static playground with:

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
