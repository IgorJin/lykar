# Lykar API

Fastify/PostgreSQL API for page-scoped drafts, immutable releases, editor
capabilities, and protected share previews.

## Local setup

Copy `.env.example` to `.env`, set `DATABASE_URL` and `LYKAR_OWNER_EMAIL`, then
run from the monorepo root:

```sh
npm run db:migrate
npm run build --workspace @lykar/admin
npm run dev:api
```

Open `http://localhost:3000/admin/`. Authentication is passwordless. In local
development the magic link is printed in the API terminal; production email is
connected through the `MagicLinkSender` adapter.

Admin and API share one origin. The admin session is an HttpOnly, SameSite
cookie. A one-time page-bound code is used when the admin opens an editor on a
different site origin; the admin cookie is never copied to that site.

## Main endpoints

- `POST /api/auth/magic-link`, `GET /api/auth/verify`, `GET /api/auth/session`
- `POST/GET /api/admin/projects`
- `POST/GET /api/admin/projects/:projectId/pages`
- `POST/GET /api/admin/pages/:pageId/drafts`
- `GET /api/admin/drafts/:draftId`
- `POST /api/admin/drafts/:draftId/operations`
- `POST /api/editor/drafts/:draftId/operations`
- `POST /api/admin/drafts/:draftId/publish`
- `POST /api/admin/pages/:pageId/rollback`
- `GET /api/admin/pages/:pageId/releases`
- `POST /api/admin/pages/:pageId/editor-launch`, `POST /api/editor/exchange`
- `POST/GET /api/admin/pages/:pageId/shares`, `DELETE /api/admin/shares/:shareId`
- `GET /share/:token`, `POST /api/share/exchange`
- `GET /api/runtime/projects/:publicKey/manifest?pathname=/pricing`

Release versions, drafts, environments, and rollback pointers belong to a
single page. Appending operations and publishing require `expectedRevision`;
stale writes return `409 CONFLICT`.

The active production release is public. Explicit `?version=N` requests require
a page-scoped editor session or a share session pinned to that exact immutable
release.
