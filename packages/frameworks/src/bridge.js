export const FRAMEWORK_ROOT_EVENT = 'lykar:framework-root';
export const FRAMEWORK_ROOTS_KEY = Symbol.for('@lykar/framework-roots/v1');

function registry() {
  if (typeof window === 'undefined') return undefined;
  return window[FRAMEWORK_ROOTS_KEY] ??= new Map();
}

function emit(entry) {
  window.dispatchEvent(new CustomEvent(FRAMEWORK_ROOT_EVENT, {detail: entry}));
}

export function beginFrameworkRoot(root, framework, mode) {
  const roots = registry();
  if (!roots) return 0;
  const generation = (roots.get(root)?.generation ?? 0) + 1;
  const entry = {root, framework, phase: 'pending', mode, generation};
  roots.set(root, entry);
  emit(entry);
  return generation;
}

export function commitFrameworkRoot(root, generation) {
  const roots = registry();
  const current = roots?.get(root);
  if (!current || current.generation !== generation || current.phase === 'ready') return;
  const entry = {...current, phase: 'ready'};
  roots.set(root, entry);
  emit(entry);
}

export function suspendFrameworkRoot(root, generation) {
  const roots = registry();
  const current = roots?.get(root);
  if (!current || current.generation !== generation || current.phase !== 'ready') return;
  const entry = {...current, phase: 'pending'};
  roots.set(root, entry);
  emit(entry);
}

export function unmountFrameworkRoot(root) {
  const roots = registry();
  const current = roots?.get(root);
  if (!current) return;
  roots.delete(root);
  emit({...current, phase: 'unmounted'});
}

export function frameworkRootsSnapshot() {
  return Array.from(registry()?.values() ?? []);
}
