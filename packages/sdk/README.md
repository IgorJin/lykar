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

## Explicit deployment delivery

Set `delivery: 'deployment'` to resolve the active Release for ordinary visits.
The default `links-only` still leaves ordinary pages unchanged. Publish freezes a
Release; only the separate Deploy action selects it for visitors.

The SDK requests `GET /api/runtime/projects/:projectKey/deployment?pathname=...`
with `credentials: 'omit'` and `cache: 'no-store'`. The browser supplies Origin;
the API requires a verified project origin. No authorization token, editor asset,
assignment, exposure or conversion event is used for this delivery mode.

There is no shared SDK pointer cache or live push. Concurrent/repeated `start()`
calls share the same page generation. `refresh()`, navigation and a new page load
resolve the latest committed revision, first cleaning up the old generation.
Disable returns the original page; Rollback resolves the selected older Release.
Cleanup preserves newer host-owned changes. Report metadata is available as
`result.runtime.deployment` (`pageId`, `revision`, `activeReleaseId`).

Explicit editor/share/version/QA/experiment selection is isolated from deployment,
including empty, repeated, invalid and conflicting selectors. Native A remains
native. Invalid selection reports an access error without changing the host page
or falling back to the active deployment.

Deployment transport/validation failure returns native `DEPLOYMENT_UNAVAILABLE`;
no active pointer returns `NO_ACTIVE_DEPLOYMENT`. Failed or partial unconditional
replay compensates owned mutations and returns `DEPLOYMENT_APPLY_FAILED`, with
`runtime.report` when replay diagnostics exist. Conditional rules retain their
existing readiness/source-state semantics; inactive or not-yet-mounted targets
can become active later. The SDK does not hide the host page.

The existing defaults remain: network deadline 5000 ms, replay 2000 ms, lazy
runtime asset loading 10000 ms (in addition to asset-manifest resolution). These
are separate phase limits, not a combined delivery SLA. A finite positive
`networkTimeoutMs` overrides the network default; invalid values use the default.
The deadline covers response body reading and settles even if a custom fetch
ignores cancellation. A stale generation cannot apply its late response.
New service performance budgets remain subject to SERVICE-V1-02/18 agreement.

## Conversion setup and host consent

Choose one explicit event name for the draft experiment before its first launch
(for example `signup_completed`). The host must call `track` when that action
succeeds; installing the script does not automatically instrument clicks/forms.

```ts
const sdk = new Lykar({projectKey: 'pk_public', apiBaseUrl: 'https://api.example.com'});
await sdk.start();
// Connect these calls to the host consent manager's actual decision and updates.
await sdk.consent('granted');
await sdk.track('signup_completed', {plan: 'pro'}, {clientEventId: actionId});
// Withdrawal or a renewed consent decision stops subsequent analytics delivery.
await sdk.consent('denied');
// Use pending while the host is waiting for a new decision.
await sdk.consent('pending');
```

`actionId` is a UUID v4 created once for a successful action, then reused if
that action is retried or its response is lost. Different successful actions
need different IDs. Omitting it creates an ID for that call. The transport makes
at most two attempts using the same ID; calling `track` again without the
original ID is a new action. Await the result and check `accepted`.

Consent starts as `pending`. Pending/denied send no production exposure or
conversion. Consent set before or during lazy startup is retained across
refresh/navigation; `consent` returns a promise. Granting consent records the
pending exposure before a conversion, and repeated grants/refresh do not add
the same visit again. A real navigation starts a new visit. Initial
`analyticsConsent: 'granted'` is only appropriate when the host already has
that decision. The script API exposes the same awaitable `Lykar.consent` and
`Lykar.track` methods.

Open the temporary test link generated by analytics setup to verify the same
host integration. Its `#lykar_analytics_test=…` fragment is removed from the
address bar and retained only in the SDK instance. Test mode keeps the host
page native, creates no assignment, and sends no production event, even if an
experiment selector or deployment setting is present. Start/consent updates
send only the test token, pathname and consent to the isolated diagnostic
endpoint. With granted consent, ordinary `track('signup_completed')` sends the
name and action ID there; `accepted: true` means the endpoint confirmed receipt.
Pending/denied still block test events. Properties are omitted from test
requests. A failed, expired or mismatched test returns `EVENT_SEND_FAILED`;
navigation away from its original pathname returns `ANALYTICS_TEST_UNAVAILABLE`.
The setup screen separately explains no traffic, no consent, or no named event.

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

## Admin preview diagnostics

Authenticated explicit-version previews install a read-only `postMessage` report
bridge for their current PageSession. The request must come from the API/Admin
origin and match the Page and Release, with a bounded nonce. The reply contains
only IDs, operation kind/status/code, structural compatibility and check time;
capabilities, selectors, text and values are not sent. Ordinary deployment,
experiment traffic and native visits do not install this bridge.

Admin binds the report to the popup it opened, an allowed project origin, the
nonce and the selected Release. It labels absent reports as unchecked. The report
is advisory for that one preview: it is not server authorization, continuous
monitoring, CSS drift detection or a guarantee for every visitor. Known mutation
errors and missing targets block activation of that checked version in the panel.

EditorSession now owns replay of base Release commands and Draft commands together.
This lets manual repairs supersede a missing base target before replay, without a
second runtime applying stale commands underneath the editor. Imported base writes
are compensated when the editor is destroyed, preserving newer host/Draft writes.

## Explicit connection diagnostics

SERVICE-V1-08 adds a passive `lykar:connection-check` listener scoped to the
configured API origin and current pathname/generation. Ordinary visits perform
no diagnostic network calls. On a valid Admin popup challenge, the SDK checks
anonymous API connectivity, runtime/editor assets and CSP; it loads verified
bundles but does not start the editor or apply a manifest. Destroy/navigation
invalidates the listener and suppresses late reports. Reports contain no page
query/hash, capabilities or raw exception messages.

For a genuinely static page use `frameworkMode: 'static'`. Supported instrumented
React/Vue CSR and ordinary hydration use the existing framework-root readiness
registry; optional `frameworkMode: 'csr' | 'hydrated'` constrains the expected mode.
Without a declaration or instrumented ready root, readiness remains pending.
`streaming`/`rsc` are reported unsupported; this is not automatic detection of every
framework. Static mode is a caller declaration, not proof that no framework exists.

The report distinguishes API reachability, runtime/editor asset availability,
readiness and observed enforcing CSP connect/script/style restrictions. Report-only
CSP is not a failure. A blocked or absent SDK cannot respond: Admin reports the
check as inconclusive. Asset availability and a ready root do not prove that every
future edit or editor session will succeed. This diagnostic does not grant ownership.
