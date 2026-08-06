# Editor MVP decisions

## Page isolation

`Project` is the domain/origin container. Every exact normalized pathname is a
`Page`, and every page independently owns drafts, release numbering,
environments, rollback history, and share links. Query strings do not identify
a second page. Migration 002 maps legacy project-level history to `/`.

## Editing flow

- The Preact admin and Fastify API use one origin.
- **Открыть редактор** creates a one-time launch code and opens the exact target
  page in a new tab; no iframe is required.
- The target page exchanges the code for a revocable page-bound editor session
  and removes the code from its URL.
- Side-panel fields execute local preview commands immediately; the page never
  becomes `contenteditable`.
- **Применить** appends pending commands to the backend draft using optimistic
  `expectedRevision`.
- Pending commands are stored in `sessionStorage`; successful saves mark them
  committed without destroying local undo/diagnostics history.
- The change tree preserves `applied`, `skipped`, and `error` results. Replay
  continues after failures and reports the reason for each command.

## Authentication and sharing

Magic links are one-use and stored only as token hashes. The admin session is
an HttpOnly SameSite cookie. The schema supports `owner`, `editor`, and `viewer`
roles, while the MVP enforces one active project member.

The active production release is public. An explicit historical version needs
an editor session or a revocable share session. `/share/<opaque-token>` validates
expiry/revocation, creates a one-use exchange code, and redirects to the target
page. Share access is pinned to one immutable release and never exposes the
editor panel.

Development TTLs are deliberately long (7-day login link, 180-day admin
session, 30-day editor session); production defaults are shorter.

## Agent proposals

The browser exposes a `ProposalProvider` contract. The MVP provider is a local
dummy. A future real provider runs on the server and submits proposals for
human confirmation; API keys are never shipped in the browser bundle.
