# Lykar API

Fastify/PostgreSQL API for project memberships, page-scoped drafts, immutable
releases, A/B experiments, editor capabilities, and protected share previews.

## Local setup

Copy `.env.example` to `.env`, set `DATABASE_URL` (and optionally `LYKAR_OWNER_EMAIL` for local login), then
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
- `GET /api/editor/drafts/:draftId` (draft-scoped capability)
- `POST /api/admin/drafts/:draftId/operations`
- `POST /api/editor/drafts/:draftId/operations`
- `POST /api/admin/drafts/:draftId/publish`
- `GET /api/admin/pages/:pageId/releases`
- `GET /api/admin/pages/:pageId/deployment`
- `GET /api/admin/pages/:pageId/deployment/activations?limit=50&beforeRevision=10`
- `POST /api/admin/pages/:pageId/deployment/(deploy|disable|rollback)`
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
- `GET /api/runtime/projects/:publicKey/deployment?pathname=/pricing` (verified `Origin` required)
- `POST /api/runtime/projects/:publicKey/experiments/resolve`
- `POST /api/runtime/analytics/events`

Release versions, drafts, and experiments belong to a single page. Appending
operations requires `idempotencyKey` and `expectedRevision`; freezing a release
requires `expectedRevision`. Stale writes return `409 REVISION_CONFLICT` and
are never rebased or applied as last-write-wins.

### Deployment contract

Migration `010_page_deployments.sql` adds explicit page activation. Existing sites
start with revision 0 and no active release. Publish and completing an experiment
never create an activation. SDK delivery and Admin controls are subsequent
SERVICE-V1-04/05 work; the legacy manifest endpoint still defaults to native.

Owner/Admin can POST this envelope to `deployment/deploy` or `deployment/rollback`:

```json
{
  "releaseId": "33333333-3333-4333-8333-333333333333",
  "expectedRevision": 0,
  "idempotencyKey": "client-generated-deployment-key",
  "reason": "Launch the reviewed version"
}
```

`disable` takes the same envelope with `releaseId` omitted or null. Rollback must
select a different, previously activated Release on the same Page. Each accepted
action appends a new immutable activation with actor/time/reason, previous and new
Release, and a monotonic revision. The latest activation is the active pointer;
there is no separate mutable pointer that could disagree with history.

Mutation response is `{deployment, replayed}`. Deployment contains `pageId`,
`revision`, `activeReleaseId`, and `activation` (null before first activation).
Concurrent requests are serialized on the Page. A stale revision yields
`409 DEPLOYMENT_REVISION_CONFLICT` with expected/actual revision. A retry with the
same actor/Page/key and normalized payload returns the original accepted result;
changing the payload yields `409 IDEMPOTENCY_CONFLICT`. Authorization is checked
on every retry, and membership is locked through commit. A historical retry does
not mean that its Release is still active: refresh GET state after a replayed
response. Idempotency records persist as activation history, without a TTL in
this slice; controlled deletion is future SERVICE-V1-15 work.

Members can GET deployment state/history. History is newest first, with default
limit 50, maximum 100, exclusive `beforeRevision`, and `nextBeforeRevision` for
the next page. Mutations use the existing session and same-origin CSRF guards.
Editor/Viewer cannot activate; public project keys and editor/share capabilities
do not grant administrative access.

The dedicated runtime GET accepts only `pathname` and a canonical HTTP(S) Origin.
It reads verified origin, current activation and immutable manifest in one database
snapshot. Valid Page/origin returns `{pageId, revision, activeReleaseId, manifest}`;
native/disabled has `manifest: null`. Unknown Page/project or unverified/mismatched
origin returns 204. Missing/malformed/noncanonical Origin, extra query selectors
or an Authorization header return 400. Verified responses expose ACAO only for that
origin. Use a simple cross-origin GET without credentials or custom headers;
private preview and experiment calls keep using their separate endpoints.

All deployment responses, including authorization errors and conflicts, use
`Cache-Control: no-store`; runtime also varies on Origin. The server does not cache
deployment decisions or announce changes to already open tabs. Public responses
contain no actor, reason, idempotency key or activation history. Domain verification
workflow, SDK refresh/failure behavior and real staging delivery remain later tasks.

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

### Draft base operations and repair

Draft detail responses expose `baseOperations` from the immutable, same-Page base
Release, separately from the Draft's `operations` delta. The editor imports both
as committed history and saves only new commands. Draft read access still uses
membership or a capability scoped to that exact open Draft.

Manual target repair appends a new operation with
`revision: {reason: 'target-repair', previousOperationId}`. The referenced command
must precede the repair and remain active, with the same kind/schema. Conditional
repairs preserve the condition, value, CSS property and priority and retarget the
whole effective group. Replay skips superseded commands; it does not rewrite an
existing Release or infer a new target automatically.

## Customer signup (SERVICE-V1-06)

