# Architecture direction

The imported applications are the preserved baseline, not the final package
boundaries. Migration should remain incremental and keep the browser runtime
usable after every step.

## Core boundaries

- A command is an ephemeral editor action and may reference live DOM nodes.
- An operation is versioned, serializable data and never contains a DOM object.
- A change set is an ordered group of operations submitted by a human or agent.
- A release is an immutable, validated operation manifest.
- A draft is mutable working state based on one immutable release.

## Authentication boundary

The public project key embedded in a page is read-only and is not a secret.
Administrative credentials stay on the Lykar origin. The project-page bridge
previews DOM operations and communicates with the authenticated admin session;
it never receives a publishing credential.

## Migration rule

Do not move code out of `packages/lykar-lib` until its current behavior is
covered by executable tests. Shared operation schemas move into
`packages/protocol` first, followed by playback code in `packages/runtime` and
editor-only behavior in the bridge and UI packages.
