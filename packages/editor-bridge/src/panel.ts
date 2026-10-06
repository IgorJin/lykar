import type { InsertPosition, Operation, SerializedNode } from '@lykar/protocol';
import { validateOperation } from '@lykar/protocol';
import {StyleManager, Select, SELECT_CSS} from '@lykar/editor-ui';
import type {StyleChange} from '@lykar/editor-ui';

import { createOperationId } from './operation-id.js';
import { InsertDragController } from './insert-drag.js';
import { PanelDragController } from './panel-drag.js';
import { PANEL_CSS, panelMarkup } from './panel-view.js';
import type { EditorProposal, ProposalProvider } from './proposal.js';
import type { EditorApplyReport, EditorChange, EditorGroupedPreviewReport, EditorSessionState } from './session.js';
import { buildTargetDescriptor, serializeEditableElement } from './target-builder.js';

export type SidePanelActions = {
  preview: (operation: Operation, key?: string, nodeElement?: Element | null, intent?: 'priority') => Promise<EditorApplyReport>;
  previewGroup: (operations: Operation[], key?: string, nodeElement?: Element | null) => Promise<EditorGroupedPreviewReport>;
  commit: () => Promise<{ saved: number; revision?: number }>;
  resolveConflict: () => Promise<void>;
  undo: () => void | Promise<void>;
  redo: () => Promise<void>;
  repair: (operationId: string, element: Element) => Promise<EditorApplyReport>;
  close: () => void;
  captureDestination: (callback: (element: Element) => void) => void;
  cancelCapture: () => void;
  elementAt: (x: number, y: number) => Element | null;
  selectElement: (element: Element | null) => void;
  setDragging: (active: boolean) => void;
  setPreviewMode: (active: boolean) => void;
  highlightInsertion: (element: Element | null, position: InsertPosition) => void;
  highlightChange: (element: Element | null) => void;
  selectParent: (element: Element) => boolean;
  readStyle?: (element: Element) => CSSStyleDeclaration | undefined;
  resetStyle: (element: Element, property: string) => Promise<EditorApplyReport>;
  isStyleDirty: (element: Element, property: string) => boolean;
  hasStyleOverride: (element: Element, property: string) => boolean;
};

export class SidePanel {
  readonly host: HTMLDivElement;

