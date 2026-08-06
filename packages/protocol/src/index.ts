export const OPERATION_SCHEMA_VERSION = 1 as const;

export const OPERATION_KINDS = [
  'setText',
  'setStyle',
  'setAttribute',
  'removeAttribute',
  'insertNode',
  'removeNode',
  'moveNode',
] as const;

export type OperationKindV1 = typeof OPERATION_KINDS[number];
export type ActorType = 'human' | 'agent' | 'system';
export type InsertPosition = 'before' | 'after' | 'prepend' | 'append';

export type SelectorSet = {
  css?: string;
  xpath?: string;
};

export type TargetFingerprint = {
  tag?: string;
  textHash?: string;
  attributes?: Record<string, string>;
};

export type TargetDescriptor = {
  marker?: string;
  selectors?: SelectorSet;
  fingerprint?: TargetFingerprint;
};

export type OperationActor = {
  type: ActorType;
  id?: string;
};

export type OperationMeta = {
  createdAt: string;
  actor: OperationActor;
};

export type OperationPrecondition = {
  textHash?: string;
  parent?: TargetDescriptor;
};

export type SerializedElementNode = {
  type: 'element';
  tag: string;
  attributes?: Record<string, string>;
  children?: SerializedNode[];
};

export type SerializedTextNode = {
  type: 'text';
  value: string;
};

export type SerializedNode = SerializedElementNode | SerializedTextNode;

type OperationBaseV1 = {
  schemaVersion: typeof OPERATION_SCHEMA_VERSION;
  id: string;
  target: TargetDescriptor;
  meta?: OperationMeta;
  precondition?: OperationPrecondition;
};

export type SetTextOperationV1 = OperationBaseV1 & {
  kind: 'setText';
  value: string;
};

export type SetStyleOperationV1 = OperationBaseV1 & {
  kind: 'setStyle';
  property: string;
  value: string;
};

export type SetAttributeOperationV1 = OperationBaseV1 & {
  kind: 'setAttribute';
  name: string;
  value: string;
};

export type RemoveAttributeOperationV1 = OperationBaseV1 & {
  kind: 'removeAttribute';
  name: string;
};

export type InsertNodeOperationV1 = OperationBaseV1 & {
  kind: 'insertNode';
  position: InsertPosition;
  node: SerializedNode;
};

export type RemoveNodeOperationV1 = OperationBaseV1 & {
  kind: 'removeNode';
};

export type MoveNodeOperationV1 = OperationBaseV1 & {
  kind: 'moveNode';
  destination: TargetDescriptor;
  position: InsertPosition;
};

export type OperationV1 =
  | SetTextOperationV1
  | SetStyleOperationV1
  | SetAttributeOperationV1
  | RemoveAttributeOperationV1
  | InsertNodeOperationV1
  | RemoveNodeOperationV1
  | MoveNodeOperationV1;

export type OperationValidationResult =
  | { ok: true; value: OperationV1 }
  | { ok: false; errors: string[] };

export type PublishedManifestV1 = {
  schemaVersion: typeof OPERATION_SCHEMA_VERSION;
  projectId: string;
  pageId: string;
  pathname: string;
  releaseId: string;
  version: number;
  manifestHash: string;
  operations: OperationV1[];
  createdAt: string;
};

export type PublishedManifestValidationResult =
  | { ok: true; value: PublishedManifestV1 }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string');
}

function hasTargetLocator(target: Record<string, unknown>): boolean {
  if (isNonEmptyString(target.marker)) return true;
  if (!isRecord(target.selectors)) return false;

  return isNonEmptyString(target.selectors.css) || isNonEmptyString(target.selectors.xpath);
}

export function isTargetDescriptor(value: unknown): value is TargetDescriptor {
  if (!isRecord(value) || !hasTargetLocator(value)) return false;
  if (value.marker !== undefined && !isNonEmptyString(value.marker)) return false;

  if (value.selectors !== undefined && !isRecord(value.selectors)) return false;
  if (isRecord(value.selectors)) {
    if (value.selectors.css !== undefined && typeof value.selectors.css !== 'string') return false;
    if (value.selectors.xpath !== undefined && typeof value.selectors.xpath !== 'string') return false;
  }

  if (value.fingerprint !== undefined && !isRecord(value.fingerprint)) return false;
  if (isRecord(value.fingerprint)) {
    if (value.fingerprint.tag !== undefined && typeof value.fingerprint.tag !== 'string') return false;
    if (value.fingerprint.textHash !== undefined && typeof value.fingerprint.textHash !== 'string') return false;
    if (value.fingerprint.attributes !== undefined && !isStringRecord(value.fingerprint.attributes)) return false;
  }

  return true;
}

export function isSerializedNode(value: unknown): value is SerializedNode {
  if (!isRecord(value)) return false;

  if (value.type === 'text') {
    return typeof value.value === 'string';
  }

  if (value.type !== 'element' || !isNonEmptyString(value.tag)) return false;
  if (value.attributes !== undefined && !isStringRecord(value.attributes)) return false;
  if (value.children !== undefined) {
    if (!Array.isArray(value.children) || !value.children.every(isSerializedNode)) return false;
  }

  return true;
}

