import type {
  InsertPosition,
  OperationNodeReferenceV1,
  OperationV1,
  SerializedNode,
  TargetDescriptor,
  TargetEnvironment,
  TargetRegistrySnapshotV1,
} from '@lykar/protocol';

import { matchesSha256 } from './hash.js';
import {MutationJournal, preserveHostMutation, restored} from './mutation-journal.js';
import type {CompensationDiagnostic} from './mutation-journal.js';
import {
  LYKAR_NODE_ATTRIBUTE,
  LYKAR_OPERATION_ATTRIBUTE,
  ReplayLedger,
} from './replay-ledger.js';
import type {LedgerNodeHandle} from './replay-ledger.js';
import { resolveTarget } from './target-resolver.js';
import type { TargetResolution } from './target-resolver.js';
import type { OperationApplyResult, TargetStrategy } from './types.js';

const SAFE_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br',
  'button', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'dd', 'del', 'details',
  'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'i', 'img', 'input',
  'ins', 'kbd', 'label', 'legend', 'li', 'main', 'mark', 'menu', 'meter', 'nav', 'ol',
  'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'section', 'select', 'small', 'source', 'span', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time',
  'tr', 'u', 'ul', 'var', 'video', 'wbr',
]);

const URL_ATTRIBUTES = new Set([
  'action', 'formaction', 'href', 'poster', 'src', 'xlink:href',
]);
const ALLOWED_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const PROTECTED_TAGS = new Set(['html', 'head', 'body']);

class OperationExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperationExecutionError';
  }
}

export type ApplyOperationOptions = {
  root?: Document | Element;
  targetRegistry?: TargetRegistrySnapshotV1;
  projectId?: string;
  pageId?: string;
  targetEnvironment?: TargetEnvironment;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  ledger?: ReplayLedger;
  journal?: MutationJournal;
};

export async function applyOperation(
  document: Document,
  operation: OperationV1,
  options: ApplyOperationOptions = {},
): Promise<OperationApplyResult> {
  assertLifecycleActive(options);
  const resolvedTarget = await resolveOperationTarget(document, operation.target, options);
  assertLifecycleActive(options);
  if (!resolvedTarget.node) {
    return result(
      operation,
      'skipped',
      resolvedTarget.code,
      resolvedTarget.message,
      undefined,
      resolvedTarget.resolution,
    );
  }

  const target = resolvedTarget.node;
  const preconditionFailure = await checkPreconditions(document, operation, target, options);
  assertLifecycleActive(options);
  if (preconditionFailure) {
    return result(
      operation,
      'skipped',
      preconditionFailure.code,
      preconditionFailure.message,
      resolvedTarget.strategy,
      resolvedTarget.resolution,
    );
  }

  const checkpoint = options.journal?.checkpoint() ?? 0;
  try {
    switch (operation.kind) {
      case 'setText':
        applySetText(target, operation.value, operation.id, options.journal);
        break;
      case 'setStyle':
        applySetStyle(document, target, operation.property, operation.value, operation.priority ?? '', operation.id, options.journal);
        break;
      case 'setAttribute':
        applySetAttribute(target, operation.name, operation.value, operation.id, options.journal);
        break;
      case 'removeAttribute':
        applyRemoveAttribute(target, operation.name, operation.id, options.journal);
        break;
      case 'insertNode':
        if (
          options.ledger
            ? options.ledger.hasInsertion(operation.id)
            : hasOperationMarker(options.root ?? document, operation.id)
        ) {
          return result(
            operation,
            'skipped',
            'OPERATION_ALREADY_APPLIED',
            'An inserted node with this operation id already exists',
            resolvedTarget.strategy,
          );
        }
        applyInsertNode(document, target, operation.position, operation.node, operation.id, options.ledger, options.journal);
        break;
      case 'removeNode':
        assertMutableRoot(target, 'removed');
        applyRemoveNode(document, target, resolvedTarget.handle, operation.id, options.journal);
        break;
      case 'moveNode':
        await applyMoveNode(
          document,
          target,
          resolvedTarget.handle,
          operation.destination,
          operation.position,
          operation.id,
          options,
        );
        break;
    }

    return result(operation, 'applied', undefined, undefined, resolvedTarget.strategy, resolvedTarget.resolution);
  } catch (error) {
    const compensation = options.journal?.compensateFrom(checkpoint).at(-1);
    const code = error instanceof OperationExecutionError ? error.code : 'DOM_MUTATION_FAILED';
    return result(
      operation,
      'error',
      code,
      errorMessage(error),
      resolvedTarget.strategy,
      resolvedTarget.resolution,
      compensation,
    );
  }
}

