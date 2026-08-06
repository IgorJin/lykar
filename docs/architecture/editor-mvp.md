# Editor MVP decisions

## Page isolation

Every pathname is edited and versioned independently. The browser bridge emits
an `EditorPageDraft` containing exact `origin` and `pathname`; query strings do
not create a second page. The persistence phase will introduce page records so
drafts and release numbers belong to a page rather than the whole project.

## Editing flow

- The admin application will be a separate Preact project.
- **Edit site** opens the target page in a new tab.
- The target page runs a Shadow DOM side panel and isolated overlay layers.
- Text is edited only in the panel; the host page never becomes
  `contenteditable`.
- Styles are inline for the first MVP.
- Form changes remain buffered until **Применить**.
- The current bridge applies and exports locally; it never synchronizes with
  the backend.

## Authentication handshake

The first version has one owner authenticated by email. The admin session uses
an HttpOnly cookie. Because that cookie cannot be copied to an arbitrary site
domain, the admin requests a short-lived, one-time editing capability and opens
the target page with an exchange code. The bridge receives a page-bound editing
session after the code exchange. Capabilities expire and are constrained to a
project and exact page URL.

The active production release is public. Explicit historical versions require
an authenticated editor or a revocable, expiring share link. Drafts are never
public.

## Agent proposals

The browser defines a `ProposalProvider` contract. The MVP provider is a local,
deterministic dummy and makes no network request. Real agent calls will execute
on the server; API keys must never be shipped to the browser.
