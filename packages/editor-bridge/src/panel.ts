import type { InsertPosition, OperationV1 } from '@lykar/protocol';
import { validateOperationV1 } from '@lykar/protocol';
import {StyleManager} from '@lykar/editor-ui';
import type {StyleChange} from '@lykar/editor-ui';

import { createOperationId } from './operation-id.js';
import type { EditorProposal, ProposalProvider } from './proposal.js';
import type { EditorApplyReport, EditorChange, EditorGroupedPreviewReport, EditorSessionState } from './session.js';
import { buildTargetDescriptor, serializeEditableElement } from './target-builder.js';

export type SidePanelActions = {
  preview: (operation: OperationV1, key?: string, nodeElement?: Element | null) => Promise<EditorApplyReport>;
  previewGroup: (operations: OperationV1[], key?: string, nodeElement?: Element | null) => Promise<EditorGroupedPreviewReport>;
  commit: () => Promise<{ saved: number; revision?: number }>;
  resolveConflict: () => Promise<void>;
  undo: () => void | Promise<void>;
  redo: () => Promise<void>;
  repair: (operationId: string, element: Element) => Promise<EditorApplyReport>;
  close: () => void;
  captureDestination: (callback: (element: Element) => void) => void;
  highlightChange: (element: Element | null) => void;
  selectParent: (element: Element) => boolean;
  resetStyle: (element: Element, property: string) => Promise<EditorApplyReport>;
  isStyleDirty: (element: Element, property: string) => boolean;
};

export class SidePanel {
  readonly host: HTMLDivElement;

  private readonly document: Document;
  private readonly actions: SidePanelActions;
  private readonly proposalProvider: ProposalProvider;
  private readonly shadow: ShadowRoot | HTMLDivElement;
  private readonly controller = new AbortController();
  private readonly styles: StyleManager;
  private selected: Element | null = null;
  private proposal: EditorProposal | null = null;
  private selectionKey = 'selection-0';
  private selectionSequence = 0;

  constructor(document: Document, pagePath: string, actions: SidePanelActions, proposalProvider: ProposalProvider) {
    this.document = document;
    this.actions = actions;
    this.proposalProvider = proposalProvider;
    this.host = document.createElement('div');
    this.host.setAttribute('data-lykar-editor-root', 'panel');
    this.shadow = this.host.attachShadow?.({ mode: 'open' }) ?? this.host;
    this.shadow.append(this.buildStyle(), this.buildMarkup(pagePath));
    this.styles = new StyleManager(
      document,
      change => void this.previewStyle(change),
      property => void this.resetStyle(property),
      () => void this.actions.undo(),
      (element, property) => this.actions.isStyleDirty(element, property),
    );
    this.get('[data-view="styles"]').append(this.styles.element);
    // A host page may zoom or transform BODY. Keep fixed editor chrome outside
    // that coordinate system while its ShadowRoot still isolates host CSS.
    document.documentElement.appendChild(this.host);
    this.bindEvents();
    this.setSelected(null);
  }

  setSelected(element: Element | null): void {
    this.selected = element;
    this.proposal = null;
    this.selectionKey = `selection-${++this.selectionSequence}`;
    this.get<HTMLElement>('[data-view="empty"]').hidden = Boolean(element);
    this.get<HTMLElement>('[data-view="editor"]').hidden = !element;
    this.styles.setTarget(element);
    if (!element) return;

    this.get<HTMLElement>('[data-field="selected-label"]').textContent = describeElement(element);
    this.get<HTMLButtonElement>('[data-action="select-parent"]').disabled = !element.parentElement || ['BODY', 'HTML'].includes(element.parentElement.tagName);
    const text = this.get<HTMLTextAreaElement>('[data-field="text"]');
    text.value = element.textContent ?? '';
    text.disabled = element.childElementCount > 0;
    this.get<HTMLElement>('[data-field="text-help"]').textContent = text.disabled
      ? 'Сложный элемент содержит вложенную разметку: его текст не заменяется целиком.'
      : 'Изменение показывается на странице сразу и остаётся локальным до «Применить».';

    const attribute = element.tagName === 'A' ? 'href' : element.tagName === 'IMG' ? 'src' : 'class';
    this.get<HTMLInputElement>('[data-field="attribute-name"]').value = attribute;
    this.get<HTMLInputElement>('[data-field="attribute-value"]').value = element.getAttribute(attribute) ?? '';
    this.get<HTMLInputElement>('[data-field="attribute-remove"]').checked = false;
    this.renderProposal();
  }

