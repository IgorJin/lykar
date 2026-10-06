# Lykar playground

Static test site for real editor/runtime interaction. It contains `/` and
`/pricing`; each pathname maps to an independent backend page with its own
draft and immutable release sequence.

The included React application is served at
<http://127.0.0.1:4173/__e2e__/s4-react-csr-a> (Alpha) and
<http://127.0.0.1:4173/__e2e__/s4-react-csr-b> (Beta). Its source is
`tests/fixtures/spa/react-app.mjs`. It provides routing, controlled inputs,
state-dependent buttons, rerendering and component remounting. The fixture
uses the React adapter from `@lykar/frameworks` and the same SDK/editor assets
as the normal playground.

To edit it, create/select a page in the local admin with the matching pathname
and click **Открыть редактор**. In the editor, the eye icon enables preview so
the React application's inputs and buttons receive their normal events.

The recommended workflow starts the whole stack from the repository root:

```sh
npm run dev:e2e
```

Open <http://127.0.0.1:3000/admin/>, sign in as `owner@lykar.local`, select a
page, and click **Открыть редактор**. The playground exchanges the one-time
launch code, shows the overlay editor, previews commands locally, and persists
them only when **Применить** is pressed. **Зафиксировать версию** creates an
immutable release without changing the normal playground URL. Use the
**Experiments** tab to map native/release variants, activate them, and create
public tokenized links.
An A/B link uses `#lykar_experiment`, keeps the assigned variant in a first-party
cookie for 30 days, and records exposure/conversion events only after analytics
consent is granted. The playground starts with consent pending; integrations can
call `window.Lykar.consent('granted')` after their consent UI receives approval.

The focused standalone server remains available for asset and UI work:

```sh
npm run dev --workspace @lykar/playground
```

It serves the fixed pages plus the built runtime/editor IIFEs, but a backend is
still required for capability exchange and release loading.
