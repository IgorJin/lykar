import type { OperationV1, SourceSnapshotV1 } from '@lykar/protocol';

import { ElementInspector } from './inspector.js';
import { createOperationId } from './operation-id.js';
import { OverlayService } from './overlay.js';
import { SidePanel } from './panel.js';
import { DummyProposalProvider } from './proposal.js';
import type { ProposalProvider } from './proposal.js';
import { EditorSession } from './session.js';
import type { EditorApplyReport, EditorGroupedPreviewReport, EditorPageDraft, PendingSaveBatch } from './session.js';
import {buildTargetDescriptor} from './target-builder.js';

export type EditingCapability = {
  token: string;
  expiresAt: string;
  projectId: string;
  pageId?: string;
  pageUrl: string;
  apiBaseUrl?: string;
  draftId?: string;
  expectedRevision?: number;
  baseVersion?: number | null;
};

export type EditorDraftPersistence = {
  apiBaseUrl?: string;
  draftId: string;
  expectedRevision: number;
  accessToken?: string;
  fetch?: typeof fetch;
};

export type EditorCommitResult = { saved: number; revision?: number; replayed?: boolean };

export class EditorPersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EditorPersistenceError';
  }
}

export type LykarEditorOptions = {
  document?: Document;
  root?: Document | Element;
  proposalProvider?: ProposalProvider;
  capability?: EditingCapability;
  persistence?: EditorDraftPersistence;
  storage?: Storage | null;
  sourceSnapshot?: SourceSnapshotV1;
  onApply?: (draft: EditorPageDraft, report: EditorApplyReport) => void | Promise<void>;
  onCommit?: (result: EditorCommitResult, draft: EditorPageDraft) => void | Promise<void>;
  onSelection?: (element: Element | null) => void;
};

export class LykarEditor {
  readonly session: EditorSession;

  private readonly options: LykarEditorOptions;
  private readonly document: Document;
  private readonly overlay: OverlayService;
  private readonly inspector: ElementInspector;
  private readonly panel: SidePanel;
  private unsubscribeSession: (() => void) | null = null;
  private unsubscribeChanges: (() => void) | null = null;
  private previewQueue: Promise<unknown> = Promise.resolve();
  private readonly persistence?: EditorDraftPersistence;
  private expectedRevision: number;
  private destroyed = false;
  private restoration?: Promise<number>;
  private readonly restoreController = new AbortController();
  private commitPromise?: Promise<EditorCommitResult>;

  constructor(options: LykarEditorOptions = {}) {
    const document = options.document ?? globalThis.document;
    if (!document?.body) throw new Error('Lykar editor requires a browser document with a body');
    const root = options.root ?? document;
    if (root.nodeType === 1 && root.ownerDocument !== document) {
      throw new Error('Lykar editor root belongs to another document');
    }
    if (options.capability) validateCapability(options.capability, document);

    this.options = options;
    this.document = document;
    this.persistence = options.persistence ?? persistenceFromCapability(options.capability);
    this.expectedRevision = this.persistence?.expectedRevision ?? 0;
    this.session = new EditorSession(document, {
      storage: options.storage === undefined ? safeSessionStorage(document) : options.storage,
      storageKey: options.capability?.draftId
        ? `lykar:draft:${options.capability.draftId}`
        : this.persistence?.draftId
          ? `lykar:draft:${this.persistence.draftId}`
          : undefined,
      sourceSnapshot: options.sourceSnapshot,
      root,
    });
    this.overlay = new OverlayService(document);
    this.inspector = new ElementInspector(document, this.overlay, element => {
      this.panel.setSelected(element);
      options.onSelection?.(element);
    }, root);
    this.panel = new SidePanel(
      document,
      this.session.page.pathname,
      {
        preview: (operation, key, nodeElement) => this.preview(operation, key, nodeElement),
        previewGroup: (operations, key) => this.previewGroup(operations, key),
        commit: () => this.commit(),
        resolveConflict: () => this.resolveConflict(),
        undo: () => this.undo(),
        redo: () => this.redo(),
        repair: (operationId, element) => this.repair(operationId, element),
        close: () => this.destroy(),
        captureDestination: callback => this.inspector.captureNextSelection(callback),
        highlightChange: element => {
          if (element?.isConnected) this.overlay.show('proposal', element, 'change');
          else this.overlay.hide('proposal');
        },
        selectParent: element => {
          const parent = element.parentElement;
          if (!parent || ['BODY', 'HTML'].includes(parent.tagName) || (root.nodeType === 1 && root !== parent && !root.contains(parent))) return false;
          this.inspector.select(parent);
          return true;
        },
        resetStyle: (element, property) => {
          const baseline = this.session.styleBaseline(element, property);
          if (!baseline) throw new Error('Исходное значение недоступно или стиль изменён страницей после правки Lykar.');
          const style = (element as HTMLElement).style;
          if (style?.getPropertyValue(property) === baseline.value && style.getPropertyPriority(property) === baseline.priority) {
            return Promise.resolve({batchId: 'no-op-reset', page: this.session.page, applied: 0, skipped: 0, errors: 0, operations: []});
          }
          return this.preview({
            schemaVersion: 1,
            id: createOperationId('reset-style'),
            kind: 'setStyle',
            target: buildTargetDescriptor(element),
            property,
            value: baseline.value,
            ...(baseline.priority ? {priority: baseline.priority} : {}),
          }, undefined, element);
        },
        isStyleDirty: (element, property) => this.session.isStyleDirty(element, property),
      },
      options.proposalProvider ?? new DummyProposalProvider(),
    );
    this.unsubscribeSession = this.session.subscribe(state => this.panel.updateSession(state));
    this.unsubscribeChanges = this.session.subscribeChanges(changes => this.panel.updateChanges(changes));
  }

