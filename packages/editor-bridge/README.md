# @lykar/editor-bridge

Browser visual editor for one exact page. Pointer selection and overlay layers
are isolated from the host page; text, inline styles, attributes, insert,
duplicate, move, and delete are represented by protocol commands.

Panel input updates the DOM immediately as a safe local preview. **Применить**
does not mutate the page again: it sends only pending commands to the open
backend draft. Pending commands are recoverable from `sessionStorage`.

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

The change tree keeps one block per command with its ID, replay result, and a
live `nodeElement` reference. Failed or skipped operations remain in the chain,
are highlighted in the UI, and expose their diagnostic reason. Hovering a
change highlights its target when that DOM node still exists.

The built-in proposal provider is deterministic and never calls an AI API.
Real agent providers remain server-side so API keys never enter the browser.