`POST /api/auth/magic-link` accepts every valid normalized email with the same 202 response.
It creates an email-bound, hashed, expiring challenge. The user row is created/upserted
only when `GET /api/auth/verify` atomically consumes that challenge. Registration creates
no project or membership; the confirmed user starts with an empty site list and can
create a project as its owner. Concurrent signup and invitation acceptance converge on
the unique email identity. `LYKAR_OWNER_EMAIL` controls only local development login.

Apply migration `011_customer_signup.sql` before starting the new API. It retains
legacy user-bound login tokens and existing sessions; it does not backfill or recreate
users. Browser verification errors redirect to `/admin/?authError=invalid-link` without
the token; API clients continue to receive 401. Resend is another magic-link request;
each link remains individually one-use until expiry. Logout revokes the current session.

Production refuses local login and default/explicit console senders. The CLI also
refuses `LYKAR_MAGIC_LINK_FILE` in production. Both email sender adapters must be
provided before production startup; real provider integration is task 07. This stage
uses capture/file senders for tests, not real delivery. Request logs omit query strings
and redact share tokens. Console links are only a development convenience.

Request limits (3 per email, window still proposed) and free-tier provider quota failover
are planned in `tasks/SERVICE-V1/07-email-delivery.md`; they are not enabled by this stage.

## Email delivery (SERVICE-V1-07)

Apply migration `012_email_delivery.sql` through the normal migration command.
Without credentials, `LYKAR_EMAIL_MODE=disabled` returns a safe 503 for email
requests. For local testing use `LYKAR_EMAIL_MODE=file` and
`LYKAR_MAGIC_LINK_FILE=/absolute/private/path/emails.ndjson`, bound to loopback,
with non-production NODE_ENV. The capture file contains secret links, is created
with mode 0600, and must never be included in reports or committed. Use a new
private file; mode does not change permissions of an existing file.

Production requires provider mode, HTTPS app origin, PostgreSQL and a stable
`LYKAR_EMAIL_LIMIT_SECRET` of at least 32 characters shared by every process.
See `.env.example` for the ordered Resend/MailerSend configuration. API keys are
read from the named environment variables, never from the provider JSON. Missing
keys or malformed budgets stop startup. The example numbers and billing anchors
are examples, not assertions about current plans: verify limits, sender domain,
SPF/DKIM, billing reset and free-tier overage settings when connecting the account.
Disable link/open tracking on the Resend sender domain; MailerSend requests disable
tracking explicitly, so authentication links are not rewritten by these options.

Defaults: three requests per normalized email per rolling hour, at least 60 seconds
between requests; thirty per IP (login) or authenticated user (invitations) per hour.
Login and invitation recipient/actor budgets are separate. Known and new addresses
receive the same limiter response: 429 with Retry-After. Forwarded IP headers are
not trusted by default; behind a proxy the socket IP budget is shared. Configure a
trusted proxy boundary deliberately before changing this. Recipient and actor keys
are HMACs; email/IP are not stored in budget rows. Rotating the HMAC secret resets
these identities, so coordinate rotation. Limits are configurable by the four
LYKAR_EMAIL_REQUEST_* / LYKAR_EMAIL_ACTOR_MAX variables shown in the example.

Provider quotas include login and invitation attempts together. PostgreSQL
reservations are atomic across processes and survive restarts. Daily quota is a
conservative rolling 24 hours. Billing periods use an explicit UTC anchor and
calendar months (month-end clamping) or fixed `days` cycles. `reservedDaily` and
`reservedPeriod` permanently hold back capacity for safety/external sends. Provider
IDs must remain stable across restarts and all workers must share configuration;
renaming an ID starts a different counter. Local counters cannot observe sends
outside Lykar: use dedicated accounts or sufficient reserved headroom, monitor the
provider dashboard, and disable paid overages in the account. No automatic usage
synchronization is implemented.

The next configured provider is selected only before sending when local capacity
is exhausted. All exhausted means 503, never a false success. A provider error does
not trigger fallback, even on a definitive rejection. Timeout/network/5xx or lost
acceptance persistence yields EMAIL_DELIVERY_UNKNOWN; check the inbox before a
new explicit request. Attempts are not refunded. `accepted` means provider API
acceptance, not inbox delivery. Safe delivery IDs and status are stored in
`email_deliveries`; no recipients, link tokens, message bodies or API keys are
stored there. Provider response text is never returned or logged.

Stage 14 retry contract: preserve the server-issued delivery ID and message for
replay; accepted IDs are no-ops, pending/unknown IDs require reconciliation and
must not resend automatically. Rejected IDs do not retry automatically either.
An explicit new request gets a new ID after passing request limits. The current
ledger is not a queue and does not persist message payloads. Retention/cleanup of
expired inactive buckets and old deliveries belongs to the data lifecycle work.

Local verification uses fake provider HTTP responses, PostgreSQL and file captures;
no API key or real email is needed. Real inbox delivery and HTTPS staging acceptance
remain a separate gate when credentials and staging are available.

## Site ownership and connection checks (SERVICE-V1-08)

