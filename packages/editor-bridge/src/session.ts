import type { OperationV1 } from '@lykar/protocol';
import { validateOperationV1 } from '@lykar/protocol';
import { applyOperation, resolveTarget } from '@lykar/runtime';
import type { OperationApplyResult } from '@lykar/runtime';

import { createOperationId } from './operation-id.js';

export type EditorPageRef = {
  origin: string;
  pathname: string;
  url: string;
};

export type EditorPageDraft = {
  page: EditorPageRef;
  operations: OperationV1[];
};

export type EditorApplyBatch = {
  id?: string;
  operations: OperationV1[];
};

export type EditorApplyReport = {
  batchId: string;
  page: EditorPageRef;
  applied: number;
  skipped: number;
  errors: number;
  operations: OperationApplyResult[];
};

export type EditorSessionState = {
  canUndo: boolean;
  canRedo: boolean;
  appliedBatches: number;
  operationCount: number;
};

type AppliedRecord = {
  operation: OperationV1;
  undo: () => void;
};

type AppliedBatch = {
  id: string;
  records: AppliedRecord[];
};

type UndoCapture = {
  finalize: () => (() => void);
};

export class EditorSession {
  readonly page: EditorPageRef;

  private readonly document: Document;
  private readonly history: AppliedBatch[] = [];
  private readonly redoStack: AppliedBatch[] = [];
  private readonly listeners = new Set<(state: EditorSessionState) => void>();

  constructor(document: Document) {
    this.document = document;
    const location = document.defaultView?.location;
    const origin = location?.origin ?? 'null';
    const pathname = location?.pathname || '/';
    this.page = { origin, pathname, url: `${origin}${pathname}` };
  }

  async apply(batch: EditorApplyBatch): Promise<EditorApplyReport> {
    const batchId = batch.id ?? createOperationId('batch');
    const appliedBatch = await this.runBatch(batchId, batch.operations);
    if (appliedBatch.records.length > 0) {
      this.history.push(appliedBatch);
      this.redoStack.length = 0;
    }
    this.notify();
    return reportFor(batchId, this.page, appliedBatch.results);
  }

  undo(): boolean {
    const batch = this.history.pop();
    if (!batch) return false;

    for (const record of [...batch.records].reverse()) record.undo();
    this.redoStack.push(batch);
    this.notify();
    return true;
  }

  async redo(): Promise<EditorApplyReport | null> {
    const batch = this.redoStack.pop();
    if (!batch) return null;

    const replayed = await this.runBatch(batch.id, batch.records.map(record => record.operation));
    if (replayed.records.length > 0) this.history.push(replayed);
    this.notify();
    return reportFor(batch.id, this.page, replayed.results);
  }

  exportDraft(): EditorPageDraft {
    return {
      page: this.page,
      operations: this.history.flatMap(batch => batch.records.map(record => record.operation)),
    };
  }

  getState(): EditorSessionState {
    return {
      canUndo: this.history.length > 0,
      canRedo: this.redoStack.length > 0,
      appliedBatches: this.history.length,
      operationCount: this.history.reduce((total, batch) => total + batch.records.length, 0),
    };
  }

  subscribe(listener: (state: EditorSessionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.history.length = 0;
    this.redoStack.length = 0;
    this.notify();
  }

  private async runBatch(
    id: string,
    operations: OperationV1[],
  ): Promise<AppliedBatch & { results: OperationApplyResult[] }> {
    const records: AppliedRecord[] = [];
    const results: OperationApplyResult[] = [];

    for (const operation of operations) {
      const validation = validateOperationV1(operation);
      if (!validation.ok) {
        results.push({
          operationId: typeof operation.id === 'string' ? operation.id : 'invalid',
          kind: operation.kind,
          status: 'error',
          code: 'INVALID_OPERATION',
          message: validation.errors.join('; '),
        });
        continue;
      }

      const capture = await captureUndo(this.document, operation);
      const result = await applyOperation(this.document, operation);
      results.push(result);
      if (result.status === 'applied') {
        records.push({ operation, undo: capture.finalize() });
      }
    }

    return { id, records, results };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}

async function captureUndo(document: Document, operation: OperationV1): Promise<UndoCapture> {
  const resolution = await resolveTarget(document, operation.target);
  const target = resolution.element;
  if (!target) return noUndo();

  switch (operation.kind) {
    case 'setText': {
      const previous = target.textContent;
      return fixedUndo(() => { target.textContent = previous; });
    }
    case 'setStyle': {
      const styled = target as HTMLElement;
      const property = normalizeStyleProperty(operation.property);
      const previous = styled.style?.getPropertyValue(property) ?? '';
      const priority = styled.style?.getPropertyPriority(property) ?? '';
      return fixedUndo(() => {
        if (!styled.style) return;
        if (previous) styled.style.setProperty(property, previous, priority);
        else styled.style.removeProperty(property);
      });
    }
    case 'setAttribute': {
      const existed = target.hasAttribute(operation.name);
      const previous = target.getAttribute(operation.name);
      return fixedUndo(() => {
        if (existed) target.setAttribute(operation.name, previous ?? '');
        else target.removeAttribute(operation.name);
      });
    }
    case 'removeAttribute': {
      const existed = target.hasAttribute(operation.name);
      const previous = target.getAttribute(operation.name);
      return fixedUndo(() => {
        if (existed) target.setAttribute(operation.name, previous ?? '');
        else target.removeAttribute(operation.name);
      });
    }
    case 'insertNode': {
      const container = operation.position === 'before' || operation.position === 'after'
        ? target.parentNode
        : target;
      const before = new Set(container ? Array.from(container.childNodes) : []);
      let inserted: Node | null = null;
      return {
        finalize: () => {
          if (container) inserted = Array.from(container.childNodes).find(node => !before.has(node)) ?? null;
          return () => inserted?.parentNode?.removeChild(inserted);
        },
      };
    }
    case 'removeNode': {
      const parent = target.parentNode;
      const next = target.nextSibling;
      return fixedUndo(() => {
        if (parent) parent.insertBefore(target, next?.parentNode === parent ? next : null);
      });
    }
    case 'moveNode': {
      const parent = target.parentNode;
      const next = target.nextSibling;
      return fixedUndo(() => {
        if (parent) parent.insertBefore(target, next?.parentNode === parent ? next : null);
      });
    }
  }
}

function fixedUndo(undo: () => void): UndoCapture {
  return { finalize: () => undo };
}

function noUndo(): UndoCapture {
  return fixedUndo(() => undefined);
}

function normalizeStyleProperty(property: string): string {
  const trimmed = property.trim();
  return trimmed.startsWith('--') ? trimmed : trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function reportFor(
  batchId: string,
  page: EditorPageRef,
  operations: OperationApplyResult[],
): EditorApplyReport {
  return {
    batchId,
    page,
    applied: operations.filter(operation => operation.status === 'applied').length,
    skipped: operations.filter(operation => operation.status === 'skipped').length,
    errors: operations.filter(operation => operation.status === 'error').length,
    operations,
  };
}
