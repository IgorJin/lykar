/** Shared browser contract emitted by the optional build integration. No framework
 * code or dependency is imported into the static SDK/runtime bundles. */
export type FrameworkRoot = {
  root: Element | Document;
  framework: 'react' | 'vue';
  phase: 'pending' | 'ready' | 'unmounted';
  mode: 'csr' | 'hydrate';
  generation: number;
};

export const FRAMEWORK_ROOT_EVENT = 'lykar:framework-root';
const registryKey = Symbol.for('@lykar/framework-roots/v1');

export function frameworkRoots(document: Document): Map<Element | Document, FrameworkRoot> | undefined {
  const window = document.defaultView;
  return window ? (window as unknown as Record<symbol, Map<Element | Document, FrameworkRoot>>)[registryKey] : undefined;
}

export function frameworkRootFor(element: Element): FrameworkRoot | undefined {
  let found: FrameworkRoot | undefined;
  for (const entry of frameworkRoots(element.ownerDocument)?.values() ?? []) {
    if (entry.root === element || entry.root.contains(element)) {
      if (!found || found.root.contains(entry.root)) found = entry;
    }
  }
  return found;
}

/** Conditional manifests fail closed without the instrumented, committed root. */
export function isFrameworkTargetReady(element: Element): boolean {
  return element.isConnected && frameworkRootFor(element)?.phase === 'ready';
}

export function subscribeFrameworkRoots(document: Document, callback: () => void): () => void {
  document.defaultView?.addEventListener(FRAMEWORK_ROOT_EVENT, callback);
  return () => document.defaultView?.removeEventListener(FRAMEWORK_ROOT_EVENT, callback);
}
