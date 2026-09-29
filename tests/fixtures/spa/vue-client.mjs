import {createApp, createSSRApp} from 'vue';
import {makeVueFixtureApp} from './vue-app.mjs';
import {routeFromPath} from './shared.mjs';

const route = routeFromPath(window.location.pathname);
if (!route || route.framework !== 'vue') throw new Error('Invalid Vue fixture route');
const container = document.getElementById('framework-root');
let app = route.mode === 'ssr'
  ? createSSRApp(makeVueFixtureApp(route))
  : createApp(makeVueFixtureApp(route));
app.mount(container);

document.getElementById('remount-root').addEventListener('click', () => {
  app.unmount();
  app = createApp(makeVueFixtureApp(routeFromPath(window.location.pathname)));
  app.mount(container);
});

document.getElementById('back').addEventListener('click', () => history.back());
document.getElementById('forward').addEventListener('click', () => history.forward());
