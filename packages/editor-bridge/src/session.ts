import type { OperationV1, SourceSnapshotV1 } from '@lykar/protocol';
import { validateOperationV1 } from '@lykar/protocol';
import { applyOperation, captureSourceSnapshot, resolveTarget } from '@lykar/runtime';
import type { OperationApplyResult } from '@lykar/runtime';

import { createOperationId } from './operation-id.js';

export type EditorPageRef = { origin: string; pathname: string; url: string };
export type EditorPageDraft = { page: EditorPageRef; operations: OperationV1[] };
export type EditorApplyBatch = { id?: string; operations: OperationV1[] };
export type EditorApplyReport = {
  batchId: string;
  page: EditorPageRef;
  applied: number;
  skipped: number;
  errors: number;
  operations: OperationApplyResult[];
};
export type EditorChange = {
  id: string;
  operation: OperationV1;
  nodeElement: Element | null;
  status: OperationApplyResult['status'];
  code?: string;
  message?: string;
  targetResolution?: OperationApplyResult['targetResolution'];
  resolutionEvidence?: OperationApplyResult['resolutionEvidence'];
  committed: boolean;
};
export type EditorSessionState = {
  canUndo: boolean;
  canRedo: boolean;
  appliedBatches: number;
  operationCount: number;
  pendingOperationCount: number;
};
export type EditorSessionOptions = {
  storage?: Storage | null;
  storageKey?: string;
  sourceSnapshot?: SourceSnapshotV1;
  root?: Document | Element;
};

type AppliedRecord = EditorChange & { key?: string; undo: () => void };
type AppliedBatch = { id: string; records: AppliedRecord[] };
type UndoCapture = { element: Element | null; finalize: () => (() => void) };

export class EditorSession {
  readonly page: EditorPageRef;

  private readonly document: Document;
  private readonly root: Document | Element;
  private readonly history: AppliedBatch[] = [];
  private readonly redoStack: AppliedBatch[] = [];
  private readonly listeners = new Set<(state: EditorSessionState) => void>();
  private readonly changeListeners = new Set<(changes: EditorChange[]) => void>();
  private readonly storage: Storage | null;
  private readonly storageKey: string;
  private readonly sourceSnapshotPromise: Promise<SourceSnapshotV1>;

  constructor(document: Document, options: EditorSessionOptions = {}) {
    this.document = document;
    this.root = options.root ?? document;
    const location = document.defaultView?.location;
    const origin = location?.origin ?? 'null';
    const pathname = location?.pathname || '/';
    this.page = { origin, pathname, url: `${origin}${pathname}` };
    this.sourceSnapshotPromise = options.sourceSnapshot
      ? Promise.resolve(options.sourceSnapshot)
      : captureSourceSnapshot(document, this.root);
    this.storage = options.storage ?? null;
    this.storageKey = options.storageKey ?? `lykar:draft:${this.page.url}`;
  }

  sourceSnapshot(): Promise<SourceSnapshotV1> {
    return this.sourceSnapshotPromise;
  }

  async restore(committedOperations: OperationV1[] = [], signal?: AbortSignal): Promise<EditorApplyReport | null> {
    // Read pending edits before remote replay can update their storage key.
    let pending: OperationV1[] = [];
    try {
      const raw = this.storage?.getItem(this.storageKey);
      const value = raw ? JSON.parse(raw) as { operations?: unknown } : null;
      if (Array.isArray(value?.operations)) {
        const committedIds = new Set(committedOperations.map(operation => operation.id));
        pending = value.operations.filter(operation => validateOperationV1(operation).ok && !committedIds.has(operation.id));
      }
    } catch { /* Invalid or unavailable local storage must not block backend restore. */ }

    const batchId = createOperationId('restore');
    const remote = await this.runBatch(batchId, committedOperations, undefined, undefined, signal);
    for (const record of remote.records) record.committed = true;
    const local = await this.runBatch(batchId, pending, undefined, undefined, signal);
    const records = [...remote.records, ...local.records];
    if (records.length > 0) {
      this.history.push({ id: batchId, records });
      this.redoStack.length = 0;
    }
    this.changed();
    return records.length ? reportFor(batchId, this.page, records.map(record => resultFrom(record))) : null;
  }

