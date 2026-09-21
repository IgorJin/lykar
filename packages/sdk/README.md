# @lykar/sdk

The stable browser entry point for Lykar. The SDK owns access-mode selection and
loads editor code only when an editor capability is present.

```ts
import {Lykar} from '@lykar/sdk';

const lykar = new Lykar({
  projectKey: 'pk_example',
  apiBaseUrl: 'https://api.example.com',
  delivery: 'links-only',
});

const result = await lykar.start();
```

Links-only pages stay native without a manifest request. Visitor, share, and
editor links select their access mode from the URL; editor assets are loaded
after a valid editor capability is exchanged.

For a one-script installation, use `dist/sdk.iife.js`:

```html
<script
  src="/sdk.iife.js"
  data-lykar-project="pk_example"
  data-lykar-api="https://api.example.com"
></script>
```

Deploy `sdk.iife.js`, `editor.iife.js`, and `asset-manifest.json` in the same
directory. The SDK derives both sibling URLs from its own script URL, validates
the exact SDK/runtime/editor/protocol compatibility set, and loads the editor
with the manifest's SHA-256 SRI value. npm users can override these locations
with `editorAssetUrl` and `assetManifestUrl` when both assets are hosted on the
allowed `editorAssetOrigin`.

See [COMPATIBILITY.md](./COMPATIBILITY.md) for the supported entry-point matrix
and version boundaries.

## PageSession lifecycle

Every SDK instance owns one generation-scoped `PageSession`. `start()` is
idempotent and concurrent calls share one replay. `refresh()` starts a new
generation for the same pathname/root, `navigate({ pathname, root })` retires
the previous page context, and `destroy()` is idempotent. Retiring a generation
aborts fetch/readiness/retry/editor work and synchronously runs registered
cleanup callbacks.

Async work checks generation immediately before DOM mutation, report/event
delivery, capability persistence, and editor bootstrap. A transport that ignores
abort may finish, but its result is returned as `PAGE_SESSION_STALE` and cannot
affect the new route. Replay and target lookup are confined to `root` (the
document by default). Editor pending changes remain keyed by page/draft and are
not adopted by a new session.

`PageSession` is exported for lifecycle adapters. Its
`registerJournalCleanup()` hook is the ownership boundary for the S2-03
mutation journal.
