# Installation configuration (SERVICE-V1-09)

The authenticated Admin endpoint `GET /api/admin/installation` returns the API
address and the exact script/runtime/editor/manifest URLs used by installation
instructions. It advertises no invented CDN or public npm registry.

Set `LYKAR_INSTALL_API_BASE_URL` when the externally reachable API differs from
`LYKAR_APP_ORIGIN`. Without that override the configured app origin is used;
request Host/forwarded headers never determine customer instructions.

For a released SDK set both:

```dotenv
LYKAR_SDK_RELEASE_VERSION=1.2.3
LYKAR_SDK_RELEASE_BASE_URL=https://assets.example.com/lykar/1.2.3/
```

These are configuration examples, not a deployed release. The release base must
be HTTPS, contain the exact version as a path segment and end in `/`. The endpoint
uses `sdk-1.2.3.iife.js`, `runtime-core-1.2.3.iife.js`, `editor-1.2.3.iife.js`, and
`asset-manifest.json` from that directory. Publish a complete immutable set from
the same SDK build, with CORS permission for manifest fetch and anonymous SRI
script loads. The SDK checks runtime/editor compatibility and SRI. The manifest
must be immutable together with the versioned binaries. This onboarding contract
does not publish assets, promote releases or prove CDN immutability/reachability;
SERVICE-V1-12 owns that pipeline and its external verification.

Without a configured release, production returns `status: unavailable`,
`assets: null`, `reason: RELEASE_ASSETS_NOT_CONFIGURED`. Admin presents an explicit
operator action and offers no install code. Partial or malformed release settings
fail server initialization. No development URLs are advertised in production.

Development with no release uses the API's `/lykar-assets/dev/` routes. These
routes serve only the four allowlisted files from `packages/sdk/dist`; they are
registered only in development and respond with `Cache-Control: no-store` and
CORS for cross-origin host pages. Missing builds return an unavailable config and
503 asset requests. Build `@lykar/sdk` before testing the installation flow.

`buildApp({installation: {apiBaseUrl, release: {version, baseUrl}}})` provides the
same contract programmatically. Register `installationRoutes` with `authService`,
`appOrigin`, `development`, and the optional `installation` object. The Admin
config endpoint requires a session; development files are anonymous.

React/Vue SDK/framework packages remain private workspaces. Consumer instructions
require the complete operator-supplied `npm pack` tarball set, including unavailable
transitives; they do not promise a public `npm install @lykar/sdk`. Supported
versions and browser-build boundaries match the SDK/framework READMEs. External
beta tarball delivery remains a SERVICE-V1-12 prerequisite.