  start(): this {
    this.assertActive();
    if (this.restoration) return this;
    if (!this.persistence) this.inspector.start();
    else this.panel.setStatus('Загружаю сохранённые изменения…');
    this.restoration = this.restore();
    void this.restoration.then(restored => {
      if (this.destroyed) return;
      this.inspector.start();
      this.overlay.refresh();
      const recoveryWarning = this.session.recoveryWarning();
      const pendingSave = this.session.pendingSaveBatch();
      if (pendingSave && pendingSave.expectedRevision !== this.expectedRevision) {
        const message = `Локальный save ожидал revision ${pendingSave.expectedRevision}, сервер уже на revision ${this.expectedRevision}.`;
        this.panel.showConflict(message);
        this.panel.setStatus(message, 'error');
      } else if (recoveryWarning) this.panel.setStatus(recoveryWarning, 'error');
      else if (restored > 0) this.panel.setStatus(`Восстановлено команд: ${restored}.`, 'success');
      else this.panel.setStatus('Изменения показываются локально. «Применить» сохраняет их в draft.');
    }).catch(error => {
      if (!this.destroyed) this.panel.setStatus(errorMessage(error), 'error');
    });
    return this;
  }

  select(element: Element | null): void {
    this.assertActive();
    this.inspector.select(element);
  }

  exportDraft(): EditorPageDraft {
    return this.session.exportDraft();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.restoreController.abort();
    this.unsubscribeSession?.();
    this.unsubscribeChanges?.();
    this.inspector.destroy();
    this.overlay.destroy();
    this.panel.destroy();
  }

  private preview(operation: OperationV1, key?: string, nodeElement?: Element | null): Promise<EditorApplyReport> {
    this.assertActive();
    const next = this.previewQueue.then(async () => {
      await this.restoration;
      this.assertActive();
      return this.session.preview(operation, key, nodeElement);
    });
    this.previewQueue = next.then(() => undefined, () => undefined);
    return next.then(report => {
      this.assertActive();
      this.overlay.refresh();
      return report;
    });
  }

  private previewGroup(operations: OperationV1[], key?: string): Promise<EditorGroupedPreviewReport> {
    this.assertActive();
    const next = this.previewQueue.then(async () => {
      await this.restoration;
      this.assertActive();
      return this.session.previewGroup(operations, {key, signal: this.restoreController.signal});
    });
    this.previewQueue = next.then(() => undefined, () => undefined);
    return next.then(report => {
      this.assertActive();
      this.overlay.refresh();
      return report;
    });
  }

  private async restore(): Promise<number> {
    let operations: OperationV1[] = [];
    if (this.persistence) {
      const remote = await loadPersistedDraft(this.persistence, this.options.capability?.token, this.restoreController.signal);
      this.assertActive();
      this.expectedRevision = remote.revision;
      operations = remote.operations;
    }
    const restored = await this.session.restore(operations, this.restoreController.signal);
    return restored?.operations.length ?? 0;
  }