  updateSession(state: EditorSessionState): void {
    this.get<HTMLButtonElement>('[data-action="undo"]').disabled = !state.canUndo;
    this.get<HTMLButtonElement>('[data-action="redo"]').disabled = !state.canRedo;
    this.get<HTMLElement>('[data-field="history-count"]').textContent = String(state.operationCount);
    this.get<HTMLElement>('[data-field="pending-count"]').textContent = String(state.pendingOperationCount);
    this.get<HTMLButtonElement>('[data-action="apply"]').disabled = state.pendingOperationCount === 0;
    this.styles.refresh();
  }

  updateChanges(changes: EditorChange[]): void {
    const tree = this.get<HTMLElement>('[data-view="change-tree"]');
    tree.replaceChildren();
    if (changes.length === 0) {
      const empty = this.document.createElement('p');
      empty.className = 'help';
      empty.textContent = 'Изменений пока нет.';
      tree.appendChild(empty);
      return;
    }
    changes.forEach((change, index) => {
      const item = this.document.createElement('article');
      item.className = `change change-${change.status}`;
      item.dataset.operationId = change.operation.id;
      const summary = this.document.createElement('button');
      summary.type = 'button';
      summary.className = 'change-summary';
      const title = this.document.createElement('strong');
      title.textContent = `${index + 1}. ${change.operation.kind} · ${change.status}`;
      const id = this.document.createElement('code');
      id.textContent = change.operation.id;
      const target = this.document.createElement('span');
      target.textContent = `target: ${describeTarget(change.operation.target)}`;
      const detail = this.document.createElement('span');
      detail.textContent = `${change.code ?? (change.committed ? 'SAVED' : 'PENDING')}${change.message ? ` — ${change.message}` : ''}`;
      summary.append(title, id, target, detail);
      summary.addEventListener('mouseenter', () => this.actions.highlightChange(change.nodeElement));
      summary.addEventListener('mouseleave', () => this.actions.highlightChange(null));
      item.appendChild(summary);
      const candidates = change.resolutionEvidence?.candidates ?? [];
      if (candidates.length > 0) {
        const list = this.document.createElement('ul');
        list.className = 'candidates';
        for (const candidate of candidates) {
          const entry = this.document.createElement('li');
          const attributes = Object.entries(candidate.attributes).map(([name, value]) => `${name}=${value}`).join(', ');
          entry.textContent = `${candidate.index + 1}. <${candidate.tag}>${attributes ? ` ${attributes}` : ''}`;
          list.appendChild(entry);
        }
        item.appendChild(list);
      }
      if (isRepairable(change)) {
        const repair = this.document.createElement('button');
        repair.type = 'button';
        repair.className = 'repair';
        repair.textContent = 'Выбрать target вручную';
        repair.setAttribute('aria-label', `Исправить target команды ${change.operation.id}`);
        repair.addEventListener('click', () => this.beginRepair(change));
        item.appendChild(repair);
      }
      tree.appendChild(item);
    });
  }

  setStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
    const status = this.get<HTMLElement>('[data-field="status"]');
    status.textContent = message;
    status.dataset.tone = tone;
  }

  showConflict(message: string): void {
    const conflict = this.get<HTMLElement>('[data-view="save-conflict"]');
    conflict.hidden = false;
    this.get<HTMLElement>('[data-field="conflict-message"]').textContent = message;
  }

  destroy(): void {
    this.controller.abort();
    this.styles.destroy();
    this.host.remove();
  }

  flushStyles(): void { this.styles.flush(); }

  private bindEvents(): void {
    const { signal } = this.controller;
    this.get('[data-action="close"]').addEventListener('click', () => this.actions.close(), { signal });
    this.get('[data-action="select-parent"]').addEventListener('click', () => {
      if (this.selected && !this.actions.selectParent(this.selected)) this.setStatus('Родитель вне области редактора.', 'error');
    }, {signal});
    this.get('[data-action="undo"]').addEventListener('click', () => void this.actions.undo(), { signal });
    this.get('[data-action="redo"]').addEventListener('click', () => void this.actions.redo(), { signal });
    this.get('[data-action="apply"]').addEventListener('click', () => void this.commit(), { signal });
    this.get('[data-action="resolve-conflict"]').addEventListener('click', () => void this.resolveConflict(), { signal });
    this.get('[data-field="text"]').addEventListener('input', () => void this.previewText(), { signal });
    this.get('[data-field="attribute-value"]').addEventListener('input', () => void this.previewAttribute(), { signal });
    this.get('[data-field="attribute-remove"]').addEventListener('change', () => void this.previewAttribute(), { signal });
    this.get('[data-action="duplicate"]').addEventListener('click', () => void this.duplicate(), { signal });
    this.get('[data-action="delete"]').addEventListener('click', () => void this.remove(), { signal });
    this.get('[data-action="insert"]').addEventListener('click', () => void this.insert(), { signal });
    this.get('[data-action="choose-destination"]').addEventListener('click', () => this.chooseDestination(), { signal });
    this.get('[data-action="dummy-proposal"]').addEventListener('click', () => void this.loadProposal(), { signal });
    this.get('[data-action="accept-proposal"]').addEventListener('click', () => void this.acceptProposal(), { signal });
  }

  private async previewText(): Promise<void> {
    const element = this.selected;
    const text = this.get<HTMLTextAreaElement>('[data-field="text"]');
    if (!element || text.disabled) return;
    await this.preview({
      schemaVersion: 1,
      id: createOperationId('text'),
      kind: 'setText',
      target: buildTargetDescriptor(element),
      value: text.value,
    }, `${this.selectionKey}:text`, element);
  }

  private async previewStyle(change: StyleChange): Promise<void> {
    const {property, value, priority = '', transactionId} = change;
    const element = this.selected;
    if (!element || !property) return;
    const style = (element as Element & {style?: CSSStyleDeclaration}).style;
    const beforeValue = style?.getPropertyValue(property) ?? '';
    const beforePriority = style?.getPropertyPriority(property) ?? '';
    const beforeComputed = this.document.defaultView?.getComputedStyle(element).getPropertyValue(property).trim() ?? '';
    if (change.group && change.group.length > 1) {
      const operations: OperationV1[] = change.group.map(member => ({
        schemaVersion: 1,
        id: createOperationId('style'),
        kind: 'setStyle',
        target: buildTargetDescriptor(element),
        property: member.property,
        value: member.reset ? '' : member.value,
        ...(member.priority ? {priority: member.priority} : {}),
      }));
      let report: EditorGroupedPreviewReport;
      try {
        report = await this.actions.previewGroup(
          operations,
          transactionId ? `${this.selectionKey}:style-group:${transactionId}` : undefined,
          element,
        );
      } catch (error) {
        if (this.selected === element) this.setStatus(errorMessage(error), 'error');
        return;
      }
      if (this.selected !== element) return;
      if (report.outcome !== 'applied' || report.errors || report.skipped) {
        this.setStatus(report.failure?.message ?? 'Составная CSS-правка не применена полностью.', 'error');
      } else {
        this.setStatus(`Связанные ${change.group.length} CSS-стороны применены одной операцией истории.`);
      }
      return;
    }
    const report = await this.preview({
      schemaVersion: 1,
      id: createOperationId('style'),
      kind: 'setStyle',
      target: buildTargetDescriptor(element),
      property,
      value,
      ...(priority ? {priority} : {}),
    }, transactionId ? `${this.selectionKey}:style:${property}:${transactionId}` : undefined, element);
    if (this.selected !== element) return;
    if (!report || report.errors || report.skipped) {
      const failure = report?.operations.find(operation => operation.status !== 'applied');
      this.setStatus(failure?.message ?? 'CSS-правка не применена к выбранному элементу.', 'error');
      return;
    }

    const appliedValue = style?.getPropertyValue(property) ?? '';
    const appliedPriority = style?.getPropertyPriority(property) ?? '';
    const computed = this.document.defaultView?.getComputedStyle(element).getPropertyValue(property).trim() ?? '';
    const computedStyle = this.document.defaultView?.getComputedStyle(element);
    const missingVariable = [...value.matchAll(/\bvar\(\s*(--[\w-]+)\s*\)/g)]
      .map(match => match[1])
      .find(name => !computedStyle?.getPropertyValue(name).trim());
    const authoredChanged = beforeValue !== appliedValue || beforePriority !== appliedPriority;
    if (missingVariable) {
      this.setStatus(`${property}: CSS принят, но переменная ${missingVariable} не имеет вычисленного значения; проверьте каскад или задайте переменную.`);
    } else if (value && authoredChanged && (!computed || computed === beforeComputed)) {
      this.setStatus(`${property}: CSS принят, но вычисленное значение не изменилось; проверьте layout, cascade и значение var().`);
    } else if (report.applied) {
      this.setStatus(`${property}: предпросмотр применён.`);
    }
  }

  private async resetStyle(property: string): Promise<void> {
    if (!this.selected) return;
    try {
      const report = await this.actions.resetStyle(this.selected, property);
      this.setStatus(report.errors ? report.operations[0]?.message ?? 'Сброс не выполнен.' : 'Исходное значение восстановлено.', report.errors ? 'error' : 'success');
    } catch (error) {
      this.setStatus(errorMessage(error), 'error');
    }
  }

  private async previewAttribute(): Promise<void> {
    const element = this.selected;
    const name = this.get<HTMLInputElement>('[data-field="attribute-name"]').value.trim();
    if (!element || !name) return;
    const remove = this.get<HTMLInputElement>('[data-field="attribute-remove"]').checked;
    const operation: OperationV1 = remove
      ? { schemaVersion: 1, id: createOperationId('remove-attribute'), kind: 'removeAttribute', target: buildTargetDescriptor(element), name }
      : {
          schemaVersion: 1,
          id: createOperationId('attribute'),
          kind: 'setAttribute',
          target: buildTargetDescriptor(element),
          name,
          value: this.get<HTMLInputElement>('[data-field="attribute-value"]').value,
        };
    await this.preview(operation, `${this.selectionKey}:attribute:${name}`, element);
  }

  private async duplicate(): Promise<void> {
    if (!this.selected) return;
    try {
      await this.preview({
        schemaVersion: 1,
        id: createOperationId('duplicate'),
        kind: 'insertNode',
        target: buildTargetDescriptor(this.selected),
        position: 'after',
        node: serializeEditableElement(this.selected),
      }, undefined, this.selected);
    } catch (error) {
      this.setStatus(errorMessage(error), 'error');
    }
  }

  private async remove(): Promise<void> {
    if (!this.selected) return;
    await this.preview({
      schemaVersion: 1,
      id: createOperationId('remove'),
      kind: 'removeNode',
      target: buildTargetDescriptor(this.selected),
    }, undefined, this.selected);
  }

  private async insert(): Promise<void> {
    if (!this.selected) return;
    const tag = this.get<HTMLInputElement>('[data-field="insert-tag"]').value.trim().toLowerCase();
    const text = this.get<HTMLInputElement>('[data-field="insert-text"]').value;
    const position = this.get<HTMLSelectElement>('[data-field="insert-position"]').value as InsertPosition;
    await this.preview({
      schemaVersion: 1,
      id: createOperationId('insert'),
      kind: 'insertNode',
      target: buildTargetDescriptor(this.selected),
      position,
      node: { type: 'element', tag, ...(text ? { children: [{ type: 'text' as const, value: text }] } : {}) },
    }, undefined, this.selected);
  }

  private chooseDestination(): void {
    if (!this.selected) return;
    const source = this.selected;
    const position = this.get<HTMLSelectElement>('[data-field="move-position"]').value as InsertPosition;
    this.setStatus('Кликните по элементу назначения на странице.');
    this.actions.captureDestination(destination => {
      if (destination === source || source.contains(destination)) {
        this.setStatus('Нельзя переместить элемент внутрь самого себя.', 'error');
        return;
      }
      void this.preview({
        schemaVersion: 1,
        id: createOperationId('move'),
        kind: 'moveNode',
        target: buildTargetDescriptor(source),
        destination: buildTargetDescriptor(destination),
        position,
      }, undefined, source);
    });
  }

  private beginRepair(change: EditorChange): void {
    this.setStatus(`Выберите новый target для ${change.operation.id}. Старое изменение останется неизменным.`);
    this.actions.captureDestination(element => {
      void this.actions.repair(change.operation.id, element).then(report => {
        const failed = report.errors + report.skipped;
        this.setStatus(
          failed === 0
            ? `Repair preview применён: ${report.applied} команд. Проверьте цепочку и сохраните.`
            : `Repair preview завершён с проблемами: ${failed}. Проверьте дерево изменений.`,
          failed === 0 ? 'success' : 'error',
        );
      }).catch(error => this.setStatus(errorMessage(error), 'error'));
    });
  }

  private async loadProposal(): Promise<void> {
    if (!this.selected) return;
    try {
      this.setStatus('Формирую dummy-предложение…');
      const proposal = await this.proposalProvider.propose(this.selected);
      const invalid = proposal.operations.flatMap(operation => {
        const validation = validateOperationV1(operation);
        return validation.ok ? [] : validation.errors.map(error => `${operation.id}: ${error}`);
      });
      if (proposal.operations.length === 0 || invalid.length > 0) {
        throw new Error(invalid.join('; ') || 'Предложение не содержит команд.');
      }
      this.proposal = proposal;
      this.renderProposal();
      this.setStatus('Dummy-предложение проверено. Применение требует явного подтверждения.', 'success');
    } catch (error) {
      this.proposal = null;
      this.renderProposal();
      this.setStatus(errorMessage(error), 'error');
    }
  }

  private async acceptProposal(): Promise<void> {
    const element = this.selected;
    if (!this.proposal || !element) return;
    const proposal = this.proposal;
    this.proposal = null;
    this.renderProposal();
    for (const operation of proposal.operations) await this.preview(operation, undefined, element);
  }

  private async preview(operation: OperationV1, key?: string, element?: Element | null): Promise<EditorApplyReport | null> {
    try {
      const report = await this.actions.preview(operation, key, element);
      const tone = report.errors > 0 ? 'error' : 'success';
      this.setStatus(
        report.errors > 0
          ? report.operations[0]?.message ?? 'Изменение не выполнено.'
          : 'Локальный preview обновлён. Для сохранения нажмите «Применить».',
        tone,
      );
      return report;
    } catch (error) {
      this.setStatus(errorMessage(error), 'error');
      return null;
    }
  }

  private async commit(): Promise<void> {
    this.styles.flush();
    const button = this.get<HTMLButtonElement>('[data-action="apply"]');
    button.disabled = true;
    this.setStatus('Сохраняю последовательность изменений…');
    try {
      const result = await this.actions.commit();
      this.get<HTMLElement>('[data-view="save-conflict"]').hidden = true;
      this.setStatus(`Сохранено команд: ${result.saved}${result.revision !== undefined ? `, revision: ${result.revision}` : ''}.`, 'success');
    } catch (error) {
      if (errorCode(error) === 'REVISION_CONFLICT') {
        this.showConflict(errorMessage(error));
      }
      this.setStatus(errorMessage(error), 'error');
      button.disabled = false;
    }
  }

  private async resolveConflict(): Promise<void> {
    const button = this.get<HTMLButtonElement>('[data-action="resolve-conflict"]');
    button.disabled = true;
    this.setStatus('Загружаю актуальную revision для ручного review…');
    try {
      await this.actions.resolveConflict();
      this.get<HTMLElement>('[data-view="save-conflict"]').hidden = true;
      this.setStatus(
        'Revision обновлена. Локальные pending-изменения сохранены; проверьте их и нажмите «Применить» для нового save key.',
        'neutral',
      );
    } catch (error) {
      this.setStatus(errorMessage(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  private renderProposal(): void {
    const container = this.get<HTMLElement>('[data-view="proposal"]');
    container.hidden = !this.proposal;
    if (!this.proposal) return;
    this.get<HTMLElement>('[data-field="proposal-title"]').textContent = this.proposal.title;
    this.get<HTMLElement>('[data-field="proposal-description"]').textContent = this.proposal.description;
    const operations = this.get<HTMLElement>('[data-field="proposal-operations"]');
    operations.replaceChildren(...this.proposal.operations.map(operation => {
      const item = this.document.createElement('li');
      item.textContent = `${operation.kind} → ${describeTarget(operation.target)}`;
      return item;
    }));
  }

  private get<T extends Element = HTMLElement>(selector: string): T {
    const element = this.shadow.querySelector<T>(selector);
    if (!element) throw new Error(`Editor panel element is missing: ${selector}`);
    return element;
  }

  private buildStyle(): HTMLStyleElement {
    const style = this.document.createElement('style');
    style.textContent = `
      :host { all: initial; } *, *::before, *::after { box-sizing: border-box; }
      .panel { position: fixed; top: 12px; right: 12px; bottom: 12px; width:min(380px,calc(100vw - 24px)); z-index:2147483647; display:flex; flex-direction:column; overflow:hidden; border:1px solid #e5e7eb; border-radius:14px; background:#fff; color:#111827; box-shadow:0 20px 60px rgba(15,23,42,.25); font:13px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif; }
      header { padding:14px 16px 10px; border-bottom:1px solid #e5e7eb; background:#fafafa; } h1 { margin:0; font-size:16px; }
      .path { margin-top:3px; color:#6b7280; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .toolbar,.actions,.footer-actions { display:flex; flex-wrap:wrap; gap:7px; } .toolbar { margin-top:10px; }
      .body { flex:1; overflow:auto; padding:14px 16px 90px; } section { margin:0 0 18px; padding-bottom:16px; border-bottom:1px solid #eef0f3; }
      h2 { margin:0 0 9px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#6b7280; }
      label { display:block; margin:8px 0 4px; font-weight:600; } input,textarea,select,button { font:inherit; }
      input,textarea,select { width:100%; border:1px solid #d1d5db; border-radius:7px; padding:8px 9px; background:#fff; color:#111827; }
      textarea { min-height:82px; resize:vertical; } button { border:1px solid #d1d5db; border-radius:7px; padding:7px 10px; background:#fff; color:#111827; cursor:pointer; }
      button:hover { background:#f3f4f6; } button:disabled { opacity:.45; cursor:default; } button.primary { border-color:#7c3aed; background:#7c3aed; color:#fff; font-weight:700; }
      button.danger { color:#b91c1c; } .row { display:grid; grid-template-columns:1fr 1.35fr; gap:8px; } .help { margin:5px 0 0; color:#6b7280; font-size:11px; }
      .selected { padding:8px 10px; border-radius:8px; background:#f5f3ff; color:#5b21b6; font-family:ui-monospace,monospace; }
      .check { display:flex; align-items:center; gap:7px; font-weight:400; } .check input { width:auto; }
      .status { position:absolute; left:12px; right:12px; bottom:12px; padding:10px 12px; border:1px solid #e5e7eb; border-radius:9px; background:rgba(255,255,255,.96); box-shadow:0 5px 20px rgba(15,23,42,.12); }
      .status[data-tone="success"] { border-color:#86efac; color:#166534; } .status[data-tone="error"] { border-color:#fca5a5; color:#991b1b; }
      .proposal { padding:10px; border:1px solid #fcd34d; border-radius:8px; background:#fffbeb; }
      .conflict { padding:10px; border:1px solid #fca5a5; border-radius:8px; background:#fff1f2; color:#991b1b; }
      .change { width:100%; margin:0 0 8px; padding:7px; border:1px solid #d1d5db; border-radius:8px; text-align:left; }
      .change-summary { width:100%; display:grid; gap:3px; padding:0; border:0; text-align:left; background:transparent; }
      .change-summary:hover { background:transparent; } .change code { overflow-wrap:anywhere; color:#4b5563; font-size:10px; }
      .change span { color:#6b7280; overflow-wrap:anywhere; } .change-error { border-color:#ef4444; background:#fef2f2; } .change-skipped { border-color:#f59e0b; background:#fffbeb; }
      .candidates { margin:7px 0; padding-left:18px; color:#6b7280; font-size:11px; } .repair { width:100%; margin-top:6px; border-color:#f59e0b; }
      .footer-actions .primary { flex:1; } [hidden] { display:none !important; }
      .style-manager { display:grid; gap:8px; } .style-section { border:1px solid #e5e7eb; border-radius:8px; padding:5px 8px; }
      .style-section summary { cursor:pointer; font-weight:700; padding:4px; }
      .style-row { display:grid; grid-template-columns:1fr 1.25fr auto; gap:5px; align-items:center; margin:7px 0; }
      .style-row label { margin:0; font-size:11px; overflow-wrap:anywhere; }
      .style-row[data-dirty="true"] > label:first-child::after { content:' •'; color:#7c3aed; }
      .style-row input[data-role="swatch"] { width:36px; height:32px; padding:2px; }
      .style-row select { grid-column:2 / -1; } .style-row input { min-width:0; }
      .style-row button { padding:6px; font-size:11px; } .style-row input[aria-invalid="true"] { border-color:#dc2626; }
      .style-row .style-important, .style-important { display:flex; align-items:center; gap:4px; grid-column:2 / -1; font-size:11px; font-weight:400; margin:0; }
      .style-important input { width:auto; }
      .style-stack-items { grid-column:1 / -1; display:grid; gap:5px; }
      .style-layer { display:grid; grid-template-columns:1fr auto auto auto; gap:4px; }
      .style-layer input { min-width:0; }
      .style-composite-parts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; grid-column:1 / -1; }
      .style-composite-parts label { margin:0; font-size:11px; font-weight:400; }
      .style-linked-control { display:flex; align-items:center; gap:6px; grid-column:1 / -1; margin:0; font-size:11px; font-weight:400; }
      .style-linked-control input { width:auto; }
      .style-error { grid-column:1 / -1; color:#b91c1c; font-size:11px; }
      .style-applicability { grid-column:1 / -1; color:#92400e; font-size:11px; }
      .style-custom-row { display:grid; gap:6px; margin:8px 0; }
      @media (max-width:520px) { .panel { top:6px; right:6px; bottom:6px; width:calc(100vw - 12px); border-radius:10px; } .body { padding-inline:12px; } }
    `;
    return style;
  }

  private buildMarkup(pagePath: string): HTMLElement {
    const panel = this.document.createElement('aside');
    panel.className = 'panel';
    panel.setAttribute('aria-label', 'Lykar visual editor');
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = `
      <header><h1>Lykar Editor</h1><div class="path"></div><div class="toolbar">
        <button type="button" data-action="undo" aria-label="Отменить последнее изменение" title="Отменить">↶</button><button type="button" data-action="redo" aria-label="Повторить последнее изменение" title="Повторить">↷</button><button type="button" data-action="close">Закрыть</button>
        <span style="margin-left:auto;color:#6b7280">Команд: <b data-field="history-count">0</b></span>
      </div></header>
      <div class="body">
        <div data-view="empty"><p>Наведите курсор и кликните по элементу страницы.</p></div>
        <div data-view="editor">
          <section><h2>Выбранный элемент</h2><div class="selected" data-field="selected-label"></div><button type="button" data-action="select-parent" style="margin-top:6px">Выбрать родителя</button></section>
          <section><h2>Текст</h2><textarea data-field="text" aria-label="Element text"></textarea><p class="help" data-field="text-help"></p></section>
          <section><h2>Стили</h2><p class="help">«Вернуть исходный» восстанавливает стиль до правок Lykar. «Удалить» убирает inline-декларацию и возвращает управление каскаду.</p><div data-view="styles"></div></section>
          <section><h2>Атрибут</h2><div class="row"><input data-field="attribute-name" aria-label="Attribute name"><input data-field="attribute-value" aria-label="Attribute value"></div><label class="check"><input type="checkbox" data-field="attribute-remove"> Удалить атрибут</label></section>
          <section><h2>Структура</h2><div class="actions"><button type="button" data-action="duplicate">Дублировать</button><button type="button" class="danger" data-action="delete">Удалить</button></div><p class="help">Копируются только безопасные статические HTML/атрибуты. Обработчики, component state и бизнес-логика не переносятся.</p>
            <label>Добавить элемент</label><div class="row"><input data-field="insert-tag" value="div"><input data-field="insert-text" placeholder="Текст"></div>
            <div class="row" style="margin-top:8px"><select data-field="insert-position"><option value="after">После</option><option value="before">До</option><option value="append">Внутрь, в конец</option><option value="prepend">Внутрь, в начало</option></select><button type="button" data-action="insert">Добавить</button></div>
            <label>Переместить</label><div class="row"><select data-field="move-position"><option value="append">Внутрь назначения</option><option value="before">Перед назначением</option><option value="after">После назначения</option><option value="prepend">В начало назначения</option></select><button type="button" data-action="choose-destination">Выбрать место</button></div>
          </section>
          <section><h2>Предложение агента</h2><button type="button" data-action="dummy-proposal">Создать dummy-предложение</button><div class="proposal" data-view="proposal" hidden style="margin-top:8px"><strong data-field="proposal-title"></strong><span data-field="proposal-description"></span><ul data-field="proposal-operations"></ul><button type="button" data-action="accept-proposal" style="margin-top:8px">Принять явно</button></div></section>
        </div>
        <section><h2>Дерево изменений</h2><div data-view="change-tree"></div></section>
        <section class="conflict" data-view="save-conflict" hidden><h2>Конфликт revision</h2><p data-field="conflict-message"></p><p class="help">Автоматический rebase не выполняется. Pending operations останутся локально.</p><button type="button" data-action="resolve-conflict">Загрузить revision и проверить</button></section>
        <section><div class="footer-actions"><button type="button" class="primary" data-action="apply">Применить (<span data-field="pending-count">0</span>)</button></div></section>
      </div>
      <div class="status" data-field="status" data-tone="neutral" role="status" aria-live="polite">Изменения показываются локально. «Применить» сохраняет их в draft.</div>`;
    panel.querySelector<HTMLElement>('.path')!.textContent = pagePath;
    return panel;
  }
}

function describeElement(element: Element): string {
  const id = element.getAttribute('id');
  const classes = Array.from(element.classList).slice(0, 3).join('.');
  return `${element.tagName.toLowerCase()}${id ? `#${id}` : ''}${classes ? `.${classes}` : ''}`;
}

function describeTarget(target: OperationV1['target']): string {
  if (target.nodeRef) return `nodeRef(${target.nodeRef.operationId}${target.nodeRef.path?.length ? `:${target.nodeRef.path.join('.')}` : ''})`;
  if (target.binding) return `binding(${target.binding.targetId}@${target.binding.bindingVersion})`;
  if (target.marker) return `[data-lykar-id="${target.marker}"]`;
  return target.selectors?.css ?? target.selectors?.xpath ?? 'unknown';
}

function isRepairable(change: EditorChange): boolean {
  if (change.status === 'applied') return false;
  return /^(TARGET_|DESTINATION_|PARENT_PRECONDITION_|NODE_REFERENCE_)/.test(change.code ?? '')
    || change.targetResolution === 'missing'
    || change.targetResolution === 'ambiguous';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}
