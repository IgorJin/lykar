# Lykar Admin

Preact single-page admin served by the Fastify API at `/admin/` on the same
origin. The current MVP includes email login, projects, independent pages,
draft creation, editor launch, immutable release creation, weighted A/B
experiment lifecycle/links/reports, winner recording, and share create/revoke.

```sh
npm run build --workspace @lykar/admin
npm run dev:api
```

Use `npm run dev:admin` in a second terminal while changing the UI; the API
serves the rebuilt files from `apps/admin/dist`.
