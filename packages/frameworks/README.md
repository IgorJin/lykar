# Framework boot bridge

`@lykar/frameworks` connects an ordinary React or Vue application to the Lykar
SDK at the framework boot API. Add one build plugin and initialize the SDK once
in the browser entry. Existing application components need no Lykar imports,
markers, state bindings, or readiness callbacks.

## Install

For a React consumer:

```sh
npm install @lykar/sdk @lykar/frameworks react@19.2.8 react-dom@19.2.8
```

For a Vue consumer:

```sh
npm install @lykar/sdk @lykar/frameworks vue@3.5.18
```

These packages are private workspaces in this repository. Until they are
published, install their `npm pack` tarballs in the consumer. React and Vue are
optional peers of this bridge; install only the framework the consumer uses.

## Vite

Add the plugin to the existing `vite.config.js`:

```js
import {defineConfig} from 'vite';
import {lykarVitePlugin} from '@lykar/frameworks/build';

export default defineConfig({
  plugins: [lykarVitePlugin()],
});
```

Keep any existing React or Vue plugins in the same array. The bridge plugin
rewrites the application's existing imports of `react-dom/client` and `vue`;
the application's boot code continues to use `createRoot`, `hydrateRoot`,
`createApp`, or `createSSRApp` normally.

## esbuild

Add the plugin to the application's browser build:

```js
import {build} from 'esbuild';
import {lykarEsbuildPlugin} from '@lykar/frameworks/build';

await build({
  entryPoints: ['src/client.js'],
  outfile: 'dist/client.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  plugins: [lykarEsbuildPlugin()],
});
```

For a Vue esm-bundler build, also configure Vue's compile-time feature flags
according to the application's Vue build configuration.

Initialize the SDK once in browser code, independently of the framework boot:

```js
import {Lykar} from '@lykar/sdk';

const lykar = new Lykar({
  projectKey: 'your-project-key',
  apiBaseUrl: 'https://your-api.example',
  delivery: 'links-only',
});
void lykar.start();
```

For server rendering, render the same application with React or Vue's normal
server APIs and run the instrumented client build for hydration. The SDK starts
only in the browser. The boot bridge does not require changes to the rendered
components or server HTML.

## Readiness and state scope

The bridge stores the current root entries in
`window[Symbol.for('@lykar/framework-roots/v1')]`, a `Map` keyed by the root
element or document. It also dispatches `lykar:framework-root` events on
`window`. Each event's `detail` contains `root`, `framework`, `phase`, `mode`,
and `generation`. Phases are `pending`, `ready`, and `unmounted`.

React reports `ready` from a null component's layout effect after the root
commit. Vue reports `ready` after `app.mount()` returns, including
`createSSRApp` hydration. Unmount removes the root from the registry. DOM ready,
network idle, and a quiet DOM are not used as hydration proof. The boot event
certifies the ordinary root commit; later component state updates are observed
separately by Lykar's bounded runtime reconciliation.

Conditional text and style edits use the target element's **original plain
text** as the observable state. When the host renders a different original text
in that target, Lykar can select the corresponding saved text and style group.
An internal React/Vue state variable, a sibling element's text, or an arbitrary
JavaScript predicate is not exposed to Lykar. The editor only accepts targets
whose source text can be tracked safely; unsupported host mutations are refused.

## Tested boundary

- React 19.2.8 and Vue 3.5.18: client rendering and ordinary non-streaming
  SSR/hydration with an element root.
- esbuild 0.28.1: automatic browser import rewrite. Vite 8.2: packed-consumer
  production build rewrite. The Vite development server is not part of this
  evidence.
- Streaming or selective Suspense hydration, RSC, Next.js, document-level React
  hydration, boot APIs bypassing the build plugin, and roots created before the
  instrumented bundle runs need separate integration evidence.
- Applications must call their framework's normal `unmount` API when removing a
  root. The bridge follows that lifecycle and does not infer unmount from DOM
  removal.

API basis: [React createRoot](https://react.dev/reference/react-dom/client/createRoot),
[React hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot),
[React useLayoutEffect](https://react.dev/reference/react/useLayoutEffect),
[Vue application API](https://vuejs.org/api/application),
[Vue SSR guide](https://vuejs.org/guide/scaling-up/ssr),
[Vite plugins](https://vite.dev/guide/using-plugins.html), and
[esbuild plugins](https://esbuild.github.io/plugins/).
