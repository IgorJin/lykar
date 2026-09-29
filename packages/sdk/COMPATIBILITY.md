# SDK compatibility matrix

The SDK is the public integration boundary. Runtime and editor packages remain
available as lower-level entries for internal or staged migrations, but a host
page should not combine their globals with the SDK bootstrap.

| Entry point | Status in S1 | Compatibility boundary |
| --- | --- | --- |
| `dist/sdk.iife.js` with `data-lykar-project` | Supported | One installed script owns native/visitor/editor/share selection; it SRI-loads `runtime-core.iife.js` for non-native modes. |
| `import { Lykar } from '@lykar/sdk'` | Supported | Constructor is browser/SSR-safe; the ESM bundle includes runtime code and needs no separately hosted runtime asset. |
| `import { init, track, consent } from '@lykar/sdk'` | Supported | Convenience facade over the active SDK instance. |
| `@lykar/runtime` direct import | Supported as lower-level entry | Caller owns version/variant selection and does not get lazy editor loading. |
| `@lykar/editor-bridge` direct import | Supported as lower-level entry | Caller must provide a validated capability and persistence context. |
| `window.Lykar` from `runtime.iife.js` | Legacy-compatible | Keep only for runtime-only integrations; do not load it beside `sdk.iife.js`. |
| Playground launch/share orchestration | Removed from host fixture | Use SDK URL/access bootstrap; playground keeps only UI callbacks. |

Version dimensions are intentionally separate:

- SDK/package version identifies the public artifact set.
- Protocol schema version identifies the operation/manifest wire format.
- Page Release version identifies immutable content selected by a visitor/share
  link.
- `dist/asset-manifest.json` records SDK/runtime/editor/protocol compatibility
  metadata and immutable versioned asset names for SDK, runtime core, and editor.
- The script SDK rejects a mixed manifest before dynamic runtime/editor code or
  DOM mutations, then enforces the manifest SHA-256 through the script
  `integrity` attribute. Runtime asset failure leaves the page native.
- Deploy `sdk.iife.js`, `runtime-core.iife.js`, `editor.iife.js`, and
  `asset-manifest.json` together. The npm ESM entry keeps runtime code bundled;
  editor mode still loads its verified asset.

S2 adds the PageSession lifecycle for static/SSR and host-controlled route/root
replacement: generation checks, abortable work, bounded target retry, cleanup,
and page/draft isolation. S4 adds automatic React/Vue boot instrumentation and
conditional text/style reconciliation; see the framework boundary below.


## S4 framework boundary

Use `@lykar/frameworks/build` once in esbuild or production Vite configuration,
then initialize the SDK normally. No component hooks, hand-authored target markers,
or business-state exports are required. React 19.2.8 and Vue 3.5.18 fixtures cover
CSR and ordinary non-streaming SSR/hydration. Framework dependencies are optional
and remain outside the static SDK bundle.

Format 2 conditions capture original plain text and a unique locator. The runtime
preserves host text-node identity during its writes and installs removable CSS
rules without changing host inline styles. The whole group deactivates when the
host text changes. Equal original labels cannot distinguish hidden business states.
Inline `!important` conflicts, ambiguous targets and unsupported structures fail
closed. CSS overlays require permission to create a stylesheet under the host CSP.
A competing author-important rule can still win the CSS cascade; this is not a
universal style override contract.

`pushState`, `replaceState` and `popstate` pathname changes rotate PageSession.
Rerenders do not create visits. `sdk.conditionalState` exposes live group states
and observer counters; `onConditionalDiagnostic` receives rejection/suspension
reasons. No LLM or network roundtrip is used in reconciliation.

Next.js, RSC, streaming/selective hydration, Vue 2, legacy React boot APIs,
portals, Shadow DOM, arbitrary structural framework edits, and Vite dev/HMR are
not covered. Late rule loading may show the original first frame. The prepaint
claim starts only after rules and a safe committed root are ready.
