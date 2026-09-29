import {createElement} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {ReactFixtureApp} from './react-app.mjs';
import {routeFromPath} from './shared.mjs';

const route = routeFromPath(window.location.pathname);
if (!route || route.framework !== 'react') throw new Error('Invalid React fixture route');
const container = document.getElementById('framework-root');
let root = route.mode === 'ssr'
  ? hydrateRoot(container, createElement(ReactFixtureApp, {initialRoute: route}))
  : createRoot(container);
if (route.mode === 'csr') root.render(createElement(ReactFixtureApp, {initialRoute: route}));

document.getElementById('remount-root').addEventListener('click', () => {
  root.unmount();
  root = createRoot(container);
  root.render(createElement(ReactFixtureApp, {initialRoute: routeFromPath(window.location.pathname)}));
});

document.getElementById('back').addEventListener('click', () => history.back());
document.getElementById('forward').addEventListener('click', () => history.forward());