  async preview(operation: OperationV1, key?: string, nodeElement?: Element | null): Promise<EditorApplyReport> {
    if (key) this.removeReplaceableChange(key);
    const batchId = createOperationId('change');
    const appliedBatch = await this.runBatch(batchId, [operation], key, nodeElement);
    this.history.push(appliedBatch);
    this.redoStack.length = 0;
    this.changed();
    return reportFor(batchId, this.page, appliedBatch.records.map(record => resultFrom(record)));
  }

  async apply(batch: EditorApplyBatch): Promise<EditorApplyReport> {
    const batchId = batch.id ?? createOperationId('batch');
    const appliedBatch = await this.runBatch(batchId, batch.operations);
    if (appliedBatch.records.length > 0) {
      this.history.push(appliedBatch);
      this.redoStack.length = 0;
    }
    this.changed();
    return reportFor(batchId, this.page, appliedBatch.records.map(record => resultFrom(record)));
  }

  undo(): boolean {
    const batch = this.history.at(-1);
    if (!batch || batch.records.every(record => record.committed)) return false;
    this.history.pop();
    for (const record of [...batch.records].reverse()) {
      if (!record.committed && record.status === 'applied') record.undo();
    }
    const committed = batch.records.filter(record => record.committed);
    if (committed.length) this.history.push({ id: batch.id, records: committed });
    this.redoStack.push({ id: batch.id, records: batch.records.filter(record => !record.committed) });
    this.changed();
    return true;
  }

  async redo(): Promise<EditorApplyReport | null> {
    const batch = this.redoStack.pop();
    if (!batch) return null;
    const replayed = await this.runBatch(batch.id, batch.records.map(record => record.operation));
    if (replayed.records.length > 0) this.history.push(replayed);
    this.changed();
    return reportFor(batch.id, this.page, replayed.records.map(record => resultFrom(record)));
  }

  exportDraft(): EditorPageDraft {
    return { page: this.page, operations: this.history.flatMap(batch => batch.records.map(record => record.operation)) };
  }

  pendingOperations(): OperationV1[] {
    return this.history.flatMap(batch => batch.records.filter(record => !record.committed).map(record => record.operation));
  }

  markCommitted(operationIds: Iterable<string>): void {
    const ids = new Set(operationIds);
    for (const batch of this.history) {
      for (const record of batch.records) {
        if (ids.has(record.operation.id)) record.committed = true;
      }
    }
    this.changed();
  }

  getChanges(): EditorChange[] {
    return this.history.flatMap(batch => batch.records.map(({ undo: _undo, key: _key, ...change }) => change));
  }

  getState(): EditorSessionState {
    const changes = this.getChanges();
    return {
      canUndo: this.history.some(batch => batch.records.some(record => !record.committed)),
      canRedo: this.redoStack.length > 0,
      appliedBatches: this.history.length,
      operationCount: changes.length,
      pendingOperationCount: changes.filter(change => !change.committed).length,
    };
  }

