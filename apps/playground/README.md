# Lykar playground

Static test site for real editor/runtime interaction. It contains `/` and
`/pricing`; each pathname maps to an independent backend page with its own
draft and immutable release sequence.

The recommended workflow starts the whole stack from the repository root:

```sh
npm run dev:e2e
```

Open <http://127.0.0.1:3000/admin/>, sign in as `owner@lykar.local`, select a
page, and click **Открыть редактор**. The playground exchanges the one-time
launch code, shows the overlay editor, previews commands locally, and persists
them only when **Применить** is pressed. After publishing in admin, a normal
playground load replays the active release.

The focused standalone server remains available for asset and UI work:

```sh
npm run dev --workspace @lykar/playground
```

It serves the fixed pages plus the built runtime/editor IIFEs, but a backend is
still required for capability exchange and release loading.