  private readonly document: Document;
  private readonly actions: SidePanelActions;
  private readonly proposalProvider: ProposalProvider;
  private readonly shadow: ShadowRoot | HTMLDivElement;
  private readonly controller = new AbortController();
  private readonly styles: StyleManager;
  private readonly drag: InsertDragController;
  private readonly panelDrag: PanelDragController;
  private readonly positionSelects: Select[] = [];
  private insertPosition: InsertPosition = 'after';
  private movePosition: InsertPosition = 'append';
  private mode: 'edit' | 'add' | 'history' = 'edit';
  private previewMode = false;
  private capturingDestination = false;
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
      this.actions.readStyle,
      this.actions.hasStyleOverride,
    );
    this.get('[data-view="styles"]').append(this.styles.element);
    const sectionLabels: Record<string, string> = {layout: 'Раскладка', size: 'Размеры', space: 'Отступы', position: 'Позиционирование', typography: 'Типографика', background: 'Фон', borders: 'Границы', effects: 'Эффекты', advanced: 'Дополнительно'};
    for (const section of this.styles.element.querySelectorAll<HTMLDetailsElement>('.style-section')) {
      const name = section.dataset.section ?? '';
      const summary = section.querySelector('summary');
      if (summary && sectionLabels[name]) summary.textContent = sectionLabels[name];
      if (name !== 'custom') section.open = name === 'typography';
    }
    this.styles.openSection('typography');
    const typography = this.styles.element.querySelector('.style-section[data-section="typography"] .style-section-fields');
    for (const field of ['text-align', 'color', 'letter-spacing', 'line-height', 'font-size', 'font-weight', 'font-family']) {
      const row = typography?.querySelector(`[data-field="${field}"]`);
      if (row) typography?.prepend(row);
    }
    // Put the everyday text controls first while retaining the complete catalog.
    const search = this.styles.element.querySelector('.style-search');
    for (const name of ['advanced', 'effects', 'position', 'layout', 'borders', 'background', 'size', 'space', 'typography']) {
      const section = this.styles.element.querySelector(`[data-section="${name}"]`);
      if (section) search?.after(section);
    }
    this.drag = new InsertDragController(document, this.shadow, {
      resolveTarget: actions.elementAt,
      highlight: actions.highlightInsertion,
      suspend: active => {
        if (active) this.cancelDestination();
        actions.setDragging(active);
      },
      drop: (template, target, position) => void this.insertTemplate(template, target, position),
      choose: template => this.chooseTemplate(template),
      getPosition: () => this.insertPosition,
    });
    this.replacePositionSelect('insert-position', value => { this.insertPosition = value; });
    this.replacePositionSelect('move-position', value => { this.movePosition = value; });
    // A host page may zoom or transform BODY. Keep fixed editor chrome outside
    // that coordinate system while its ShadowRoot still isolates host CSS.
    document.documentElement.appendChild(this.host);
    this.panelDrag = new PanelDragController(document, this.get('.panel'), this.get('[data-panel-drag-handle]'), active => {
      if (active) { this.cancelDestination(); this.closeSelects(); }
      actions.setDragging(active);
    });
    this.bindEvents();
    this.updateViewport();
    this.setSelected(null);
  }

  setSelected(element: Element | null): void {
    this.selected = element;
    this.proposal = null;
    this.selectionKey = `selection-${++this.selectionSequence}`;
    this.get<HTMLElement>('[data-view="empty"]').hidden = Boolean(element);
    this.get<HTMLElement>('[data-view="editor"]').hidden = !element;
    this.styles.setTarget(element);
    this.get<HTMLElement>('[data-field="selection-path"]').textContent = element ? elementPath(element) : 'Выберите элемент на странице';
    this.get<HTMLElement>('[data-field="insert-selection"]').textContent = element ? describeElement(element) : 'Место выбирается на странице';
    this.get<HTMLButtonElement>('[data-action="insert"]').disabled = !element;
    if (!element) { this.renderProposal(); return; }

    this.get<HTMLElement>('[data-field="selected-label"]').textContent = describeElement(element);
    this.get<HTMLElement>('[data-field="selected-tag"]').textContent = element.tagName;
    this.get<HTMLButtonElement>('[data-action="select-parent"]').disabled = !element.parentElement || ['BODY', 'HTML'].includes(element.parentElement.tagName);
    const text = this.get<HTMLTextAreaElement>('[data-field="text"]');
    text.value = element.textContent ?? '';
    text.disabled = element.childElementCount > 0;
    this.get<HTMLElement>('[data-field="text-help"]').textContent = text.disabled
      ? 'Сложный элемент содержит вложенную разметку: его текст не заменяется целиком.'
      : 'Изменение сразу видно на странице. Сохраните черновик, когда всё готово.';

    const attribute = element.tagName === 'A' ? 'href' : element.tagName === 'IMG' ? 'src' : 'class';
    this.get<HTMLInputElement>('[data-field="attribute-name"]').value = attribute;
    this.get<HTMLInputElement>('[data-field="attribute-value"]').value = element.getAttribute(attribute) ?? '';
    this.get<HTMLInputElement>('[data-field="attribute-remove"]').checked = false;
    this.renderProposal();
  }

  updateSession(state: EditorSessionState): void {
    if (this.selected && !this.selected.isConnected) this.actions.selectElement(null);
    this.get<HTMLButtonElement>('[data-action="undo"]').disabled = !state.canUndo;
    this.get<HTMLButtonElement>('[data-action="redo"]').disabled = !state.canRedo;
    this.get<HTMLElement>('[data-field="history-count"]').textContent = String(state.operationCount);
    this.get<HTMLElement>('[data-field="pending-count"]').textContent = String(state.pendingOperationCount);
    this.get<HTMLElement>('[data-field="pending-label"]').dataset.empty = String(state.pendingOperationCount === 0);
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
      title.textContent = `${index + 1}. ${operationLabel(change.operation)}`;
      const id = this.document.createElement('code');
      id.textContent = change.operation.id;
      const target = this.document.createElement('span');
      target.textContent = `target: ${describeTarget(change.operation.target)}`;
      const detail = this.document.createElement('span');
      detail.textContent = `${change.code ?? (change.committed ? 'SAVED' : 'PENDING')}${change.message ? ` — ${change.message}` : ''}`;
      const value = this.document.createElement('span');
      value.textContent = operationValue(change.operation);
      summary.append(title, value);
      summary.addEventListener('mouseenter', () => this.actions.highlightChange(change.nodeElement));
      summary.addEventListener('mouseleave', () => this.actions.highlightChange(null));
      summary.addEventListener('click', () => { if (change.nodeElement?.isConnected) this.actions.selectElement(change.nodeElement); });
      item.appendChild(summary);
      const status = this.document.createElement('div');
      status.className = 'change-status';
      status.textContent = change.committed ? 'Сохранено' : ({applied: 'Локально', skipped: 'Пропущено', error: 'Ошибка'}[change.status]);
      item.appendChild(status);
      const diagnostics = this.document.createElement('details');
      diagnostics.className = 'change-details';
      diagnostics.open = change.status !== 'applied';
      const caption = this.document.createElement('summary');
      caption.textContent = 'Детали операции';
      const protocol = this.document.createElement('p');
      protocol.textContent = `${change.operation.kind} · ${change.status}`;
      diagnostics.append(caption, protocol, id, target, detail);
      item.appendChild(diagnostics);
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
    for (const select of this.positionSelects) select.destroy();
    this.panelDrag.destroy();
    this.drag.destroy();
    this.actions.cancelCapture();
    if (this.previewMode) this.actions.setPreviewMode(false);
    this.controller.abort();
    this.styles.destroy();
    this.host.remove();
  }

  flushStyles(): void { this.styles.flush(); }

  private bindEvents(): void {
    const { signal } = this.controller;
    this.get('[data-action="close"]').addEventListener('click', () => this.actions.close(), { signal });
    for (const tab of this.shadow.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      tab.addEventListener('click', () => this.setMode(tab.dataset.mode as typeof this.mode), {signal});
      tab.addEventListener('keydown', event => {
        const modes = ['edit', 'add', 'history'] as const;
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (modes.indexOf(this.mode) + (event.key === 'ArrowDown' ? 1 : 2)) % 3;
        this.setMode(modes[index]!);
        this.get<HTMLButtonElement>(`[data-mode="${this.mode}"]`).focus();
      }, {signal});
    }
    this.get('[data-action="preview"]').addEventListener('click', () => this.setPreview(!this.previewMode), {signal});
    this.document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.previewMode) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.setPreview(false);
      } else if (event.key === 'Escape' && this.capturingDestination) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancelDestination();
        this.setStatus('Выбор места отменён.');
      }
    }, {capture: true, signal});
    this.document.defaultView?.addEventListener('resize', () => this.updateViewport(), {signal});
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

  private setMode(mode: typeof this.mode): void {
    this.styles.flush();
    this.closeSelects();
    if (this.capturingDestination) this.setStatus('Выбор места отменён.');
    this.cancelDestination();
    this.mode = mode;
    if (this.previewMode) this.setPreview(false);
    this.drag.setEnabled(mode === 'add');
    for (const tab of this.shadow.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      const active = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const view of this.shadow.querySelectorAll<HTMLElement>('[data-mode-view]')) view.hidden = view.dataset.modeView !== mode;
    this.get<HTMLElement>('[data-field="mode-title"]').textContent = {edit: 'Редактирование', add: 'Добавление', history: 'История изменений'}[mode];
  }

  private setPreview(active: boolean): void {
    this.styles.flush();
    this.closeSelects();
    this.cancelDestination();
    this.previewMode = active;
    const panel = this.get<HTMLElement>('.panel');
    if (active) panel.dataset.preview = 'true';
    else delete panel.dataset.preview;
    this.drag.setEnabled(!active && this.mode === 'add');
    this.get('[data-action="preview"]').setAttribute('aria-pressed', String(active));
    this.actions.setPreviewMode(active);
    this.panelDrag.reflow();
  }

  private updateViewport(): void {
    this.get<HTMLElement>('[data-field="viewport"]').textContent = `${this.document.defaultView?.innerWidth ?? this.document.documentElement.clientWidth} px`;
  }

  private chooseTemplate(template: string): void {
    const position = this.insertPosition;
    this.setStatus('Кликните по элементу страницы, рядом с которым нужно вставить блок. Escape — отмена.');
    this.capturingDestination = true;
    this.actions.captureDestination(target => void this.insertTemplate(template, target, position));
  }

  private async insertTemplate(template: string, target: Element, position: InsertPosition): Promise<void> {
    this.cancelDestination();
    const node = templateNode(template);
    if (!node || !target.isConnected) return;
    const id = createOperationId('insert');
    const report = await this.preview({schemaVersion: 1, id, kind: 'insertNode', target: buildTargetDescriptor(target), position, node}, undefined, target);
    if (report?.applied) {
      const inserted = this.document.querySelector(`[data-lykar-operation-id="${id}"]`);
      if (inserted) this.actions.selectElement(inserted);
    }
  }

  private cancelDestination(): void {
    this.capturingDestination = false;
    this.actions.cancelCapture();
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
    const {property, value, priority = '', transactionId, intent} = change;
    const element = this.selected;
    if (!element || !property) return;
    const style = (element as Element & {style?: CSSStyleDeclaration}).style;
    const beforeValue = style?.getPropertyValue(property) ?? '';
    const beforePriority = style?.getPropertyPriority(property) ?? '';
    const beforeComputed = this.document.defaultView?.getComputedStyle(element).getPropertyValue(property).trim() ?? '';
    if (change.group && change.group.length > 1) {
      const operations: Operation[] = change.group.map(member => ({
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
    }, transactionId ? `${this.selectionKey}:style:${property}:${transactionId}` : undefined, element, intent);
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
    this.styles.flush();
    try {
      const report = await this.actions.resetStyle(this.selected, property);
      this.styles.refresh(false, property);
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
    const operation: Operation = remove
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
    const position = this.insertPosition;
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
    const position = this.movePosition;
    this.setStatus('Кликните по элементу назначения на странице.');
    this.capturingDestination = true;
    this.actions.captureDestination(destination => {
      this.capturingDestination = false;
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
    this.capturingDestination = true;
    this.actions.captureDestination(element => {
      this.capturingDestination = false;
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
        const validation = validateOperation(operation);
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

  private async preview(operation: Operation, key?: string, element?: Element | null, intent?: 'priority'): Promise<EditorApplyReport | null> {
    try {
      const report = await this.actions.preview(operation, key, element, intent);
      const tone = report.errors > 0 ? 'error' : 'success';
      this.setStatus(
        report.errors > 0
          ? report.operations[0]?.message ?? 'Изменение не выполнено.'
          : 'Изменение видно на странице. Сохраните черновик, когда всё готово.',
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
        'Версия обновлена. Проверьте локальные изменения и сохраните черновик.',
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
    style.textContent = SELECT_CSS + PANEL_CSS;
    return style;
  }

  private buildMarkup(pagePath: string): HTMLElement {
    const panel = this.document.createElement('aside');
    panel.className = 'panel';
    panel.setAttribute('aria-label', 'Lykar visual editor');
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = panelMarkup();
    const pageName = panel.querySelector<HTMLElement>('[data-field="page-name"]')!;
    pageName.textContent = pagePath === '/' ? 'Главная страница' : this.document.title.trim() || pagePath.split('/').filter(Boolean).join(' › ');
    pageName.title = `Страница: ${pageName.textContent}`;
    return panel;
  }

  private replacePositionSelect(field: string, onChange: (position: InsertPosition) => void): void {
    const native = this.get<HTMLSelectElement>(`[data-field="${field}"]`);
    const select = new Select(this.document, {
      label: native.getAttribute('aria-label') ?? field, searchable: false,
      options: Array.from(native.options).map(option => ({value: option.value, label: option.textContent ?? option.value})),
      onChange: value => onChange(value as InsertPosition),
    });
    select.element.dataset.field = field;
    select.setValue(native.value);
    native.replaceWith(select.element);
    this.positionSelects.push(select);
  }

  private closeSelects(): void {
    this.styles.closeSelects();
    for (const select of this.positionSelects) select.close();
  }
}

function describeElement(element: Element): string {
  const id = element.getAttribute('id');
  const classes = Array.from(element.classList).slice(0, 3).join('.');
  return `${element.tagName.toLowerCase()}${id ? `#${id}` : ''}${classes ? `.${classes}` : ''}`;
}

function elementPath(element: Element): string {
  const path: string[] = [];
  for (let node: Element | null = element; node && node.tagName !== 'BODY' && path.length < 4; node = node.parentElement) path.unshift(node.tagName.toLowerCase());
  return path.join(' › ');
}

function operationLabel(operation: Operation): string {
  switch (operation.kind) {
    case 'setText': return 'Текст изменён';
    case 'setStyle': return `Стиль · ${operation.property}`;
    case 'setAttribute': return `Атрибут · ${operation.name}`;
    case 'removeAttribute': return `Атрибут удалён · ${operation.name}`;
    case 'insertNode': return `Добавлен ${operation.node.type === 'element' ? `<${operation.node.tag}>` : 'текст'}`;
    case 'removeNode': return 'Элемент удалён';
    case 'moveNode': return 'Элемент перемещён';
  }
}

function operationValue(operation: Operation): string {
  if ('value' in operation) return String(operation.value).slice(0, 120) || 'Значение удалено';
  return describeTarget(operation.target);
}

function templateNode(template: string): SerializedNode | null {
  const text = (value: string): SerializedNode => ({type: 'text', value});
  switch (template) {
    case 'text': return {type: 'element', tag: 'p', children: [text('Новый текст')]};
    case 'button': return {type: 'element', tag: 'button', attributes: {type: 'button'}, children: [text('Новая кнопка')]};
    // The image starts with an accessible placeholder; its URL is editable in
    // the attribute field and passes through the runtime's URL validation.
    case 'image': return {type: 'element', tag: 'img', attributes: {alt: 'Новое изображение', width: '320', height: '180'}};
    case 'container': return {type: 'element', tag: 'div', children: [{type: 'element', tag: 'p', children: [text('Новый блок')]}]};
    default: return null;
  }
}

function describeTarget(target: Operation['target']): string {
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
