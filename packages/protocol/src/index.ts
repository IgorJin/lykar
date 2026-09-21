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

export type LocatorTargetDescriptor = {
  marker?: string;
  selectors?: SelectorSet;
  fingerprint?: TargetFingerprint;
};

export const TARGET_REGISTRY_SCHEMA_VERSION = 1 as const;

export const TARGET_ENVIRONMENTS = [
  'production',
  'preview',
  'editor',
  'test',
] as const;

export type TargetEnvironment = typeof TARGET_ENVIRONMENTS[number];

export type TargetBindingReferenceV1 = {
  targetId: string;
  bindingVersion: number;
  environment: TargetEnvironment;
};

/**
 * Existing locator descriptors remain valid. New releases may additionally pin
 * the exact registry binding that supplied the embedded locator data.
 */
export type TargetDescriptor = LocatorTargetDescriptor & {
  binding?: TargetBindingReferenceV1;
};

export type TargetRootScopeV1 =
  | { id: string; kind: 'document' }
  | { id: string; kind: 'element'; descriptor: LocatorTargetDescriptor };

export type TargetScopeV1 = {
  projectId: string;
  pageId: string;
  root: TargetRootScopeV1;
};

export type LogicalTargetV1 = {
  id: string;
  scope: TargetScopeV1;
  createdAt: string;
};

export type TargetBindingV1 = TargetBindingReferenceV1 & {
  schemaVersion: typeof TARGET_REGISTRY_SCHEMA_VERSION;
  descriptor: LocatorTargetDescriptor;
  createdAt: string;
};

/** Immutable snapshot stored in a Release, never a pointer to latest binding. */
export type TargetRegistrySnapshotV1 = {
  schemaVersion: typeof TARGET_REGISTRY_SCHEMA_VERSION;
  targets: LogicalTargetV1[];
  bindings: TargetBindingV1[];
};

/** Persistence boundary; implementations must append bindings, not overwrite them. */
export interface TargetRegistryStoreV1 {
  getTarget(targetId: string): Promise<LogicalTargetV1 | null>;
  createTarget(target: LogicalTargetV1): Promise<void>;
  getBinding(reference: TargetBindingReferenceV1): Promise<TargetBindingV1 | null>;
  appendBinding(binding: TargetBindingV1): Promise<void>;
}

export type TargetRegistryValidationResult =
  | { ok: true; value: TargetRegistrySnapshotV1 }
  | { ok: false; errors: string[] };

export type AppendTargetBindingInputV1 = {
  targetId: string;
  environment: TargetEnvironment;
  descriptor: LocatorTargetDescriptor;
  createdAt: string;
};

export type AppendTargetBindingResultV1 = {
  snapshot: TargetRegistrySnapshotV1;
  reference: TargetBindingReferenceV1;
};

export type OperationActor = {
  type: ActorType;
  id?: string;
};

export type OperationMeta = {
  createdAt: string;
  actor: OperationActor;
};

export type TargetBeforeStateV1 = {
  textHash?: string;
  attributes?: Record<string, string | null>;
  styles?: Record<string, string>;
};

export type TargetDesiredStateV1 = {
  textHash?: string;
  attributes?: Record<string, string | null>;
  styles?: Record<string, string>;
};