function isInsertPosition(value: unknown): value is InsertPosition {
  return value === 'before' || value === 'after' || value === 'prepend' || value === 'append';
}

function isMeta(value: unknown): value is OperationMeta {
  if (!isRecord(value) || !isNonEmptyString(value.createdAt) || !isRecord(value.actor)) return false;
  if (value.actor.type !== 'human' && value.actor.type !== 'agent' && value.actor.type !== 'system') return false;
  return value.actor.id === undefined || typeof value.actor.id === 'string';
}

function isPrecondition(value: unknown): value is OperationPrecondition {
  if (!isRecord(value)) return false;
  if (value.textHash !== undefined && typeof value.textHash !== 'string') return false;
  if (value.parent !== undefined && !isTargetDescriptor(value.parent)) return false;
  return true;
}

export function validateOperationV1(value: unknown): OperationValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) return { ok: false, errors: ['operation must be an object'] };
  if (value.schemaVersion !== OPERATION_SCHEMA_VERSION) errors.push('schemaVersion must be 1');
  if (!isNonEmptyString(value.id)) errors.push('id must be a non-empty string');
  if (!isTargetDescriptor(value.target)) errors.push('target must contain marker, css, or xpath');
  if (value.meta !== undefined && !isMeta(value.meta)) errors.push('meta is invalid');
  if (value.precondition !== undefined && !isPrecondition(value.precondition)) errors.push('precondition is invalid');

  switch (value.kind) {
    case 'setText':
      if (typeof value.value !== 'string') errors.push('setText.value must be a string');
      break;
    case 'setStyle':
      if (!isNonEmptyString(value.property)) errors.push('setStyle.property must be a non-empty string');
      if (typeof value.value !== 'string') errors.push('setStyle.value must be a string');
      break;
    case 'setAttribute':
      if (!isNonEmptyString(value.name)) errors.push('setAttribute.name must be a non-empty string');
      if (typeof value.value !== 'string') errors.push('setAttribute.value must be a string');
      break;
    case 'removeAttribute':
      if (!isNonEmptyString(value.name)) errors.push('removeAttribute.name must be a non-empty string');
      break;
    case 'insertNode':
      if (!isInsertPosition(value.position)) errors.push('insertNode.position is invalid');
      if (!isSerializedNode(value.node)) errors.push('insertNode.node is invalid');
      break;
    case 'removeNode':
      break;
    case 'moveNode':
      if (!isTargetDescriptor(value.destination)) errors.push('moveNode.destination is invalid');
      if (!isInsertPosition(value.position)) errors.push('moveNode.position is invalid');
      break;
    default:
      errors.push('kind is not supported by schema version 1');
  }

  return errors.length === 0
    ? { ok: true, value: value as OperationV1 }
    : { ok: false, errors };
}

export function parseOperationV1(value: unknown): OperationV1 {
  const result = validateOperationV1(value);

  if (!result.ok) {
    throw new Error(`Invalid Lykar operation: ${result.errors.join('; ')}`);
  }

  return result.value;
}

export function validatePublishedManifestV1(value: unknown): PublishedManifestValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ['manifest must be an object'] };

  const errors: string[] = [];
  if (value.schemaVersion !== OPERATION_SCHEMA_VERSION) errors.push('schemaVersion must be 1');
  if (!isNonEmptyString(value.projectId)) errors.push('projectId must be a non-empty string');
  if (!isNonEmptyString(value.pageId)) errors.push('pageId must be a non-empty string');
  if (!isNonEmptyString(value.pathname) || !(value.pathname as string).startsWith('/')) {
    errors.push('pathname must start with /');
  }
  if (!isNonEmptyString(value.releaseId)) errors.push('releaseId must be a non-empty string');
  if (!Number.isSafeInteger(value.version) || (value.version as number) <= 0) {
    errors.push('version must be a positive integer');
  }
  if (typeof value.manifestHash !== 'string' || !/^[0-9a-f]{64}$/i.test(value.manifestHash)) {
    errors.push('manifestHash must be a SHA-256 hex digest');
  }
  if (!isNonEmptyString(value.createdAt) || Number.isNaN(Date.parse(value.createdAt))) {
    errors.push('createdAt must be an ISO-compatible date string');
  }

  if (!Array.isArray(value.operations)) {
    errors.push('operations must be an array');
  } else {
    value.operations.forEach((operation, index) => {
      const result = validateOperationV1(operation);
      if (!result.ok) {
        errors.push(...result.errors.map(error => `operations[${index}]: ${error}`));
      }
    });
  }

  return errors.length === 0
    ? { ok: true, value: value as PublishedManifestV1 }
    : { ok: false, errors };
}

export function parsePublishedManifestV1(value: unknown): PublishedManifestV1 {
  const result = validatePublishedManifestV1(value);

  if (!result.ok) {
    throw new Error(`Invalid Lykar manifest: ${result.errors.join('; ')}`);
  }

  return result.value;
}
