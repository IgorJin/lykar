# Editor MVP decisions

## Page isolation

`Project` is the domain/origin container. Every exact normalized pathname is a
`Page`, and every page independently owns drafts, release numbering,
experiments, and share links. Query strings select access modes but do not
identify a second page. Migration 002 maps legacy project-level history to `/`.

## Editing flow

- The Preact admin and Fastify API use one origin.
- **Открыть редактор** creates a one-time launch code and opens the exact target
  page in a new tab; no iframe is required.
- The target page exchanges the code for a revocable page-bound editor session
  and removes the code from its URL.
- Side-panel fields execute local preview commands immediately; the page never
  becomes `contenteditable`.
- **Применить** appends pending commands to the backend draft using optimistic
  `expectedRevision` and captures an automatic source-DOM fingerprint.
- Pending commands are stored in `sessionStorage`; successful saves mark them
  committed without destroying local undo/diagnostics history.
- The change tree preserves `applied`, `skipped`, and `error` results. Replay
  continues after failures and reports the reason for each command.

## Authentication and sharing

Magic links are one-use and stored only as token hashes. The admin session is
an HttpOnly SameSite cookie. Membership is project-scoped and supports
`owner`, `admin`, `editor`, and `viewer`. A database constraint permits exactly
one active Owner while allowing multiple other members.

Owner and Admin manage invitations and releases, Editor changes drafts, and
Viewer is read-only. Invitation links are one-use, expire after seven days,
and create both the user membership and an admin session. Resending revokes the
previous link. Revoking membership or demoting a user to Viewer immediately
invalidates that user's editor launch codes and sessions. Ownership transfer
promotes the target and demotes the previous Owner to Admin.

An ordinary page URL never applies Lykar commands. A protected `?version=N`
preview needs an editor session or a revocable share session.
`/share/<opaque-token>` validates expiry/revocation, creates a one-use exchange
code, and redirects to the target page. Share access is pinned to one immutable
release and never exposes the editor panel.

## Experiments and source compatibility

Publishing freezes a draft into an immutable page-scoped release; it does not
change the host site. Every experiment contains exactly variants `A` and `B`.
A variant may reference a release or the native page. Only one experiment can
be active per page. The lifecycle is `draft -> active <-> paused -> completed`;
variants become immutable on first activation and completed experiments cannot
restart.

Active variants are opened with `?lykar_variant=<opaque-token>`. Tokens are
stored only as hashes and may be revoked. Missing, invalid, revoked, paused, or
completed tokens leave the native site untouched. Owner/Admin control lifecycle
and links; Editor may prepare draft experiments; Viewer is read-only.

Every release can store an immutable `lykar-dom-v1` snapshot captured before
base-release replay. The page-level hash is diagnostic: drift does not block an
otherwise compatible operation. Target fingerprints and preconditions decide
which individual commands are applied or reported as skipped. Raw HTML and
page text are never stored in the snapshot.

`Lykar.track(name, properties)` exists as a typed no-op marked
`EVENT_PIPELINE_NOT_IMPLEMENTED`. Exposure storage, anonymous assignment,
conversions, and analytics UI belong to a later phase.

Development TTLs are deliberately long (7-day login link, 180-day admin
session, 30-day editor session); production defaults are shorter.

## Agent proposals

The browser exposes a `ProposalProvider` contract. The MVP provider is a local
dummy. A future real provider runs on the server and submits proposals for
human confirmation; API keys are never shipped in the browser bundle.
