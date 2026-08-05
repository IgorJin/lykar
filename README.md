# Lykar

Lykar is a platform for recording, reviewing, publishing, and replaying
versioned changes to static and server-rendered web pages.

This monorepo imports the histories of the original client and server projects.
The existing standalone repositories remain unchanged while the platform is
revived here.

## Repository layout

- `apps/api` — imported backend service.
- `packages/lykar-lib` — imported browser library and editor.
- `packages/protocol` — shared, serializable operation protocol.
- `packages/runtime` — public release playback runtime.
- `packages/editor-bridge` — DOM inspection and preview bridge.
- `packages/editor-ui` — editor interface.
- `packages/sdk` — integration entry points.
- `tests/fixtures` — static test sites.
- `tests/e2e` — end-to-end scenarios.

The imported packages are intentionally kept intact at first. Their code will
be migrated incrementally into the new packages after baseline builds and tests
are restored.
