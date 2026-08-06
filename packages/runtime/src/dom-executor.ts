import type {
  InsertPosition,
  OperationV1,
  SerializedNode,
} from '@lykar/protocol';

import { matchesSha256 } from './hash.js';
import { resolveTarget } from './target-resolver.js';
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

export async function applyOperation(
  document: Document,
  operation: OperationV1,
): Promise<OperationApplyResult> {
  const targetResolution = await resolveTarget(document, operation.target);
  if (!targetResolution.element) {
    return result(operation, 'skipped', 'TARGET_NOT_FOUND', describeIssues(targetResolution.issues));
  }

  const target = targetResolution.element;
  const preconditionFailure = await checkPreconditions(document, operation, target);
  if (preconditionFailure) {
    return result(
      operation,
      'skipped',
      preconditionFailure.code,
      preconditionFailure.message,
      targetResolution.strategy,
    );
  }

  try {
    switch (operation.kind) {
      case 'setText':
        applySetText(target, operation.value);
        break;
      case 'setStyle':
        applySetStyle(document, target, operation.property, operation.value);
        break;
      case 'setAttribute':
        setSafeAttribute(target, operation.name, operation.value);
        break;
      case 'removeAttribute':
        removeSafeAttribute(target, operation.name);
        break;
      case 'insertNode':
        if (hasOperationMarker(document, operation.id)) {
          return result(
            operation,
            'skipped',
            'OPERATION_ALREADY_APPLIED',
            'An inserted node with this operation id already exists',
            targetResolution.strategy,
          );
        }
        applyInsertNode(document, target, operation.position, operation.node, operation.id);
        break;
      case 'removeNode':
        assertMutableRoot(target, 'removed');
        target.remove();
        break;
      case 'moveNode':
        await applyMoveNode(document, target, operation.destination, operation.position);
        break;
    }

    return result(operation, 'applied', undefined, undefined, targetResolution.strategy);
  } catch (error) {
    const code = error instanceof OperationExecutionError ? error.code : 'DOM_MUTATION_FAILED';
    return result(operation, 'error', code, errorMessage(error), targetResolution.strategy);
  }
}

async function checkPreconditions(
  document: Document,
  operation: OperationV1,
  target: Element,
): Promise<{ code: string; message: string } | null> {
  const precondition = operation.precondition;
  if (!precondition) return null;

  if (precondition.parent) {
    const parent = await resolveTarget(document, precondition.parent);
    if (!parent.element) {
      return {
        code: 'PARENT_PRECONDITION_NOT_FOUND',
        message: describeIssues(parent.issues),
      };
    }
    if (target.parentElement !== parent.element) {
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

  return null;
}

function applySetText(target: Element, value: string): void {
  if (target.childElementCount > 0) {
    throw new OperationExecutionError(
      'UNSAFE_TEXT_TARGET',
      'setText refuses to replace an element that contains child elements',
    );
  }
  target.textContent = value;
}

function applySetStyle(document: Document, target: Element, property: string, value: string): void {
  const HTMLElementConstructor = document.defaultView?.HTMLElement;
  if (!HTMLElementConstructor || !(target instanceof HTMLElementConstructor)) {
    throw new OperationExecutionError('UNSUPPORTED_STYLE_TARGET', 'setStyle requires an HTML element');
  }

  const normalizedProperty = normalizeStyleProperty(property);
  if (!normalizedProperty) {
    throw new OperationExecutionError('UNSAFE_STYLE_PROPERTY', `Unsafe CSS property: ${property}`);
  }
  if (/(?:expression\s*\(|javascript\s*:|-moz-binding)/i.test(value)) {
    throw new OperationExecutionError('UNSAFE_STYLE_VALUE', 'The CSS value contains an unsafe construct');
  }

  target.style.setProperty(normalizedProperty, value);
}

function normalizeStyleProperty(property: string): string | null {
  const trimmed = property.trim();
  if (/^--[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;

  const kebab = trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
  return /^-?[a-z][a-z0-9-]*$/.test(kebab) ? kebab : null;
}

function applyInsertNode(
  document: Document,
  target: Element,
  position: InsertPosition,
  serialized: SerializedNode,
  operationId: string,
): void {
  const node = createSafeNode(document, serialized);
  if (node.nodeType === 1) {
    (node as Element).setAttribute('data-lykar-operation-id', operationId);
  }
  insertAt(target, node, position);
}

function createSafeNode(document: Document, serialized: SerializedNode): Node {
  if (serialized.type === 'text') return document.createTextNode(serialized.value);

  const tag = serialized.tag.toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(tag) || !SAFE_TAGS.has(tag)) {
    throw new OperationExecutionError('UNSAFE_NODE_TAG', `Element <${serialized.tag}> is not allowed`);
  }

  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(serialized.attributes ?? {})) {
    setSafeAttribute(element, name, value);
  }
  for (const child of serialized.children ?? []) {
    element.appendChild(createSafeNode(document, child));
  }
  return element;
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
    || normalizedName === 'data-lykar-operation-id'
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
  if (normalizedName === 'data-lykar-operation-id') {
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
  target: Element,
  destinationDescriptor: Extract<OperationV1, { kind: 'moveNode' }>['destination'],
  position: InsertPosition,
): Promise<void> {
  const destination = await resolveTarget(document, destinationDescriptor);
  if (!destination.element) {
    throw new OperationExecutionError('DESTINATION_NOT_FOUND', describeIssues(destination.issues));
  }
  if (destination.element === target || target.contains(destination.element)) {
    throw new OperationExecutionError(
      'INVALID_MOVE_DESTINATION',
      'An element cannot be moved relative to itself or one of its descendants',
    );
  }

  assertMutableRoot(target, 'moved');
  insertAt(destination.element, target, position);
}

function insertAt(target: Element, node: Node, position: InsertPosition): void {
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

function assertMutableRoot(target: Element, action: string): void {
  if (PROTECTED_TAGS.has(target.tagName.toLowerCase())) {
    throw new OperationExecutionError('PROTECTED_DOCUMENT_NODE', `<${target.tagName.toLowerCase()}> cannot be ${action}`);
  }
}

function hasOperationMarker(document: Document, operationId: string): boolean {
  return Array.from(document.querySelectorAll('[data-lykar-operation-id]'))
    .some(element => element.getAttribute('data-lykar-operation-id') === operationId);
}

function result(
  operation: OperationV1,
  status: OperationApplyResult['status'],
  code?: string,
  message?: string,
  targetStrategy?: TargetStrategy,
): OperationApplyResult {
  return {
    operationId: operation.id,
    kind: operation.kind,
    status,
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(targetStrategy ? { targetStrategy } : {}),
  };
}

function describeIssues(issues: string[]): string {
  return issues.length > 0 ? issues.join('; ') : 'No target locator matched';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
