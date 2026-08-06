import type { OperationV1 } from '@lykar/protocol';

import { ElementInspector } from './inspector.js';
import { OverlayService } from './overlay.js';
import { SidePanel } from './panel.js';
import { DummyProposalProvider } from './proposal.js';
import type { ProposalProvider } from './proposal.js';
import { EditorSession } from './session.js';
import type { EditorApplyReport, EditorPageDraft } from './session.js';

export type EditingCapability = {
  token: string;
  expiresAt: string;
  projectId: string;
  pageId?: string;
  pageUrl: string;
  apiBaseUrl?: string;
  draftId?: string;
  expectedRevision?: number;
};

export type EditorDraftPersistence = {
  apiBaseUrl?: string;
  draftId: string;
  expectedRevision: number;
  accessToken?: string;
  fetch?: typeof fetch;
};

export type EditorCommitResult = { saved: number; revision?: number };

export type LykarEditorOptions = {
  document?: Document;
  proposalProvider?: ProposalProvider;
  capability?: EditingCapability;
  persistence?: EditorDraftPersistence;
  storage?: Storage | null;
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

  constructor(options: LykarEditorOptions = {}) {
    const document = options.document ?? globalThis.document;
    if (!document?.body) throw new Error('Lykar editor requires a browser document with a body');
    if (options.capability) validateCapability(options.capability, document);

    this.options = options;
    this.document = document;
    this.persistence = options.persistence ?? persistenceFromCapability(options.capability);
    this.expectedRevision = this.persistence?.expectedRevision ?? 0;
    this.session = new EditorSession(document, { storage: options.storage ?? safeSessionStorage(document) });
    this.overlay = new OverlayService(document);
    this.inspector = new ElementInspector(document, this.overlay, element => {
      this.panel.setSelected(element);
      options.onSelection?.(element);
    });
    this.panel = new SidePanel(
      document,
      this.session.page.pathname,
      {
        preview: (operation, key, nodeElement) => this.preview(operation, key, nodeElement),
        commit: () => this.commit(),
        undo: () => this.undo(),
        redo: () => this.redo(),
        close: () => this.destroy(),
        captureDestination: callback => this.inspector.captureNextSelection(callback),
        highlightChange: element => {
          if (element?.isConnected) this.overlay.show('proposal', element, 'change');
          else this.overlay.hide('proposal');
        },
      },
      options.proposalProvider ?? new DummyProposalProvider(),
    );
    this.unsubscribeSession = this.session.subscribe(state => this.panel.updateSession(state));
    this.unsubscribeChanges = this.session.subscribeChanges(changes => this.panel.updateChanges(changes));
  }

  start(): this {
    this.assertActive();
    this.inspector.start();
    void this.session.restore().then(report => {
      if (!report || this.destroyed) return;
      this.overlay.refresh();
      this.panel.setStatus(`Восстановлено локальных команд: ${report.operations.length}.`, 'success');
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
    this.unsubscribeSession?.();
    this.unsubscribeChanges?.();
    this.inspector.destroy();
    this.overlay.destroy();
    this.panel.destroy();
  }

  private preview(operation: OperationV1, key?: string, nodeElement?: Element | null): Promise<EditorApplyReport> {
    this.assertActive();
    const next = this.previewQueue.then(() => this.session.preview(operation, key, nodeElement));
    this.previewQueue = next.then(() => undefined, () => undefined);
    return next.then(report => {
      this.overlay.refresh();
      return report;
    });
  }

  private async commit(): Promise<EditorCommitResult> {
    this.assertActive();
    await this.previewQueue;
    const operations = this.session.pendingOperations();
    if (operations.length === 0) return { saved: 0, revision: this.expectedRevision };
    const report = reportForPending(this.session.page, this.session.getChanges(), operations);

    let result: EditorCommitResult;
    if (this.persistence) {
      const saved = await persistOperations(
        this.persistence,
        this.expectedRevision,
        operations,
        this.options.capability?.token,
      );
      this.expectedRevision = saved.revision;
      result = { saved: saved.appended, revision: saved.revision };
      this.session.markCommitted(operations.map(operation => operation.id));
      await this.options.onApply?.(this.session.exportDraft(), report);
    } else {
      result = { saved: operations.length };
      await this.options.onApply?.(this.session.exportDraft(), report);
      this.session.markCommitted(operations.map(operation => operation.id));
    }
    await this.options.onCommit?.(result, this.session.exportDraft());
    return result;
  }

  private undo(): void {
    if (this.session.undo()) {
      this.overlay.refresh();
      this.panel.setStatus('Последнее локальное изменение отменено.', 'success');
    }
  }

  private async redo(): Promise<void> {
    const report = await this.session.redo();
    if (report) {
      this.overlay.refresh();
      this.panel.setStatus('Последнее локальное изменение применено повторно.', 'success');
    }
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
  expectedRevision: number,
  operations: OperationV1[],
  capabilityToken?: string,
): Promise<{ revision: number; appended: number }> {
  const fetcher = persistence.fetch ?? globalThis.fetch;
  if (!fetcher) throw new Error('Editor persistence requires fetch');
  const token = persistence.accessToken ?? capabilityToken;
  if (!token) throw new Error('Editor persistence requires an editing capability token');
  const baseUrl = (persistence.apiBaseUrl ?? '').replace(/\/+$/, '');
  const response = await fetcher(
    `${baseUrl}/api/editor/drafts/${encodeURIComponent(persistence.draftId)}/operations`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision, operations }),
    },
  );
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json() as { error?: { message?: string } };
      detail = payload.error?.message ?? detail;
    } catch { /* keep HTTP status */ }
    throw new Error(`Не удалось сохранить draft: ${detail}`);
  }
  const payload = await response.json() as { draft?: { revision?: number; appended?: number } };
  if (!Number.isSafeInteger(payload.draft?.revision) || !Number.isSafeInteger(payload.draft?.appended)) {
    throw new Error('Backend returned an invalid draft revision');
  }
  return { revision: payload.draft!.revision!, appended: payload.draft!.appended! };
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
    status: change.status,
    code: change.code,
    message: change.message,
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