  private async commit(): Promise<EditorCommitResult> {
    if (this.commitPromise) return this.commitPromise;
    const pending = this.performCommit();
    this.commitPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.commitPromise === pending) this.commitPromise = undefined;
    }
  }

  private async performCommit(): Promise<EditorCommitResult> {
    this.assertActive();
    this.panel.flushStyles();
    await this.restoration;
    await this.previewQueue;
    this.assertActive();
    const operations = this.session.pendingOperations();
    if (operations.length === 0) return { saved: 0, revision: this.expectedRevision };

    let result: EditorCommitResult;
    if (this.persistence) {
      let batch = this.session.pendingSaveBatch();
      if (!batch) {
        batch = {
          idempotencyKey: createOperationId('save'),
          expectedRevision: this.expectedRevision,
          operations,
          sourceSnapshot: await this.session.sourceSnapshot(),
        };
        this.session.beginSave(batch);
      }
      const report = reportForPending(this.session.page, this.session.getChanges(), batch.operations);
      const saved = await persistOperations(
        this.persistence,
        batch,
        this.options.capability?.token,
        this.restoreController.signal,
      );
      this.assertActive();
      this.expectedRevision = saved.revision;
      result = { saved: saved.appended, revision: saved.revision, replayed: saved.replayed };
      this.session.completeSave(saved.operationIds);
      await this.options.onApply?.(this.session.exportDraft(), report);
      this.assertActive();
    } else {
      const report = reportForPending(this.session.page, this.session.getChanges(), operations);
      result = { saved: operations.length };
      await this.options.onApply?.(this.session.exportDraft(), report);
      this.assertActive();
      this.session.markCommitted(operations.map(operation => operation.id));
    }
    await this.options.onCommit?.(result, this.session.exportDraft());
    this.assertActive();
    return result;
  }

  private async resolveConflict(): Promise<void> {
    if (!this.persistence) return;
    const remote = await loadPersistedDraft(
      this.persistence,
      this.options.capability?.token,
      this.restoreController.signal,
    );
    this.assertActive();
    this.expectedRevision = remote.revision;
    this.session.resolveSaveConflict(remote.operations);
  }

  private async undo(): Promise<void> {
    await this.previewQueue;
    if (this.session.undo()) {
      this.overlay.refresh();
      this.panel.setStatus('Последнее локальное изменение отменено.', 'success');
      return;
    }
    if (this.session.pendingOperations().length > 0) {
      this.panel.setStatus('Undo остановлен: страница изменила часть связанной CSS-группы. Изменения оставлены для проверки.', 'error');
      return;
    }
    const report = await this.session.undoCommitted();
    if (report) {
      this.overlay.refresh();
      this.panel.setStatus('Undo сохранённого изменения добавлен как новая pending-команда.', 'success');
    } else {
      this.panel.setStatus('Undo остановлен: сохранённый стиль изменён страницей. Проверьте конфликт.', 'error');
    }
  }

  private async redo(): Promise<void> {
    const report = await this.session.redo();
    if (report) {
      this.overlay.refresh();
      this.panel.setStatus('Последнее локальное изменение применено повторно.', 'success');
    }
  }

  private async repair(operationId: string, element: Element): Promise<EditorApplyReport> {
    const report = await this.session.repair(operationId, element);
    this.overlay.refresh();
    return report;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('Lykar editor has been destroyed');
  }
}

function persistenceFromCapability(capability?: EditingCapability): EditorDraftPersistence | undefined {
  if (!capability?.apiBaseUrl || !capability.draftId || !Number.isSafeInteger(capability.expectedRevision)) return undefined;
  return {
    apiBaseUrl: capability.apiBaseUrl,
    draftId: capability.draftId,
    expectedRevision: capability.expectedRevision!,
    accessToken: capability.token,
  };
}

export function startEditor(options: LykarEditorOptions = {}): LykarEditor {
  return new LykarEditor(options).start();
}

