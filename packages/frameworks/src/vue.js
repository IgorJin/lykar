import {createApp as vueCreateApp, createSSRApp as vueCreateSSRApp} from 'vue';
import {beginFrameworkRoot, commitFrameworkRoot, unmountFrameworkRoot} from './bridge.js';

export * from 'vue';

function instrumentApp(app, mode) {
  const mount = app.mount.bind(app);
  const unmount = app.unmount.bind(app);
  let root;
  let mounted = false;
  let hasMounted = false;
  app.mount = (container, ...args) => {
    if (hasMounted) return mount(container, ...args);
    root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!root) return mount(container, ...args);
    const generation = beginFrameworkRoot(root, 'vue', mode);
    try {
      const instance = mount(container, ...args);
      if (instance === undefined) {
        unmountFrameworkRoot(root);
        return instance;
      }
      mounted = true;
      hasMounted = true;
      commitFrameworkRoot(root, generation);
      return instance;
    } catch (error) {
      unmountFrameworkRoot(root);
      throw error;
    }
  };
  app.unmount = () => {
    if (mounted && root) unmountFrameworkRoot(root);
    mounted = false;
    return unmount();
  };
  return app;
}

export function createApp(...args) {
  return instrumentApp(vueCreateApp(...args), 'csr');
}

export function createSSRApp(...args) {
  return instrumentApp(vueCreateSSRApp(...args), 'hydrate');
}