Migration `013_site_connection.sql` adds origin challenges and page-bound probes.
Creating a Project or adding an origin does not prove ownership. Deploy/Rollback
requires every configured origin to be verified; Disable remains available.
Runtime deployment resolution only serves the exact verified origin. Revoking
proof immediately removes that origin's eligibility on subsequent resolve requests;
open pages follow the existing deployment lifecycle. Releases/history are retained.
Re-verifying restores eligibility for the existing active deployment; it does not
create a new Release or activation.

Owner/Admin requests `POST /api/admin/projects/:projectId/origins/challenge`
with `{origin}` and receives a DNS TXT record name/value, challenge ID and token.
Add the exact TXT record at `_lykar-verification.<hostname>`, then POST
`/api/admin/projects/:projectId/origins/verify` with `{origin,challengeId,token}`.
Codes expire after 24 hours, are single-use and stored hashed. A new challenge
revokes older challenges without silently revoking an already verified origin.
`POST .../origins/revoke` with `{origin}` revokes proof, challenges and probes.
Proof is exact Project + origin (including scheme/port); no implicit subdomain or
wildcard trust. Verification is persistent until revoked, not continuous DNS monitoring.

Only public DNS names with HTTPS are accepted by the production verifier. It resolves
TXT via a server-owned resolver, with a 3s deadline and bounded records, and never
fetches the site's HTTP content or follows redirects. Private IP literals, exotic
IP syntax, credentials, paths, reserved/internal hostnames and wildcard origins are
rejected. DNS A/AAAA rebinding cannot route an HTTP verifier to a private service:
there is no HTTP verifier. Tests use controlled TXT responses, not live DNS changes.
DNS checks have a 5s per-challenge pause; TTL/deadline/freshness values here are
implementation defaults, not uptime or propagation guarantees.

`verify-local` is a separate explicit dev/test action for localhost/127.0.0.1/[::1].
The executable enables it only alongside non-production `LYKAR_DEV_AUTH=1`.
Production startup rejects `siteAllowLoopback`; APIs without this flag do not serve
deployments based on `local-development` proof, even if such rows exist in their DB.
The playground seed is restricted to non-production loopback and labels its proofs.

Connection evidence is separate from ownership and never grants it:

- GET `/api/admin/pages/:pageId/connection`: each origin's proof and latest probe.
- POST `.../connection/probes` with `{origin}`: Editor/Admin/Owner gets a two-minute
  nonce scoped to their user, Page and exact origin. Starting again replaces the old probe.
- Open the returned `pageUrl` and send `lykar:connection-check` using the protocol
  contract. Admin verifies popup source, origin, nonce and exact page URL. SDK only
  accepts the configured API origin and current page generation.
- POST `.../connection/probes/:probeId` with `{nonce,report}` or
  `{nonce,reason:'NO_SIGNAL'|'CANCELLED'}` consumes the probe exactly once. The
  server validates the same user/page/nonce and derives the diagnostic code.
- Reports omit query/hash, tokens, raw exceptions and assets URLs. The DB stores
  SDK version, API/assets/readiness/CSP evidence and server timestamps, not nonce or page URL.

The browser probe pings `/api/connection/ping` (anonymous, CORS `*`, no cookies or
private data), verifies/loads runtime and editor assets without starting an editor,
and checks supported framework readiness and observed enforcing CSP directives.
Codes include WRONG_PROJECT_KEY, API_UNAVAILABLE, RUNTIME_ASSET_UNAVAILABLE,
EDITOR_ASSET_UNAVAILABLE, CSP_BLOCKED, UNSUPPORTED_FRAMEWORK, READINESS_PENDING,
ASSETS_UNCHECKED, NO_SIGNAL. Missing/blocked SDK cannot identify itself: NO_SIGNAL
means inconclusive, not proven offline or proven missing. An old SDK or wrong
apiBaseUrl can also cause no response. Host scripts can forge their own advisory
report; only DNS proof is used for ownership/activation authorization.

Evidence older than 15 minutes is stale; no heartbeat and no online claim. A newer
pending check never reuses an older green result. UI shows when the check ran.
Recheck after site/CSP/SDK changes. Metadata retention belongs to SERVICE-V1-15.

### Onboarding / sitemap (SERVICE-V1-09)

Authenticated installation configuration and development asset routes are described
in [installation-config](../../docs/installation-config.md). Owners/Admins can add
and remove project origins (the last origin is retained) and import selected URLs
through `/api/admin/projects/:projectId/sitemap/preview` and `/sitemap/import`.
Imports recheck current origins in the transaction and deduplicate existing Pages.

Sitemap fetch supports public HTTPS UTF-8 urlset only: exact origin allowlist, pinned
public DNS, no redirects, compression or indexes, no DTD/custom entities. Resource
safety caps are 2 MiB, 10,000 entries and a 5-second total deadline; these are not
customer quotas or agreed SLA. Query/hash do not create a Page; existing pathname
normalization and encoded/case-sensitive path identity are preserved. All operations
retain a manual-page alternative.
