# Experiment delivery and analytics

## Scope

This phase turns direct variant previews into measurable A/B delivery while
preserving the core Lykar rule: an ordinary host URL without a Lykar token is
native and does not receive DOM mutations.

The phase includes:

- one public experiment-entry token that assigns either variant A or B;
- configurable weights with a 50/50 default;
- a 30-day sticky browser identity and assignment;
- automatic exposure events and explicit conversion events;
- privacy-minimal storage and idempotent event ingestion;
- an admin report with visitors, views, conversions, conversion rate, and
  uplift;
- an optional winner stored as experiment metadata only.

Direct `lykar_variant` links remain available for deterministic QA and sharing.
They do not participate in analytics.

## Confirmed product decisions

- Experiments always contain exactly variants `A` and `B`.
- Weights are configurable before first activation and must total 10,000 basis
  points. The default is 5,000/5,000.
- Releases and weights are immutable after the first activation.
- A browser keeps its assignment for 30 days using a first-party cookie with a
  `localStorage` fallback.
- Analytics storage never stores an IP address, full URL, query string, page
  HTML, page text, or DOM snapshot.
- Completing an experiment may store `A`, `B`, or no winner. It never applies a
  release to an ordinary URL.
- Raw events are retained for 90 days. Aggregate assignment state may outlive
  raw events so historic reports remain meaningful.

## URL modes

| Host URL | Runtime behaviour | Analytics |
| --- | --- | --- |
| `/pricing` | Native page; no manifest request | Disabled |
| `/pricing?lykar_variant=<token>` | Exact native or release variant | Disabled; QA only |
| `/pricing?lykar_experiment=<token>` | Weighted sticky A/B assignment | Exposure plus explicit conversions |
| `/pricing?version=N` | Protected immutable preview | Disabled; editor/share only |

Invalid, revoked, paused, completed, or path-mismatched experiment tokens leave
the host page native and do not create an assignment or analytics event.

## Browser identity and sticky assignment

The runtime creates an opaque random `lykar_anonymous_id` on the host origin.
It tries a cookie first:

```text
Path=/; Max-Age=2592000; SameSite=Lax; Secure (on HTTPS)
```

If cookies cannot be written, the same value is stored in `localStorage`. The
raw identifier stays in the browser. The API hashes it with SHA-256 and stores
only the resulting visitor key.

For a new visitor, the API hashes the experiment ID and visitor key into a
bucket from `0` through `9999`, applies the configured weights, and persists the
assignment. A uniqueness constraint on `(experiment_id, visitor_key)` makes the
decision stable across reloads and API races.

## Selection flow

1. Runtime reads `lykar_experiment` from the host URL.
2. Runtime obtains or creates the first-party anonymous ID.
3. Runtime posts the pathname, entry token, and anonymous ID to the selection
   endpoint. Tokens and visitor IDs are not placed in the API URL or access-log
   query string.
4. API validates the active experiment and exact page pathname, resolves the
   sticky assignment, and returns either a native selection or an immutable
   release manifest.
5. API also returns a signed, 30-day analytics capability limited to that
   assignment. The capability contains no visitor identifier.
6. Runtime applies the selected release, if any, and records an exposure only
   when analytics consent is granted.

Selection failure never blocks the host page and never falls back to a
different Lykar release.

## Consent

Analytics consent is `pending` by default. Assignment and DOM selection are
functional and remain independent of analytics delivery. Events are queued
only in memory while consent is pending and are discarded when consent is
denied.

The host integrates its consent manager through:

```ts
runtime.consent('granted');
await runtime.start();

await runtime.track('signup_completed', { plan: 'pro' });
```

The global IIFE API also exposes `Lykar.consent(...)` and `Lykar.track(...)` for
script-tag installations. A deployment that has another lawful consent model
may initialize the runtime with consent already granted.

## Event model

Two event types are persisted:

- `exposure`: emitted automatically after the assigned page is ready;
- `conversion`: emitted by `Lykar.track(name, properties)`.

Every event contains only:

- a client-generated event UUID used for idempotency;
- assignment, experiment, page, project, and variant foreign keys resolved on
  the server;
- event type and validated event name;
- optional bounded scalar properties supplied explicitly by the integrator;
- client occurrence time and server receipt time.

Property names that imply automatic page capture (`url`, `html`, `text`,
`selector`, and similar reserved keys) are rejected. Integrators must not send
personal data in custom properties.

The signed assignment capability is required for ingestion. It prevents a
caller from choosing another experiment or variant when submitting an event.
The client event UUID makes retries safe.

## Report semantics

For each variant the MVP report shows:

- `visitors`: distinct assignments with at least one exposure;
- `views`: all accepted exposure events;
- `uniqueConversions`: distinct exposed assignments with any conversion event;
- `conversions`: all accepted conversion events from exposed assignments;
- `conversionRate`: `uniqueConversions / visitors`;
- `uplift`: relative conversion-rate change compared with variant A.

The first report version is descriptive. Statistical significance, confidence
intervals, sequential testing, bot filtering, and sample-ratio-mismatch alerts
belong to the advanced experimentation phase.

## Data model

The analytics migration adds:

- `experiment_variants.weight_bps`;
- `experiments.winner_variant_key`;
- `experiment_links` for public weighted entry tokens;
- `experiment_assignments` for sticky visitor-to-variant decisions;
- `analytics_events` for idempotent raw exposures and conversions.

Assignments also retain aggregate exposure/conversion counters. The report reads
these counters, so pruning raw events does not rewrite historic metrics.

Only token hashes are stored. Variant-entry and experiment-entry tokens are
different capabilities and cannot be interchanged.

## Administrative permissions

- Owner/Admin: configure draft weights, activate/pause/complete, create or
  revoke experiment links, select a winner, and view reports.
- Editor: prepare a draft experiment and its variants/weights; cannot activate
  it or view analytics.
- Viewer: may view project structure but not visitor analytics in the MVP.

## Retention and deletion

Raw `analytics_events` older than 90 days are deleted by a scheduled retention
command. Assignments retain only the hashed visitor key and aggregate exposure
timestamps. Deleting a page or experiment cascades through links, assignments,
and events.

Revoking an experiment link stops new selection immediately. Pausing or
completing an experiment also makes every entry link unavailable without
deleting historic reports.

## Deferred work

- automatic URL-destination goals;
- cross-device identity;
- more than two variants;
- audience targeting and schedules;
- statistical significance and winner recommendations;
- warehouse export and third-party analytics integrations;
- configurable retention and data-subject deletion tooling.