  subscribe(listener: (state: EditorSessionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  subscribeChanges(listener: (changes: EditorChange[]) => void): () => void {
    this.changeListeners.add(listener);
    listener(this.getChanges());
    return () => this.changeListeners.delete(listener);
  }

  clear(): void {
    this.history.length = 0;
    this.redoStack.length = 0;
    this.storage?.removeItem(this.storageKey);
    this.notify();
  }

  private removeReplaceableChange(key: string): void {
    for (let batchIndex = this.history.length - 1; batchIndex >= 0; batchIndex--) {
      const batch = this.history[batchIndex];
      const recordIndex = batch.records.findIndex(record => record.key === key && !record.committed);
      if (recordIndex < 0) continue;
      const [record] = batch.records.splice(recordIndex, 1);
      if (record.status === 'applied') record.undo();
      if (batch.records.length === 0) this.history.splice(batchIndex, 1);
      return;
    }
  }

  private async runBatch(
    id: string,
    operations: OperationV1[],
    key?: string,
    nodeElement?: Element | null,
    signal?: AbortSignal,
  ): Promise<AppliedBatch> {
    const records: AppliedRecord[] = [];
    for (const operation of operations) {
      signal?.throwIfAborted();
      const validation = validateOperationV1(operation);
      if (!validation.ok) {
        records.push({
          id: operation.id || 'invalid',
          operation,
          nodeElement: nodeElement ?? null,
          status: 'error',
          code: 'INVALID_OPERATION',
          message: validation.errors.join('; '),
          committed: false,
          key,
          undo: () => undefined,
        });
        continue;
      }
      const capture = await captureUndo(this.document, operation, this.root);
      signal?.throwIfAborted();
      const result = await applyOperation(this.document, operation, {root: this.root, signal});
      records.push({
        id: operation.id,
        operation,
        nodeElement: nodeElement ?? capture.element,
        status: result.status,
        code: result.code,
        message: result.message,
        targetResolution: result.targetResolution,
        resolutionEvidence: result.resolutionEvidence,
        committed: false,
        key,
        undo: result.status === 'applied' ? capture.finalize() : () => undefined,
      });
    }
    return { id, records };
  }

  private changed(): void {
    const operations = this.pendingOperations();
    try {
      if (operations.length > 0) this.storage?.setItem(this.storageKey, JSON.stringify({ operations }));
      else this.storage?.removeItem(this.storageKey);
    } catch { /* Local recovery is optional when browser storage is unavailable. */ }
    this.notify();
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
    const changes = this.getChanges();
    for (const listener of this.changeListeners) listener(changes);
  }
}

async function captureUndo(
  document: Document,
  operation: OperationV1,
  root: Document | Element = document,
): Promise<UndoCapture> {
  const resolution = await resolveTarget(document, operation.target, {root});
  const target = resolution.element;
  if (!target) return noUndo();

  switch (operation.kind) {
    case 'setText': {
      const previous = target.textContent;
      return fixedUndo(target, () => { target.textContent = previous; });
    }
    case 'setStyle': {
      const styled = target as HTMLElement;
      const property = normalizeStyleProperty(operation.property);
      const previous = styled.style?.getPropertyValue(property) ?? '';
      const priority = styled.style?.getPropertyPriority(property) ?? '';
      return fixedUndo(target, () => {
        if (!styled.style) return;
        if (previous) styled.style.setProperty(property, previous, priority);
        else styled.style.removeProperty(property);
      });
    }
    case 'setAttribute':
    case 'removeAttribute': {
      const existed = target.hasAttribute(operation.name);
      const previous = target.getAttribute(operation.name);
      return fixedUndo(target, () => {
        if (existed) target.setAttribute(operation.name, previous ?? '');
        else target.removeAttribute(operation.name);
      });
    }
    case 'insertNode': {
      const container = operation.position === 'before' || operation.position === 'after' ? target.parentNode : target;
      const before = new Set(container ? Array.from(container.childNodes) : []);
      let inserted: Node | null = null;
      return {
        element: target,
        finalize: () => {
          if (container) inserted = Array.from(container.childNodes).find(node => !before.has(node)) ?? null;
          return () => inserted?.parentNode?.removeChild(inserted);
        },
      };
    }
    case 'removeNode':
    case 'moveNode': {
      const parent = target.parentNode;
      const next = target.nextSibling;
      return fixedUndo(target, () => {
        if (parent) parent.insertBefore(target, next?.parentNode === parent ? next : null);
      });
    }
  }
}

function fixedUndo(element: Element, undo: () => void): UndoCapture {
  return { element, finalize: () => undo };
}

function noUndo(): UndoCapture {
  return { element: null, finalize: () => () => undefined };
}

function normalizeStyleProperty(property: string): string {
  const trimmed = property.trim();
  return trimmed.startsWith('--') ? trimmed : trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function resultFrom(record: AppliedRecord): OperationApplyResult {
  return {
    operationId: record.operation.id,
    kind: record.operation.kind,
    target: record.operation.target,
    status: record.status,
    code: record.code,
    message: record.message,
    targetResolution: record.targetResolution,
    resolutionEvidence: record.resolutionEvidence,
  };
}

function reportFor(batchId: string, page: EditorPageRef, operations: OperationApplyResult[]): EditorApplyReport {
  return {
    batchId,
    page,
    applied: operations.filter(operation => operation.status === 'applied').length,
    skipped: operations.filter(operation => operation.status === 'skipped').length,
    errors: operations.filter(operation => operation.status === 'error').length,
    operations,
  };
}
