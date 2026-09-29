import type {LocatorTargetDescriptor, TargetDescriptor} from '@lykar/protocol';
import type {TargetResolutionOptions} from './target-resolver.js';

/** Synchronous, conservative locator evaluation for an already validated manifest.
 * Text belongs to the source-state guard, never to the target's identity. */
export function resolveConditionalTarget(
  document: Document, target: TargetDescriptor, options: TargetResolutionOptions = {},
): Element | null {
  if (target.nodeRef) return null;
  let descriptor: LocatorTargetDescriptor = target;
  let root = options.root ?? document;
  if (target.binding) {
    const binding = options.registry?.bindings.find(value => value.targetId === target.binding!.targetId
      && value.bindingVersion === target.binding!.bindingVersion && value.environment === target.binding!.environment);
    const logical = options.registry?.targets.find(value => value.id === target.binding!.targetId);
    if (!binding || !logical || (options.environment && options.environment !== binding.environment)
      || (options.projectId && options.projectId !== logical.scope.projectId)
      || (options.pageId && options.pageId !== logical.scope.pageId)) return null;
    descriptor = binding.descriptor;
    if (logical.scope.root.kind === 'element') {
      const scoped = resolveLocators(document, logical.scope.root.descriptor, root);
      if (!scoped) return null;
      root = scoped;
    }
  }
  return resolveLocators(document, descriptor, root);
}

function resolveLocators(document: Document, target: LocatorTargetDescriptor, root: Document | Element): Element | null {
  if (target.fingerprint?.textHash) return null;
  const candidates = new Set<Element>();
  const accept = (element: Element) => {
    if (!element.isConnected || !(root === element || root.contains(element))) return;
    if (element.closest('[data-lykar-editor-root]')) return;
    const fingerprint = target.fingerprint;
    if (fingerprint?.tag && fingerprint.tag.toLowerCase() !== element.tagName.toLowerCase()) return;
    if (Object.entries(fingerprint?.attributes ?? {}).some(([key, value]) => element.getAttribute(key) !== value)) return;
    candidates.add(element);
  };
  try {
    if (target.marker) {
      if (root.nodeType === 1 && (root as Element).getAttribute('data-lykar-id') === target.marker) accept(root as Element);
      for (const element of root.querySelectorAll('[data-lykar-id]')) {
        if (element.getAttribute('data-lykar-id') === target.marker) accept(element);
      }
    }
    if (target.selectors?.css) {
      if (root.nodeType === 1 && (root as Element).matches(target.selectors.css)) accept(root as Element);
      for (const element of root.querySelectorAll(target.selectors.css)) accept(element);
    }
    if (target.selectors?.xpath) {
      const result = document.evaluate(target.selectors.xpath, root, null, 7, null);
      for (let index = 0; index < result.snapshotLength; index++) {
        const node = result.snapshotItem(index);
        if (node?.nodeType === 1) accept(node as Element);
      }
    }
  } catch { return null; }
  return candidates.size === 1 ? [...candidates][0] : null;
}
