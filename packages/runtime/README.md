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
`?lykar_variant=<opaque-token>` resolves one exact QA variant. A public
`?lykar_experiment=<opaque-token>` performs weighted A/B assignment and keeps it
stable for 30 days. Without one of these parameters runtime returns immediately
without fetching a manifest or changing the host DOM.

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

Target resolution is strict. It returns exactly one of `unique`, `missing`,
`ambiguous`, or `invalid`, together with per-locator evidence. Marker, CSS, and
XPath candidates are deduplicated and fingerprinted; mutation happens only
when their combined result identifies one element. Multiple matching CTAs are
`TARGET_AMBIGUOUS`—the runtime never selects the first candidate. Queries stay
inside the supplied logical root. Registry-backed descriptors resolve only the
exact environment and binding version frozen in the Release; legacy embedded
descriptors continue to work at document scope.

The runtime captures a normalized structural fingerprint before replay. A
page-level mismatch is reported as drift but does not block compatible targets;
per-operation target fingerprints decide local skips.

The clean baseline is cached before the first Lykar mutation and is never
replaced with the replayed DOM. Editor roots and operation-owned inserted nodes
are excluded from structural capture. The hash contains structure and selected
stable attributes, not raw HTML or full page text. Consequently CSS-only
changes cannot prove visual compatibility: reports explicitly expose
`basis: "structural"` and `visualStatus: "unknown"`. If a trustworthy clean
baseline is unavailable, compatibility is `unknown` instead of a false pass.

Ambiguous/failed results include the original target plus bounded candidate
evidence (tag, stable attributes, matching strategies). This data is safe for a
future manual-rebind UI without placing DOM references into serialized reports.

The SDK may provide a page/root lifecycle signal and generation predicate.
Runtime checks both after readiness/transport work and directly before every
mutation, report, or analytics event. `targetRetryMs` and
`targetRetryIntervalMs` enable a bounded, abortable retry for targets that appear
after initial DOM readiness; the default is no retry. A supplied `root` confines
all marker/CSS/XPath resolution and keeps release/baseline ownership separate
from other roots in the same document.

Experiment analytics is consent-gated. Assignment works while consent is
pending, but no event is transmitted until the host grants consent:

```js
await runtime.start();
await runtime.consent('granted'); // sends the pending exposure
await runtime.track('signup', { plan: 'pro' });
```

Only bounded scalar properties are accepted. Direct variant and protected
version links do not collect analytics.

Inserted markup is intentionally constrained. Script-capable tags, inline
event handlers, inline styles, `srcdoc`, and unsafe URL schemes are rejected.
