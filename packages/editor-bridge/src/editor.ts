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
  pageUrl: string;
};

export type LykarEditorOptions = {
  document?: Document;
  proposalProvider?: ProposalProvider;
  capability?: EditingCapability;
  onApply?: (draft: EditorPageDraft, report: EditorApplyReport) => void | Promise<void>;
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
  private destroyed = false;

  constructor(options: LykarEditorOptions = {}) {
    const document = options.document ?? globalThis.document;
    if (!document?.body) throw new Error('Lykar editor requires a browser document with a body');
    if (options.capability) validateCapability(options.capability, document);

    this.options = options;
    this.document = document;
    this.session = new EditorSession(document);
    this.overlay = new OverlayService(document);
    this.inspector = new ElementInspector(document, this.overlay, element => {
      this.panel.setSelected(element);
      options.onSelection?.(element);
    });
    this.panel = new SidePanel(
      document,
      this.session.page.pathname,
      {
        apply: operations => this.apply(operations),
        undo: () => this.undo(),
        redo: () => this.redo(),
        close: () => this.destroy(),
        captureDestination: callback => this.inspector.captureNextSelection(callback),
      },
      options.proposalProvider ?? new DummyProposalProvider(),
    );
    this.unsubscribeSession = this.session.subscribe(state => this.panel.updateSession(state));
  }

  start(): this {
    this.assertActive();
    this.inspector.start();
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
    this.inspector.destroy();
    this.overlay.destroy();
    this.panel.destroy();
  }

  private async apply(operations: OperationV1[]): Promise<EditorApplyReport> {
    this.assertActive();
    const report = await this.session.apply({ operations });
    this.overlay.refresh();
    await this.options.onApply?.(this.session.exportDraft(), report);
    return report;
  }

  private undo(): void {
    if (this.session.undo()) {
      this.overlay.refresh();
      this.panel.setStatus('Последний batch отменён.', 'success');
    }
  }

  private async redo(): Promise<void> {
    const report = await this.session.redo();
    if (report) {
      this.overlay.refresh();
      this.panel.setStatus('Последний batch применён повторно.', 'success');
    }
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('Lykar editor has been destroyed');
  }
}

export function startEditor(options: LykarEditorOptions = {}): LykarEditor {
  return new LykarEditor(options).start();
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