export type OperationPrecondition = {
  /** @deprecated Use before.textHash for new operations. */
  textHash?: string;
  parent?: TargetDescriptor;
  before?: TargetBeforeStateV1;
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
  desiredState?: TargetDesiredStateV1;
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

export const SOURCE_SNAPSHOT_ALGORITHM = 'lykar-dom-v1' as const;

export type SourceSnapshotV1 = {
  algorithm: typeof SOURCE_SNAPSHOT_ALGORITHM;
  pageHash: string;
  capturedAt: string;
};

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
  sourceSnapshot?: SourceSnapshotV1;
  targetEnvironment?: TargetEnvironment;
  targetRegistry?: TargetRegistrySnapshotV1;
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

function isNullableStringRecord(value: unknown): value is Record<string, string | null> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string' || item === null);
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isTargetEnvironment(value: unknown): value is TargetEnvironment {
  return typeof value === 'string' && (TARGET_ENVIRONMENTS as readonly string[]).includes(value);
}

export function isSourceSnapshotV1(value: unknown): value is SourceSnapshotV1 {
  return isRecord(value)
    && value.algorithm === SOURCE_SNAPSHOT_ALGORITHM
    && typeof value.pageHash === 'string'
    && /^[0-9a-f]{64}$/i.test(value.pageHash)
    && isNonEmptyString(value.capturedAt)
    && !Number.isNaN(Date.parse(value.capturedAt));
}

function hasTargetLocator(target: Record<string, unknown>): boolean {
  if (isNonEmptyString(target.marker)) return true;
  if (!isRecord(target.selectors)) return false;

  return isNonEmptyString(target.selectors.css) || isNonEmptyString(target.selectors.xpath);
}

function isTargetBindingReference(value: unknown): value is TargetBindingReferenceV1 {
  return isRecord(value)
    && isNonEmptyString(value.targetId)
    && Number.isSafeInteger(value.bindingVersion)
    && (value.bindingVersion as number) > 0
    && isTargetEnvironment(value.environment);
}

function isLocatorTargetDescriptor(value: unknown): value is LocatorTargetDescriptor {
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

export function isTargetDescriptor(value: unknown): value is TargetDescriptor {
  if (!isRecord(value)) return false;
  if (!hasTargetLocator(value) && !isTargetBindingReference(value.binding)) return false;
  if (value.binding !== undefined && !isTargetBindingReference(value.binding)) return false;

  const locatorFieldsPresent = value.marker !== undefined
    || value.selectors !== undefined
    || value.fingerprint !== undefined;
  if (locatorFieldsPresent && !isLocatorTargetDescriptor(value)) return false;
  return true;
}

function validateTargetRoot(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !isNonEmptyString(value.id)) {
    errors.push(`${path} must have a non-empty id`);
    return;
  }
  if (value.kind === 'document') return;
  if (value.kind !== 'element') {
    errors.push(`${path}.kind must be document or element`);
    return;
  }
  if (!isLocatorTargetDescriptor(value.descriptor)) {
    errors.push(`${path}.descriptor must contain marker, css, or xpath`);
  }
}

export function validateTargetRegistryV1(value: unknown): TargetRegistryValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ['target registry must be an object'] };

  const errors: string[] = [];
  if (value.schemaVersion !== TARGET_REGISTRY_SCHEMA_VERSION) {
    errors.push('target registry schemaVersion must be 1');
  }
  if (!Array.isArray(value.targets)) errors.push('target registry targets must be an array');
  if (!Array.isArray(value.bindings)) errors.push('target registry bindings must be an array');

  const targetIds = new Set<string>();
  if (Array.isArray(value.targets)) {
    value.targets.forEach((target, index) => {
      const path = `targets[${index}]`;
      if (!isRecord(target)) {
        errors.push(`${path} must be an object`);
        return;
      }
      if (!isNonEmptyString(target.id)) errors.push(`${path}.id must be a non-empty string`);
      else if (targetIds.has(target.id)) errors.push(`${path}.id must be unique`);
      else targetIds.add(target.id);
      if (!isRecord(target.scope)) {
        errors.push(`${path}.scope must be an object`);
      } else {
        if (!isNonEmptyString(target.scope.projectId)) errors.push(`${path}.scope.projectId is required`);
        if (!isNonEmptyString(target.scope.pageId)) errors.push(`${path}.scope.pageId is required`);
        validateTargetRoot(target.scope.root, `${path}.scope.root`, errors);
      }
      if (!isIsoDate(target.createdAt)) errors.push(`${path}.createdAt must be an ISO-compatible date string`);
    });
  }

  const bindingKeys = new Set<string>();
  if (Array.isArray(value.bindings)) {
    value.bindings.forEach((binding, index) => {
      const path = `bindings[${index}]`;
      if (!isRecord(binding)) {
        errors.push(`${path} must be an object`);
        return;
      }
      const bindingRecord = binding as Record<string, unknown>;
      if (binding.schemaVersion !== TARGET_REGISTRY_SCHEMA_VERSION) {
        errors.push(`${path}.schemaVersion must be 1`);
      }
      if (!isTargetBindingReference(binding)) {
        errors.push(`${path} reference is invalid`);
      } else {
        const key = bindingKey(binding);
        if (bindingKeys.has(key)) errors.push(`${path} reference must be unique`);
        bindingKeys.add(key);
        if (!targetIds.has(binding.targetId)) errors.push(`${path}.targetId does not exist in targets`);
      }
      if (!isLocatorTargetDescriptor(bindingRecord.descriptor)) {
        errors.push(`${path}.descriptor must contain marker, css, or xpath`);
      }
      if (!isIsoDate(bindingRecord.createdAt)) errors.push(`${path}.createdAt must be an ISO-compatible date string`);
    });
  }

  return errors.length === 0
    ? { ok: true, value: value as TargetRegistrySnapshotV1 }
    : { ok: false, errors };
}

export function parseTargetRegistryV1(value: unknown): TargetRegistrySnapshotV1 {
  const result = validateTargetRegistryV1(value);
  if (!result.ok) throw new Error(`Invalid Lykar target registry: ${result.errors.join('; ')}`);
  return result.value;
}

