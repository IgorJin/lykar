# @lykar/editor-bridge

Browser visual editor for one exact page. Pointer selection and overlay layers
are isolated from the host page; text, inline styles, attributes, insert,
duplicate, move, and delete are represented by protocol commands.

Panel input updates the DOM immediately as a safe local preview. **Применить**
does not mutate the page again: it sends only pending commands to the open
backend draft. Pending commands and an in-flight save envelope are written to
`sessionStorage` before the network request, scoped by project/page/draft.

```js
const capability = await exchangeEditorLaunch({ apiBaseUrl: 'http://localhost:3000' });

const editor = startEditor({
  capability,
  persistence: {
    apiBaseUrl: 'http://localhost:3000',
    draftId: 'draft-uuid-from-admin',
    expectedRevision: 0,
  },
});
```

Every save uses one generated idempotency key and an exact operation batch.
Network retry and reload reuse that key and payload until the server confirms
the result. If the response was lost after commit, the restored draft operation
IDs reconcile the batch without a duplicate. Edits made while a save is in
flight stay pending for the next save.

A stale revision opens an explicit conflict state. The editor preserves local
pending commands and does not silently rebase or overwrite the remote revision.
Only the user's **Загрузить revision и проверить** action accepts the latest
revision and allows a new idempotency key. Storage failure blocks the request;
offline/lost-response, authorization, and capability errors remain visible and
are never reported as a successful save.

The change tree keeps one block per command with its ID, replay result, and a
live `nodeElement` reference. Failed or skipped operations remain in the chain,
are highlighted in the UI, and expose their diagnostic reason. Hovering a
change highlights its target when that DOM node still exists.

Pending undo/redo compensates only DOM state still owned by the editor; a later
host mutation is preserved. Undo of an already saved command appends a new
pending operation with `revision.reason = "undo"` and a fresh ID. Manual repair
shows missing/ambiguous evidence and candidates, asks the user to select a new
element, then appends a `target-repair` revision and previews every dependent
operation before save. The failed command and old Releases are never rewritten.

Copy/add are static-page operations: sanitized markup is copied, while event
handlers, framework component state, and business logic are intentionally not
carried into the new node. Dummy proposals are schema-validated and summarized
before their explicit accept button can apply a local preview.

The built-in proposal provider is deterministic and never calls an AI API.
Real agent providers remain server-side so API keys never enter the browser.
