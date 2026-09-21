# SDK compatibility matrix

The SDK is the public integration boundary. Runtime and editor packages remain
available as lower-level entries for internal or staged migrations, but a host
page should not combine their globals with the SDK bootstrap.

| Entry point | Status in S1 | Compatibility boundary |
| --- | --- | --- |
| `dist/sdk.iife.js` with `data-lykar-project` | Supported | One script owns native/visitor/editor/share selection. |
| `import { Lykar } from '@lykar/sdk'` | Supported | Constructor is browser/SSR-safe; `start()` owns runtime work. |
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
  metadata and immutable versioned asset names.
- The browser SDK rejects a mixed manifest before editor code or DOM mutations,
  then enforces the manifest SHA-256 through the script `integrity` attribute.

S2 adds the PageSession lifecycle for static/SSR and host-controlled route/root
replacement: generation checks, abortable work, bounded target retry, cleanup,
and page/draft isolation. S4 remains responsible for framework adapters and
framework-specific remount behavior.
