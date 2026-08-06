# @lykar/editor-bridge

Browser-side visual editor for a single page. The bridge intercepts pointer
movement and page clicks, renders isolated overlay layers, and edits the
selected element through a Shadow DOM side panel.

```html
<script src="/editor.iife.js"></script>
<script>
  const editor = LykarEditor.start({
    onApply(draft, report) {
      // Local MVP: inspect or export. No backend request is made by the bridge.
      console.log(draft.page.pathname, draft.operations, report);
    },
  });
</script>
```

Changes in form fields do not touch the host page until **Применить** is
pressed. Applied batches support local undo and redo. `exportDraft()` returns
the exact `origin` and `pathname`, so every page has an independent operation
history.

The built-in proposal provider is deterministic and never calls an AI API.
Real agent providers will be server-side integrations; API keys must not be
embedded into the browser bundle.

`EditingCapability` is the client contract for the future admin-to-site
handshake. When supplied, its expiry and exact page URL are validated locally;
issuance and one-time exchange will be implemented on the API in the auth
phase.
