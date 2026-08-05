# Lykar API

Fastify/PostgreSQL API for projects, drafts, immutable releases, rollback, and
public runtime manifests.

## Local setup

Copy `.env.example` to `.env`, provide a PostgreSQL connection string and a
long random `LYKAR_ADMIN_TOKEN`, then run from the monorepo root:

```sh
npm run db:migrate
npm run dev:api
```

All admin requests currently require the temporary
`X-Lykar-Admin-Token` header. It is a fail-closed bootstrap mechanism, not the
final browser authentication design. Public manifest reads require only the
read-only project key.

## Versioning endpoints

- `POST /api/admin/projects`
- `GET /api/admin/projects`
- `POST /api/admin/projects/:projectId/drafts`
- `GET /api/admin/projects/:projectId/drafts`
- `GET /api/admin/drafts/:draftId`
- `POST /api/admin/drafts/:draftId/operations`
- `POST /api/admin/drafts/:draftId/publish`
- `POST /api/admin/projects/:projectId/rollback`
- `GET /api/admin/projects/:projectId/releases`
- `GET /api/runtime/projects/:publicKey/manifest`

Appending operations and publishing require `expectedRevision`. A stale
revision returns `409 CONFLICT`; this prevents two editor tabs from silently
overwriting the same draft.

Publishing creates a complete immutable manifest and advances the selected
environment. Rollback only changes the environment pointer and records an
activation event; it never mutates a release.