type ResolvedOperationTarget = {
  node: Node | null;
  handle?: LedgerNodeHandle;
  strategy?: TargetStrategy;
  resolution?: TargetResolution;
  code?: string;
  message?: string;
};

async function resolveOperationTarget(
  document: Document,
  descriptor: TargetDescriptor,
  options: ApplyOperationOptions,
): Promise<ResolvedOperationTarget> {
  if (descriptor.nodeRef) {
    const handle = options.ledger?.resolve(descriptor.nodeRef);
    return handle
      ? {node: handle.node, handle, strategy: 'ledger'}
      : {
          node: null,
          code: 'NODE_REFERENCE_UNAVAILABLE',
          message: `Created node ${descriptor.nodeRef.operationId}:${(descriptor.nodeRef.path ?? []).join('.')} is unavailable`,
        };
  }

  const resolution = await resolveTarget(document, descriptor, resolutionOptions(options));
  return resolution.element
    ? {node: resolution.element, strategy: resolution.strategy, resolution}
    : {
        node: null,
        code: targetFailureCode('TARGET', resolution.status),
        message: describeResolution(resolution),
        resolution,
      };
}

async function checkPreconditions(
  document: Document,
  operation: OperationV1,
  target: Node,
  options: ApplyOperationOptions,
): Promise<{ code: string; message: string } | null> {
  const precondition = operation.precondition;
  if (!precondition) return null;

  if (precondition.parent) {
    const parent = await resolveOperationTarget(document, precondition.parent, options);
    if (!parent.node) {
      return {
        code: parent.resolution
          ? targetFailureCode('PARENT_PRECONDITION', parent.resolution.status)
          : 'PARENT_PRECONDITION_NOT_FOUND',
        message: parent.message ?? 'The expected parent is unavailable',
      };
    }
    if (target.parentNode !== parent.node) {
      return {
        code: 'PARENT_PRECONDITION_FAILED',
        message: 'The target no longer has the expected parent',
      };
    }
  }

  if (precondition.textHash) {
    try {
      if (!await matchesSha256(target.textContent ?? '', precondition.textHash)) {
        return {
          code: 'TEXT_PRECONDITION_FAILED',
          message: 'The target text no longer matches the expected hash',
        };
      }
    } catch (error) {
      return { code: 'TEXT_PRECONDITION_INVALID', message: errorMessage(error) };
    }
  }

  if (precondition.before?.textHash) {
    try {
      if (!await matchesSha256(target.textContent ?? '', precondition.before.textHash)) {
        return {
          code: 'BEFORE_TEXT_DRIFT',
          message: 'The target text no longer matches the captured before-state',
        };
      }
    } catch (error) {
      return { code: 'BEFORE_STATE_INVALID', message: errorMessage(error) };
    }
  }

  const expectedAttributes = precondition.before?.attributes;
  if (expectedAttributes && target.nodeType !== 1) {
    return {code: 'BEFORE_STATE_INVALID', message: 'Attribute before-state requires an element'};
  }
  for (const [name, expected] of Object.entries(expectedAttributes ?? {})) {
    if ((target as Element).getAttribute(name) !== expected) {
      return {
        code: 'BEFORE_ATTRIBUTE_DRIFT',
        message: `The target attribute ${name} no longer matches the captured before-state`,
      };
    }
  }

  const expectedStyles = precondition.before?.styles;
  if (expectedStyles) {
    const HTMLElementConstructor = document.defaultView?.HTMLElement;
    if (!HTMLElementConstructor || !(target instanceof HTMLElementConstructor)) {
      return { code: 'BEFORE_STATE_INVALID', message: 'Style before-state requires an HTML element' };
    }
    for (const [property, expected] of Object.entries(expectedStyles)) {
      if (target.style.getPropertyValue(normalizeStyleProperty(property) ?? property) !== expected) {
        return {
          code: 'BEFORE_STYLE_DRIFT',
          message: `The target style ${property} no longer matches the captured before-state`,
        };
      }
    }
  }

  return null;
}

