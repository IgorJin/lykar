type Subscription = {listeners: Set<() => void>; stop: () => void};
const subscriptions = new WeakMap<Window, Subscription>();

/** Observe actual pathname transitions without requiring router-specific hooks. */
export function observeNavigation(window: Window, listener: () => void): () => void {
  let subscription = subscriptions.get(window);
  if (!subscription) {
    const listeners = new Set<() => void>();
    const notify = () => { for (const callback of [...listeners]) callback(); };
    const restores: Array<() => void> = [];
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = window.history[method];
      const own = Object.getOwnPropertyDescriptor(window.history, method);
      const wrapped: History[typeof method] = function (this: History, ...args) {
        original.apply(this, args);
        notify();
      };
      window.history[method] = wrapped;
      restores.push(() => {
        if (window.history[method] !== wrapped) return;
        if (own) Object.defineProperty(window.history, method, own);
        else delete (window.history as unknown as Record<string, unknown>)[method];
      });
    }
    window.addEventListener('popstate', notify);
    subscription = {listeners, stop: () => {
      window.removeEventListener('popstate', notify);
      for (const restore of restores) restore();
      subscriptions.delete(window);
    }};
    subscriptions.set(window, subscription);
  }
  subscription.listeners.add(listener);
  return () => {
    subscription!.listeners.delete(listener);
    if (subscription!.listeners.size === 0) subscription!.stop();
  };
}
