# @lykar/runtime

Framework-independent playback of immutable Lykar releases on static and
server-rendered pages. The first implementation deliberately targets pages
whose DOM is stable after `DOMContentLoaded`; SPA reconciliation is outside
this MVP.

## Script tag

Build the workspace and serve `dist/runtime.iife.js` from your CDN:

```html
<script src="https://cdn.example.com/runtime.iife.js"></script>
<script>
  Lykar.init('pk_your_public_project_key', {
    apiBaseUrl: 'https://api.example.com',
    onReport: report => console.info('Lykar release applied', report),
  });
</script>
```

The IIFE also supports the constructor-shaped integration planned for Lykar:

```js
const runtime = new Lykar('pk_your_public_project_key', {
  apiBaseUrl: 'https://api.example.com',
  // Explicit versions use an editor/share token returned by a one-time exchange.
  accessToken: previewAccess.token,
});
await runtime.start();
```

Runtime always sends the document pathname, so `/` and `/pricing` have separate
release numbers. When the host page has `?version=3`, runtime requests immutable
release 3 and requires page-bound editor/share access. A public
`?lykar_variant=<opaque-token>` resolves an active A/B variant. Without either
parameter runtime returns immediately without fetching a manifest or changing
the host DOM.

## ESM

```js
import { Lykar } from '@lykar/runtime';

const report = await new Lykar({
  projectKey: 'pk_your_public_project_key',
  apiBaseUrl: 'https://api.example.com',
}).start();
```

Every operation produces an `applied`, `skipped`, or `error` result. Replay is
sequential and normally continues after local failures; set `strict: true` to
stop after the first mutation error.

The runtime captures a normalized structural fingerprint before replay. A
page-level mismatch is reported as drift but does not block compatible targets;
per-operation target fingerprints decide local skips. `Lykar.track()` is a
typed placeholder and deliberately does not transmit events yet.

Inserted markup is intentionally constrained. Script-capable tags, inline
event handlers, inline styles, `srcdoc`, and unsafe URL schemes are rejected.
