# Lykar playground

Standalone static site for manual editor/runtime interaction. It contains `/`
and `/pricing`; every pathname creates an independent local editor draft.

```sh
npm run dev --workspace @lykar/playground
```

Open <http://127.0.0.1:4173>. The server exposes only the fixed playground
assets and the built editor IIFE.