function applySetText(target: Node, value: string, operationId: string, journal?: MutationJournal): void {
  if (target.nodeType !== 1 && target.nodeType !== 3) {
    throw new OperationExecutionError('UNSAFE_TEXT_TARGET', 'setText requires an element or text node');
  }
  if (target.nodeType === 1 && (target as Element).childElementCount > 0) {
    throw new OperationExecutionError(
      'UNSAFE_TEXT_TARGET',
      'setText refuses to replace an element that contains child elements',
    );
  }
  const before = target.textContent ?? '';
  try {
    target.textContent = value;
  } catch (error) {
    try { target.textContent = before; } catch { /* Report the original mutation failure. */ }
    throw error;
  }
  const after = target.textContent ?? '';
  journal?.record({
    operationId,
    mutation: 'setText',
    before: {text: before},
    after: {text: after},
    compensate: () => {
      if (target.textContent !== after) {
        return preserveHostMutation(operationId, 'Host changed text after Lykar; cleanup preserved the host value.');
      }
      target.textContent = before;
      return restored(operationId, 'Text restored to its pre-operation value.');
    },
  });
}

function applySetStyle(
  document: Document,
  target: Node,
  property: string,
  value: string,
  priority: '' | 'important',
  operationId: string,
  journal?: MutationJournal,
): void {
  const ElementConstructor = document.defaultView?.Element;
  const styleTarget = target as Element & {style?: CSSStyleDeclaration};
  if (!ElementConstructor || !(target instanceof ElementConstructor) || !styleTarget.style?.setProperty) {
    throw new OperationExecutionError('UNSUPPORTED_STYLE_TARGET', 'setStyle requires an element with inline CSS style');
  }
  const style = styleTarget.style;

  const normalizedProperty = normalizeStyleProperty(property);
  if (!normalizedProperty) {
    throw new OperationExecutionError('UNSAFE_STYLE_PROPERTY', `Unsafe CSS property: ${property}`);
  }
  if (/(?:expression\s*\(|javascript\s*:|-moz-binding)/i.test(value)) {
    throw new OperationExecutionError('UNSAFE_STYLE_VALUE', 'The CSS value contains an unsafe construct');
  }
  if (/!important\s*$/i.test(value)) {
    throw new OperationExecutionError('UNSAFE_STYLE_VALUE', 'Use setStyle.priority for !important');
  }
  if (value && !normalizedProperty.startsWith('--') && document.defaultView?.CSS?.supports
    && !document.defaultView.CSS.supports(normalizedProperty, value)) {
    throw new OperationExecutionError('UNSUPPORTED_STYLE_VALUE', `Browser rejected ${normalizedProperty}: ${value}`);
  }
  const probe = document.createElement('div').style;
  if (value) {
    probe.setProperty(normalizedProperty, value, priority);
    if (!probe.getPropertyValue(normalizedProperty) && !/\b(?:var|env)\s*\(/i.test(value)) {
      throw new OperationExecutionError('UNSUPPORTED_STYLE_VALUE', `Browser rejected ${normalizedProperty}: ${value}`);
    }
  }

  const before = style.getPropertyValue(normalizedProperty);
  const beforePriority = style.getPropertyPriority(normalizedProperty);
  const beforeCssText = style.cssText;
  try {
    style.setProperty(normalizedProperty, value, priority);
  } catch (error) {
    try { style.cssText = beforeCssText; } catch { /* Report the original mutation failure. */ }
    throw error;
  }
  const after = style.getPropertyValue(normalizedProperty);
  const afterPriority = style.getPropertyPriority(normalizedProperty);
  const normalizedValue = probe.getPropertyValue(normalizedProperty);
  if (value ? (!after || (normalizedValue && after !== normalizedValue) || afterPriority !== priority) : Boolean(after)) {
    try { style.cssText = beforeCssText; } catch { /* Report the rejected style value. */ }
    throw new OperationExecutionError('UNSUPPORTED_STYLE_VALUE', `Browser did not apply ${normalizedProperty}: ${value}`);
  }
  journal?.record({
    operationId,
    mutation: 'setStyle',
    before: {property: normalizedProperty, value: before, priority: beforePriority},
    after: {property: normalizedProperty, value: after, priority: afterPriority},
    compensate: () => {
      if (
        style.getPropertyValue(normalizedProperty) !== after
        || style.getPropertyPriority(normalizedProperty) !== afterPriority
      ) {
        return preserveHostMutation(operationId, `Host changed ${normalizedProperty} after Lykar; cleanup preserved it.`);
      }
      if (before) style.setProperty(normalizedProperty, before, beforePriority);
      else style.removeProperty(normalizedProperty);
      return restored(operationId, `Style ${normalizedProperty} restored.`);
    },
  });
}

function normalizeStyleProperty(property: string): string | null {
  const trimmed = property.trim();
  if (/^--[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;

  const kebab = trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
  return /^-?[a-z][a-z0-9-]*$/.test(kebab) ? kebab : null;
}

/** Static payload safety pass used before the first manifest mutation. */
export function assertOperationPayloadSafe(document: Document, operation: OperationV1): void {
  const detached = document.createElement('div');
  switch (operation.kind) {
    case 'setStyle':
      applySetStyle(document, detached, operation.property, operation.value, operation.priority ?? '', operation.id);
      break;
    case 'setAttribute':
      setSafeAttribute(detached, operation.name, operation.value);
      break;
    case 'removeAttribute':
      removeSafeAttribute(detached, operation.name);
      break;
    case 'insertNode':
      createSafeNode(document, operation.node, operation.id, []);
      break;
    case 'removeNode':
      if (staticallyTargetsDocumentRoot(operation.target)) {
        throw new OperationExecutionError('PROTECTED_DOCUMENT_NODE', 'Manifest attempts to remove a document root');
      }
      break;
    case 'moveNode':
      if (staticallyTargetsDocumentRoot(operation.target)) {
        throw new OperationExecutionError('PROTECTED_DOCUMENT_NODE', 'Manifest attempts to move a document root');
      }
      break;
    case 'setText':
      break;
  }
}

function staticallyTargetsDocumentRoot(target: TargetDescriptor): boolean {
  if (target.nodeRef || !target.selectors) return false;
  const css = target.selectors.css?.trim().toLowerCase();
  const xpath = target.selectors.xpath?.replace(/\s+/g, '').toLowerCase();
  return css === 'html' || css === 'head' || css === 'body' || css === ':root'
    || xpath === '/html' || xpath === '/html/head' || xpath === '/html/body'
    || xpath === '//html' || xpath === '//head' || xpath === '//body';
}

function applySetAttribute(
  target: Node,
  name: string,
  value: string,
  operationId: string,
  journal?: MutationJournal,
): void {
  if (target.nodeType !== 1) {
    throw new OperationExecutionError('UNSUPPORTED_ATTRIBUTE_TARGET', 'setAttribute requires an element');
  }
  const element = target as Element;
  const hadBefore = element.hasAttribute(name);
  const before = element.getAttribute(name);
  try {
    setSafeAttribute(element, name, value);
  } catch (error) {
    try {
      if (hadBefore) element.setAttribute(name, before ?? '');
      else element.removeAttribute(name);
    } catch { /* Report the original mutation failure. */ }
    throw error;
  }
  const after = element.getAttribute(name);
  journal?.record({
    operationId,
    mutation: 'setAttribute',
    before: {name, present: hadBefore, value: before},
    after: {name, present: true, value: after},
    compensate: () => {
      if (!element.hasAttribute(name) || element.getAttribute(name) !== after) {
        return preserveHostMutation(operationId, `Host changed attribute ${name} after Lykar; cleanup preserved it.`);
      }
      if (hadBefore) element.setAttribute(name, before ?? '');
      else element.removeAttribute(name);
      return restored(operationId, `Attribute ${name} restored.`);
    },
  });
}

function applyRemoveAttribute(
  target: Node,
  name: string,
  operationId: string,
  journal?: MutationJournal,
): void {
  if (target.nodeType !== 1) {
    throw new OperationExecutionError('UNSUPPORTED_ATTRIBUTE_TARGET', 'removeAttribute requires an element');
  }
  const element = target as Element;
  const hadBefore = element.hasAttribute(name);
  const before = element.getAttribute(name);
  try {
    removeSafeAttribute(element, name);
  } catch (error) {
    try { if (hadBefore) element.setAttribute(name, before ?? ''); } catch { /* Original error wins. */ }
    throw error;
  }
  journal?.record({
    operationId,
    mutation: 'removeAttribute',
    before: {name, present: hadBefore, value: before},
    after: {name, present: false, value: null},
    compensate: () => {
      if (element.hasAttribute(name)) {
        return preserveHostMutation(operationId, `Host restored attribute ${name}; cleanup preserved the host value.`);
      }
      if (hadBefore) element.setAttribute(name, before ?? '');
      return restored(operationId, `Attribute ${name} removal compensated.`);
    },
  });
}

function applyInsertNode(
  document: Document,
  target: Node,
  position: InsertPosition,
  serialized: SerializedNode,
  operationId: string,
  ledger?: ReplayLedger,
  journal?: MutationJournal,
): void {
  const handle = createSafeNode(document, serialized, operationId, [], ledger, true);
  const insertion = document.createDocumentFragment();
  if (handle.marker) insertion.appendChild(handle.marker);
  insertion.appendChild(handle.node);
  try {
    insertAt(target, insertion, position);
  } catch (error) {
    handle.marker?.remove();
    handle.node.parentNode?.removeChild(handle.node);
    ledger?.forgetOperation(operationId);
    throw error;
  }
  const afterSignature = nodeSignature(handle.node);
  journal?.record({
    operationId,
    mutation: 'insertNode',
    before: {connected: false},
    after: {connected: true, signature: afterSignature},
    compensate: () => {
      if (!handle.node.isConnected) return restored(operationId, 'Inserted node was already absent.');
      if (nodeSignature(handle.node) !== afterSignature || (handle.marker && handle.marker.nextSibling !== handle.node)) {
        return preserveHostMutation(operationId, 'Host changed the inserted node; cleanup left it in place.');
      }
      handle.marker?.remove();
      handle.node.parentNode?.removeChild(handle.node);
      ledger?.forgetOperation(operationId);
      return restored(operationId, 'Inserted node removed during compensation.');
    },
  });
}

function createSafeNode(
  document: Document,
  serialized: SerializedNode,
  operationId: string,
  path: number[],
  ledger?: ReplayLedger,
  rootInsertion = false,
): LedgerNodeHandle {
  const reference: OperationNodeReferenceV1 = {operationId, path};
  if (serialized.type === 'text') {
    const node = document.createTextNode(serialized.value);
    const marker = ledger?.markerForText(reference);
    return ledger?.register(reference, node, marker) ?? {identity: operationId, operationId, node};
  }

  const tag = serialized.tag.toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(tag) || !SAFE_TAGS.has(tag)) {
    throw new OperationExecutionError('UNSAFE_NODE_TAG', `Element <${serialized.tag}> is not allowed`);
  }

  const element = document.createElement(tag);
  if (ledger) ledger.markElement(reference, element, rootInsertion);
  else if (rootInsertion) element.setAttribute(LYKAR_OPERATION_ATTRIBUTE, operationId);
  for (const [name, value] of Object.entries(serialized.attributes ?? {})) {
    setSafeAttribute(element, name, value);
  }
  for (const [index, child] of (serialized.children ?? []).entries()) {
    const childHandle = createSafeNode(document, child, operationId, [...path, index], ledger);
    if (childHandle.marker) element.appendChild(childHandle.marker);
    element.appendChild(childHandle.node);
  }
  return ledger?.register(reference, element) ?? {identity: operationId, operationId, node: element};
}

function setSafeAttribute(element: Element, name: string, value: string): void {
  const normalizedName = name.toLowerCase();
  if (!/^[a-z_:][a-z0-9_.:-]*$/i.test(name)) {
    throw new OperationExecutionError('UNSAFE_NODE_ATTRIBUTE', `Attribute ${name} is invalid`);
  }
  if (
    normalizedName.startsWith('on')
    || normalizedName === 'style'
    || normalizedName === 'srcdoc'
    || normalizedName === 'srcset'
    || normalizedName === LYKAR_OPERATION_ATTRIBUTE
    || normalizedName === LYKAR_NODE_ATTRIBUTE
  ) {
    throw new OperationExecutionError('UNSAFE_NODE_ATTRIBUTE', `Attribute ${name} is not allowed`);
  }
  if (URL_ATTRIBUTES.has(normalizedName) && !isSafeUrl(value)) {
    throw new OperationExecutionError('UNSAFE_NODE_URL', `Attribute ${name} contains an unsafe URL`);
  }

  element.setAttribute(name, value);
}

function removeSafeAttribute(element: Element, name: string): void {
  const normalizedName = name.toLowerCase();
  if (!/^[a-z_:][a-z0-9_.:-]*$/i.test(name)) {
    throw new OperationExecutionError('UNSAFE_NODE_ATTRIBUTE', `Attribute ${name} is invalid`);
  }
  if (normalizedName === LYKAR_OPERATION_ATTRIBUTE || normalizedName === LYKAR_NODE_ATTRIBUTE) {
    throw new OperationExecutionError('UNSAFE_NODE_ATTRIBUTE', `Attribute ${name} is reserved by Lykar`);
  }
  element.removeAttribute(name);
}

function isSafeUrl(value: string): boolean {
  const compact = value.trim().replace(/[\u0000-\u0020]/g, '');
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  return !match || ALLOWED_URL_SCHEMES.has(match[1].toLowerCase());
}

async function applyMoveNode(
  document: Document,
  target: Node,
  targetHandle: LedgerNodeHandle | undefined,
  destinationDescriptor: Extract<OperationV1, {kind: 'moveNode'}>['destination'],
  position: InsertPosition,
  operationId: string,
  options: ApplyOperationOptions,
): Promise<void> {
  const destination = await resolveOperationTarget(document, destinationDescriptor, options);
  if (!destination.node) {
    throw new OperationExecutionError(
      destination.resolution
        ? targetFailureCode('DESTINATION', destination.resolution.status)
        : 'DESTINATION_NOT_FOUND',
      destination.message ?? 'Move destination is unavailable',
    );
  }
  if (
    destination.node === target
    || (target.nodeType === 1 && (target as Element).contains(destination.node))
  ) {
    throw new OperationExecutionError(
      'INVALID_MOVE_DESTINATION',
      'An element cannot be moved relative to itself or one of its descendants',
    );
  }

  assertMutableRoot(target, 'moved');
  assertInsertTarget(destination.node, position);
  const firstNode = targetHandle?.marker ?? target;
  const oldParent = firstNode.parentNode;
  const oldNext = target.nextSibling;
  if (!oldParent) throw new OperationExecutionError('TARGET_HAS_NO_PARENT', 'Target has no parent');
  const moved = document.createDocumentFragment();
  if (targetHandle?.marker) moved.appendChild(targetHandle.marker);
  moved.appendChild(target);
  try {
    insertAt(destination.node, moved, position);
  } catch (error) {
    try {
      const rollback = document.createDocumentFragment();
      if (targetHandle?.marker) rollback.appendChild(targetHandle.marker);
      rollback.appendChild(target);
      oldParent.insertBefore(rollback, oldNext);
    } catch { /* Original mutation error wins. */ }
    throw error;
  }
  const afterParent = (targetHandle?.marker ?? target).parentNode;
  const afterNext = target.nextSibling;
  options.journal?.record({
    operationId,
    mutation: 'moveNode',
    before: {parent: nodeLabel(oldParent), next: nodeLabel(oldNext)},
    after: {parent: nodeLabel(afterParent), next: nodeLabel(afterNext)},
    compensate: () => {
      const first = targetHandle?.marker ?? target;
      if (
        first.parentNode !== afterParent
        || target.nextSibling !== afterNext
        || (targetHandle?.marker && targetHandle.marker.nextSibling !== target)
      ) {
        return preserveHostMutation(operationId, 'Host moved the node after Lykar; cleanup preserved the host position.');
      }
      if (!oldParent.isConnected || (oldNext && oldNext.parentNode !== oldParent)) {
        return preserveHostMutation(operationId, 'Original move location is unavailable; reload is recommended.');
      }
      const fragment = document.createDocumentFragment();
      if (targetHandle?.marker) fragment.appendChild(targetHandle.marker);
      fragment.appendChild(target);
      oldParent.insertBefore(fragment, oldNext);
      return restored(operationId, 'Moved node restored to its original position.');
    },
  });
}

function applyRemoveNode(
  document: Document,
  target: Node,
  handle: LedgerNodeHandle | undefined,
  operationId: string,
  journal?: MutationJournal,
): void {
  const first = handle?.marker ?? target;
  const parent = first.parentNode;
  if (!parent) throw new OperationExecutionError('TARGET_HAS_NO_PARENT', 'Target has no parent');
  if (!journal) {
    handle?.marker?.remove();
    parent.removeChild(target);
    return;
  }
  const beforeSignature = nodeSignature(target);
  const placeholder = document.createComment(`lykar-removed:${operationId}`);
  try {
    parent.insertBefore(placeholder, first);
    handle?.marker?.remove();
    parent.removeChild(target);
  } catch (error) {
    try {
      const fragment = document.createDocumentFragment();
      if (handle?.marker) fragment.appendChild(handle.marker);
      if (!target.parentNode) fragment.appendChild(target);
      parent.insertBefore(fragment, placeholder.isConnected ? placeholder : null);
      placeholder.remove();
    } catch { /* Original mutation error wins. */ }
    throw error;
  }
  journal.record({
    operationId,
    mutation: 'removeNode',
    before: {parent: nodeLabel(parent), signature: beforeSignature},
    after: {connected: false},
    compensate: () => {
      if (!placeholder.isConnected || placeholder.parentNode !== parent || target.isConnected) {
        placeholder.remove();
        return preserveHostMutation(operationId, 'Removal anchor changed after Lykar; cleanup did not restore the node.');
      }
      if (nodeSignature(target) !== beforeSignature) {
        placeholder.remove();
        return preserveHostMutation(operationId, 'Detached node changed after Lykar; cleanup preserved the host-owned state.');
      }
      const fragment = document.createDocumentFragment();
      if (handle?.marker) fragment.appendChild(handle.marker);
      fragment.appendChild(target);
      parent.insertBefore(fragment, placeholder);
      placeholder.remove();
      return restored(operationId, 'Removed node restored at its owned anchor.');
    },
  });
}

function insertAt(target: Node, node: Node, position: InsertPosition): void {
  assertInsertTarget(target, position);
  switch (position) {
    case 'before':
      if (!target.parentNode) throw new OperationExecutionError('TARGET_HAS_NO_PARENT', 'Target has no parent');
      target.parentNode.insertBefore(node, target);
      break;
    case 'after':
      if (!target.parentNode) throw new OperationExecutionError('TARGET_HAS_NO_PARENT', 'Target has no parent');
      target.parentNode.insertBefore(node, target.nextSibling);
      break;
    case 'prepend':
      target.insertBefore(node, target.firstChild);
      break;
    case 'append':
      target.appendChild(node);
      break;
  }
}

function assertInsertTarget(target: Node, position: InsertPosition): void {
  if ((position === 'prepend' || position === 'append') && target.nodeType !== 1) {
    throw new OperationExecutionError('INVALID_INSERT_TARGET', `${position} requires an element target`);
  }
  if ((position === 'before' || position === 'after') && !target.parentNode) {
    throw new OperationExecutionError('TARGET_HAS_NO_PARENT', 'Target has no parent');
  }
}

function assertMutableRoot(target: Node, action: string): void {
  if (target.nodeType === 1 && PROTECTED_TAGS.has((target as Element).tagName.toLowerCase())) {
    throw new OperationExecutionError('PROTECTED_DOCUMENT_NODE', `<${(target as Element).tagName.toLowerCase()}> cannot be ${action}`);
  }
}

function hasOperationMarker(root: Document | Element, operationId: string): boolean {
  const candidates = root.nodeType === 1
    ? [root as Element, ...Array.from(root.querySelectorAll(`[${LYKAR_OPERATION_ATTRIBUTE}]`))]
    : Array.from(root.querySelectorAll(`[${LYKAR_OPERATION_ATTRIBUTE}]`));
  return candidates
    .some(element => element.getAttribute(LYKAR_OPERATION_ATTRIBUTE) === operationId);
}

function result(
  operation: OperationV1,
  status: OperationApplyResult['status'],
  code?: string,
  message?: string,
  targetStrategy?: TargetStrategy,
  resolution?: TargetResolution,
  compensation?: CompensationDiagnostic,
): OperationApplyResult {
  return {
    operationId: operation.id,
    kind: operation.kind,
    target: operation.target,
    status,
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(targetStrategy ? { targetStrategy } : {}),
    ...(resolution ? {
      targetResolution: resolution.status,
      resolutionEvidence: resolution.evidence,
    } : {}),
    ...(compensation ? {compensation} : {}),
  };
}

function nodeSignature(node: Node): string {
  if (node.nodeType === 1) return (node as Element).outerHTML;
  return `${node.nodeType}:${node.nodeValue ?? node.textContent ?? ''}`;
}

function nodeLabel(node: Node | null): string {
  if (!node) return 'null';
  if (node.nodeType === 9) return '#document';
  if (node.nodeType === 1) {
    const element = node as Element;
    return `<${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}>`;
  }
  return `#${node.nodeName.toLowerCase()}`;
}

function resolutionOptions(options: ApplyOperationOptions) {
  return {
    root: options.root,
    registry: options.targetRegistry,
    projectId: options.projectId,
    pageId: options.pageId,
    environment: options.targetEnvironment,
  };
}

function assertLifecycleActive(options: ApplyOperationOptions): void {
  if (options.signal?.aborted || options.isCurrent?.() === false) {
    const error = new Error('Runtime lifecycle generation is no longer current.');
    error.name = 'AbortError';
    throw error;
  }
}

function targetFailureCode(
  prefix: 'TARGET' | 'DESTINATION' | 'PARENT_PRECONDITION',
  status: TargetResolution['status'],
): string {
  if (status === 'unique') return `${prefix}_RESOLUTION_FAILED`;
  if (status === 'missing') return prefix === 'PARENT_PRECONDITION' ? `${prefix}_NOT_FOUND` : `${prefix}_NOT_FOUND`;
  return `${prefix}_${status.toUpperCase()}`;
}

function describeResolution(resolution: TargetResolution): string {
  const details = resolution.issues.length > 0 ? resolution.issues.join('; ') : resolution.evidence.reason;
  return `${resolution.status}: ${details}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
