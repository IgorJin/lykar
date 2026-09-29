# @lykar/sdk

The stable browser entry point for Lykar. The SDK owns access-mode selection.
The script build loads runtime code only for a visitor, share, experiment, or
editor selection; it loads editor code only for a valid editor capability.

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

Deploy `sdk.iife.js`, `runtime-core.iife.js`, `editor.iife.js`, and
`asset-manifest.json` in the same directory. The script build derives sibling
asset URLs from its own script URL. It verifies SDK/runtime/editor/protocol
compatibility and the runtime/editor SHA-256 SRI values before running those
assets. A missing, incompatible, blocked, or timed-out runtime asset leaves the
page native (`RUNTIME_ASSET_UNAVAILABLE`). An ordinary links-only native visit
does not request the manifest or runtime asset.

The npm ESM entry is self-contained for runtime work and is safe to import
during server rendering. It does not need a separately hosted runtime asset.
Editor mode still needs the lazy editor asset and manifest. An npm consumer can
configure `editorAssetUrl` and `assetManifestUrl`; the script build can also
set `runtimeAssetUrl`. Assets must be on the allowed `editorAssetOrigin`.

At the 2026-09-29 build, the initial `sdk.iife.js` is 28,495 bytes raw / 8,637
gzip (the 80 KB / 25 KB initial budget passes). The runtime asset adds 81,569
raw / 24,322 gzip when selected, so initial plus runtime is 110,064 raw /
32,959 gzip before the manifest, API responses, or editor asset. This split
reduces native-page transfer; it does not reduce total visitor transfer from
the former single SDK asset.

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


## React / Vue builds

Add the build adapter once; application components stay unchanged:

```ts
// vite.config.ts
import {defineConfig} from 'vite';
import {lykarVitePlugin} from '@lykar/frameworks/build';
export default defineConfig({plugins: [lykarVitePlugin()]});
```

For esbuild use `plugins: [lykarEsbuildPlugin()]` from the same entry.
Initialize `Lykar` as above and deploy the matching lazy script assets. The editor
captures the selected element's original text automatically and groups its text
and style edits. A `Continue` variant can display `Next` and navy; `Waiting`
remains native. Internal conditions with identical original text are not inferred.

See [COMPATIBILITY.md](./COMPATIBILITY.md) for tested versions, SSR boundaries,
style/CSP constraints and `conditionalState` diagnostics.
