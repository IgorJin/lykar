import {createElement, Fragment, useLayoutEffect} from 'react';
import {createRoot as reactCreateRoot, hydrateRoot as reactHydrateRoot} from 'react-dom/client';
import {
  beginFrameworkRoot,
  commitFrameworkRoot,
  suspendFrameworkRoot,
  unmountFrameworkRoot,
} from './bridge.js';

export * from 'react-dom/client';

function CommitSignal({container, generation}) {
  useLayoutEffect(() => {
    commitFrameworkRoot(container, generation);
    return () => suspendFrameworkRoot(container, generation);
  }, [container, generation]);
  return null;
}

function withCommitSignal(node, container, generation) {
  return createElement(Fragment, null, node, createElement(CommitSignal, {container, generation}));
}

function instrumentRoot(root, container, mode) {
  const render = root.render.bind(root);
  const unmount = root.unmount.bind(root);
  let unmounted = false;
  root.render = node => {
    if (unmounted) return render(node);
    const generation = beginFrameworkRoot(container, 'react', mode);
    try {
      return render(withCommitSignal(node, container, generation));
    } catch (error) {
      unmountFrameworkRoot(container);
      throw error;
    }
  };
  root.unmount = () => {
    if (unmounted) return unmount();
    unmounted = true;
    unmountFrameworkRoot(container);
    return unmount();
  };
  return root;
}

export function createRoot(container, options) {
  const root = reactCreateRoot(container, options);
  beginFrameworkRoot(container, 'react', 'csr');
  return instrumentRoot(root, container, 'csr');
}

export function hydrateRoot(container, node, options) {
  const generation = beginFrameworkRoot(container, 'react', 'hydrate');
  try {
    return instrumentRoot(
      reactHydrateRoot(container, withCommitSignal(node, container, generation), options),
      container,
      'hydrate',
    );
  } catch (error) {
    unmountFrameworkRoot(container);
    throw error;
  }
}