async function persistOperations(
  persistence: EditorDraftPersistence,
  batch: PendingSaveBatch,
  capabilityToken?: string,
  signal?: AbortSignal,
): Promise<{
  revision: number;
  appended: number;
  operationIds: string[];
  replayed: boolean;
}> {
  const fetcher = persistence.fetch ?? globalThis.fetch;
  if (!fetcher) throw new Error('Editor persistence requires fetch');
  const token = persistence.accessToken ?? capabilityToken;
  if (!token) throw new Error('Editor persistence requires an editing capability token');
  const baseUrl = (persistence.apiBaseUrl ?? '').replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetcher(
      `${baseUrl}/api/editor/drafts/${encodeURIComponent(persistence.draftId)}/operations`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: batch.idempotencyKey,
          expectedRevision: batch.expectedRevision,
          operations: batch.operations,
          sourceSnapshot: batch.sourceSnapshot,
        }),
        signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new EditorPersistenceError(
      'OFFLINE_OR_RESPONSE_LOST',
      'Ответ сохранения не получен. Batch оставлен для безопасного повтора с тем же ключом.',
      undefined,
      undefined,
      {cause: error},
    );
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    let code = response.status === 409 ? 'REVISION_CONFLICT' : 'SAVE_FAILED';
    let details: unknown;
    try {
      const payload = await response.json() as { error?: { code?: string; message?: string; details?: unknown } };
      detail = payload.error?.message ?? detail;
      code = payload.error?.code ?? code;
      details = payload.error?.details;
    } catch { /* keep HTTP status */ }
    throw new EditorPersistenceError(code, `Не удалось сохранить draft: ${detail}`, response.status, details);
  }
  const payload = await response.json() as { draft?: Record<string, unknown> };
  const draft = payload.draft;
  if (
    !Number.isSafeInteger(draft?.revision)
    || !Number.isSafeInteger(draft?.appended)
    || !Array.isArray(draft?.operationIds)
    || !draft.operationIds.every(id => typeof id === 'string')
    || JSON.stringify(draft.operationIds) !== JSON.stringify(batch.operations.map(operation => operation.id))
    || draft.idempotencyKey !== batch.idempotencyKey
    || typeof draft.payloadHash !== 'string'
    || typeof draft.replayed !== 'boolean'
  ) {
    throw new Error('Backend returned an invalid draft revision');
  }
  return {
    revision: draft.revision as number,
    appended: draft.appended as number,
    operationIds: draft.operationIds as string[],
    replayed: draft.replayed,
  };
}

async function loadPersistedDraft(
  persistence: EditorDraftPersistence,
  capabilityToken?: string,
  signal?: AbortSignal,
): Promise<{ revision: number; operations: OperationV1[] }> {
  const fetcher = persistence.fetch ?? globalThis.fetch;
  const token = persistence.accessToken ?? capabilityToken;
  if (!fetcher || !token) throw new Error('Editor persistence requires an editing capability token');
  const baseUrl = (persistence.apiBaseUrl ?? '').replace(/\/+$/, '');
  const response = await fetcher(`${baseUrl}/api/editor/drafts/${encodeURIComponent(persistence.draftId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) throw new Error(`Не удалось загрузить draft: HTTP ${response.status}`);
  const payload = await response.json() as { draft?: { revision?: number }; operations?: unknown };
  if (!Number.isSafeInteger(payload.draft?.revision) || !Array.isArray(payload.operations)) {
    throw new Error('Backend returned an invalid draft');
  }
  return { revision: payload.draft!.revision!, operations: payload.operations as OperationV1[] };
}

function reportForPending(
  page: EditorSession['page'],
  changes: ReturnType<EditorSession['getChanges']>,
  operations: OperationV1[],
): EditorApplyReport {
  const ids = new Set(operations.map(operation => operation.id));
  const results = changes.filter(change => ids.has(change.operation.id)).map(change => ({
    operationId: change.operation.id,
    kind: change.operation.kind,
    target: change.operation.target,
    status: change.status,
    code: change.code,
    message: change.message,
    targetResolution: change.targetResolution,
    resolutionEvidence: change.resolutionEvidence,
  }));
  return {
    batchId: `commit-${Date.now()}`,
    page,
    applied: results.filter(result => result.status === 'applied').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    errors: results.filter(result => result.status === 'error').length,
    operations: results,
  };
}

function safeSessionStorage(document: Document): Storage | null {
  try { return document.defaultView?.sessionStorage ?? null; } catch { return null; }
}

function validateCapability(capability: EditingCapability, document: Document): void {
  if (!capability.token.trim()) throw new Error('Editing capability token is empty');
  if (Number.isNaN(Date.parse(capability.expiresAt)) || Date.parse(capability.expiresAt) <= Date.now()) {
    throw new Error('Editing capability has expired');
  }
  const expected = new URL(capability.pageUrl);
  const actual = document.defaultView?.location;
  if (actual && (expected.origin !== actual.origin || expected.pathname !== actual.pathname)) {
    throw new Error('Editing capability does not match the current page');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
