# Lykar API

Fastify/PostgreSQL API for project memberships, page-scoped drafts, immutable
releases, A/B experiments, editor capabilities, and protected share previews.

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
connected through the `MagicLinkSender` adapter. To enable one-click owner login
for local work, set `LYKAR_DEV_AUTH=1` and bind the API to a loopback host. The
server refuses this mode in production, on non-loopback app origins, or when
`HOST` is exposed beyond loopback. Project invitation delivery uses the separate
`InvitationSender` adapter and is printed locally.

Admin and API share one origin. The admin session is an HttpOnly, SameSite
cookie. A one-time page-bound code is used when the admin opens an editor on a
different site origin; the admin cookie is never copied to that site.

## Main endpoints

- `POST /api/auth/magic-link`, `GET /api/auth/verify`, `GET /api/auth/session`
- `POST/GET /api/admin/projects`
- `GET /api/admin/projects/:projectId/members`
- `POST /api/admin/projects/:projectId/invitations`
- `POST /api/admin/invitations/:invitationId/resend`
- `DELETE /api/admin/invitations/:invitationId`
- `PATCH/DELETE /api/admin/projects/:projectId/members/:membershipId`
- `POST /api/admin/projects/:projectId/transfer-ownership`
- `GET /api/invitations/accept`
- `POST/GET /api/admin/projects/:projectId/pages`
- `POST/GET /api/admin/pages/:pageId/drafts`
- `GET /api/admin/drafts/:draftId`
- `POST /api/admin/drafts/:draftId/operations`
- `POST /api/editor/drafts/:draftId/operations`
- `POST /api/admin/drafts/:draftId/publish`
- `GET /api/admin/pages/:pageId/releases`
- `POST/GET /api/admin/pages/:pageId/experiments`
- `PATCH /api/admin/experiments/:experimentId/variants/:key`
- `POST /api/admin/experiments/:experimentId/(activate|pause|complete)`
- `POST /api/admin/experiments/:experimentId/links`
- `DELETE /api/admin/experiment-links/:linkId`
- `POST /api/admin/experiments/:experimentId/variants/:key/links`
- `DELETE /api/admin/variant-links/:linkId`
- `GET /api/admin/experiments/:experimentId/analytics`
- `POST /api/admin/pages/:pageId/editor-launch`, `POST /api/editor/exchange`
- `POST/GET /api/admin/pages/:pageId/shares`, `DELETE /api/admin/shares/:shareId`
- `GET /share/:token`, `POST /api/share/exchange`
- `GET /api/runtime/projects/:publicKey/manifest?pathname=/pricing`
- `POST /api/runtime/projects/:publicKey/experiments/resolve`
- `POST /api/runtime/analytics/events`

Release versions, drafts, and experiments belong to a single page. Appending
operations requires `idempotencyKey` and `expectedRevision`; freezing a release
requires `expectedRevision`. Stale writes return `409 REVISION_CONFLICT` and
are never rebased or applied as last-write-wins.

### Draft save contract

`POST /api/admin/drafts/:draftId/operations` and
`POST /api/editor/drafts/:draftId/operations` accept this save envelope:

```json
{
  "idempotencyKey": "client-generated-url-safe-key",
  "expectedRevision": 4,
  "operations": [],
  "sourceSnapshot": null
}
```

The key is scoped to the authenticated actor, project, and draft. The server
stores a canonical SHA-256 hash of `expectedRevision`, `operations`, and
`sourceSnapshot` together with the exact successful result. Retrying the same
key and payload returns that result with `replayed: true` and creates no second
operation. Reusing the key with a different payload returns
`409 IDEMPOTENCY_CONFLICT`.

The operation rows, draft revision, and saved result are committed in one
PostgreSQL transaction. Authorization is checked again on every retry, so a
stored result cannot bypass a revoked editor capability. Successful results
carry `operationIds`, `payloadHash`, `savedAt`, and `expiresAt`. They are retained
for at least 30 days; cleanup may remove an expired result only after its draft
is closed. Migration `009_draft_save_idempotency.sql` is forward-only and does
not rewrite existing operations or revisions.

Membership belongs to a project. `Owner` and `Admin` can freeze releases,
control experiments, share, and manage members; `Editor` can edit drafts and
prepare draft experiments; `Viewer` has read-only access. Each project has
exactly one active Owner. Ownership transfer promotes
the target and keeps the previous Owner as Admin. Demoting to Viewer or
revoking membership immediately invalidates outstanding editor launch codes
and sessions, while public share links remain independent.

Without `version` or a variant bearer token, the runtime manifest endpoint returns 204
and the host page stays native. Explicit `?version=N` requests require a
page-scoped editor/share session. Public experiment tokens resolve only while
their experiment is active; native variants return a typed null manifest. New
variant links put the bearer token in the URL fragment. The runtime sends it in
the `Authorization` header so it does not enter request URLs or access logs.

Weighted experiment entry links use `#lykar_experiment`. The runtime keeps a
random browser ID for 30 days, while PostgreSQL receives only its SHA-256 hash.
Event capabilities are bound to the issuing link and stop accepting new events
when that link is revoked or the experiment ends.
Analytics ingestion stores no URL, page content, or IP address. Schedule
`npm run analytics:prune --workspace lykar-lib-server` to enforce the default
90-day raw-event retention policy.
