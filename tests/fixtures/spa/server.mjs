import {createElement} from 'react';
import {renderToString as renderReactToString} from 'react-dom/server';
import {createSSRApp} from 'vue';
import {renderToString as renderVueToString} from 'vue/server-renderer';
import {ReactFixtureApp} from './react-app.mjs';
import {makeVueFixtureApp} from './vue-app.mjs';
import {routeFromPath} from './shared.mjs';

export {routeFromPath};

export async function renderSpaFixture(pathname) {
  const route = routeFromPath(pathname);
  if (!route) return null;
  const markup = route.mode === 'ssr'
    ? route.framework === 'react'
      ? renderReactToString(createElement(ReactFixtureApp, {initialRoute: route}))
      : await renderVueToString(createSSRApp(makeVueFixtureApp(route)))
    : '';
  const script = route.framework === 'react' ? 'react-client.js' : 'vue-client.js';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
<title>S4 ${route.framework} ${route.mode} fixture</title>
<style>body{font:16px system-ui;margin:2rem}button,input{font:inherit;margin:.25rem;padding:.4rem}main{display:grid;gap:.4rem;max-width:50rem}p{margin:.3rem 0}</style>
</head>
<body>
<nav aria-label="Fixture controls"><button id="back" type="button">Back</button><button id="forward" type="button">Forward</button><button id="remount-root" type="button">Remount root</button></nav>
<div id="framework-root">${markup}</div>
<script src="/sdk.iife.js"></script>
<script type="module" src="/__e2e__/s4-assets/sdk-client.js"></script>
<script type="module" src="/__e2e__/s4-assets/${script}"></script>
</body></html>`;
}