export function appendTargetBindingV1(
  snapshotValue: TargetRegistrySnapshotV1,
  input: AppendTargetBindingInputV1,
): AppendTargetBindingResultV1 {
  const snapshot = parseTargetRegistryV1(snapshotValue);
  if (!snapshot.targets.some(target => target.id === input.targetId)) {
    throw new Error(`Cannot bind unknown logical target: ${input.targetId}`);
  }
  if (!isTargetEnvironment(input.environment)) throw new Error('Target binding environment is invalid');
  if (!isLocatorTargetDescriptor(input.descriptor)) throw new Error('Target binding descriptor is invalid');
  if (!isIsoDate(input.createdAt)) throw new Error('Target binding createdAt is invalid');

  const versions = snapshot.bindings
    .filter(binding => binding.targetId === input.targetId && binding.environment === input.environment)
    .map(binding => binding.bindingVersion);
  const bindingVersion = versions.length === 0 ? 1 : Math.max(...versions) + 1;
  const binding: TargetBindingV1 = {
    schemaVersion: TARGET_REGISTRY_SCHEMA_VERSION,
    targetId: input.targetId,
    bindingVersion,
    environment: input.environment,
    descriptor: structuredCloneValue(input.descriptor),
    createdAt: input.createdAt,
  };

  return {
    snapshot: {
      schemaVersion: snapshot.schemaVersion,
      targets: structuredCloneValue(snapshot.targets),
      bindings: [...structuredCloneValue(snapshot.bindings), binding],
    },
    reference: { targetId: input.targetId, bindingVersion, environment: input.environment },
  };
}

function structuredCloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bindingKey(reference: TargetBindingReferenceV1): string {
  return `${reference.targetId}\u0000${reference.environment}\u0000${reference.bindingVersion}`;
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
  if (value.before !== undefined && !isTargetState(value.before)) return false;
  return true;
}

function isTargetState(value: unknown): value is TargetBeforeStateV1 | TargetDesiredStateV1 {
  if (!isRecord(value)) return false;
  if (value.textHash !== undefined && typeof value.textHash !== 'string') return false;
  if (value.attributes !== undefined && !isNullableStringRecord(value.attributes)) return false;
  if (value.styles !== undefined && !isStringRecord(value.styles)) return false;
  return value.textHash !== undefined || value.attributes !== undefined || value.styles !== undefined;
}

export function validateOperationV1(value: unknown): OperationValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) return { ok: false, errors: ['operation must be an object'] };
  if (value.schemaVersion !== OPERATION_SCHEMA_VERSION) errors.push('schemaVersion must be 1');
  if (!isNonEmptyString(value.id)) errors.push('id must be a non-empty string');
  if (!isTargetDescriptor(value.target)) errors.push('target must contain marker, css, or xpath');
  if (value.meta !== undefined && !isMeta(value.meta)) errors.push('meta is invalid');
  if (value.precondition !== undefined && !isPrecondition(value.precondition)) errors.push('precondition is invalid');
  if (value.desiredState !== undefined && !isTargetState(value.desiredState)) errors.push('desiredState is invalid');

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
  if (value.sourceSnapshot !== undefined && !isSourceSnapshotV1(value.sourceSnapshot)) {
    errors.push('sourceSnapshot is invalid');
  }
  if (value.targetEnvironment !== undefined && !isTargetEnvironment(value.targetEnvironment)) {
    errors.push('targetEnvironment is invalid');
  }
  if ((value.targetEnvironment === undefined) !== (value.targetRegistry === undefined)) {
    errors.push('targetEnvironment and targetRegistry must be provided together');
  }

  let registry: TargetRegistrySnapshotV1 | undefined;
  if (value.targetRegistry !== undefined) {
    const result = validateTargetRegistryV1(value.targetRegistry);
    if (!result.ok) {
      errors.push(...result.errors.map(error => `targetRegistry: ${error}`));
    } else {
      registry = result.value;
      for (const target of registry.targets) {
        if (target.scope.projectId !== value.projectId || target.scope.pageId !== value.pageId) {
          errors.push(`targetRegistry target ${target.id} is outside the manifest project/page scope`);
        }
      }
      if (registry.bindings.some(binding => binding.environment !== value.targetEnvironment)) {
        errors.push('targetRegistry bindings must all match targetEnvironment');
      }
    }
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
      } else {
        for (const descriptor of operationTargets(result.value)) {
          if (!descriptor.binding) continue;
          if (!registry) {
            errors.push(`operations[${index}]: target binding requires targetRegistry`);
            continue;
          }
          if (descriptor.binding.environment !== value.targetEnvironment) {
            errors.push(`operations[${index}]: target binding environment does not match targetEnvironment`);
          }
          if (!registry.bindings.some(binding => bindingKey(binding) === bindingKey(descriptor.binding!))) {
            errors.push(`operations[${index}]: target binding is not frozen in targetRegistry`);
          }
        }
      }
    });
  }

  return errors.length === 0
    ? { ok: true, value: value as PublishedManifestV1 }
    : { ok: false, errors };
}

function operationTargets(operation: OperationV1): TargetDescriptor[] {
  const targets = [operation.target];
  if (operation.precondition?.parent) targets.push(operation.precondition.parent);
  if (operation.kind === 'moveNode') targets.push(operation.destination);
  return targets;
}

export function parsePublishedManifestV1(value: unknown): PublishedManifestV1 {
  const result = validatePublishedManifestV1(value);

  if (!result.ok) {
    throw new Error(`Invalid Lykar manifest: ${result.errors.join('; ')}`);
  }

  return result.value;
}
