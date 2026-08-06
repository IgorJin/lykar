import type { InsertPosition, OperationV1 } from '@lykar/protocol';

import { createOperationId } from './operation-id.js';
import type { EditorProposal, ProposalProvider } from './proposal.js';
import type { EditorApplyReport, EditorChange, EditorSessionState } from './session.js';
import { buildTargetDescriptor, serializeEditableElement } from './target-builder.js';

export type SidePanelActions = {
  preview: (operation: OperationV1, key?: string, nodeElement?: Element | null) => Promise<EditorApplyReport>;
  commit: () => Promise<{ saved: number; revision?: number }>;
  undo: () => void;
  redo: () => Promise<void>;
  close: () => void;
  captureDestination: (callback: (element: Element) => void) => void;
  highlightChange: (element: Element | null) => void;
};

export class SidePanel {
  readonly host: HTMLDivElement;

  private readonly document: Document;
  private readonly actions: SidePanelActions;
  private readonly proposalProvider: ProposalProvider;
  private readonly shadow: ShadowRoot | HTMLDivElement;
  private readonly controller = new AbortController();
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
    document.body.appendChild(this.host);
    this.bindEvents();
    this.setSelected(null);
  }

  setSelected(element: Element | null): void {
    this.selected = element;
    this.proposal = null;
    this.selectionKey = `selection-${++this.selectionSequence}`;
    this.get<HTMLElement>('[data-view="empty"]').hidden = Boolean(element);
    this.get<HTMLElement>('[data-view="editor"]').hidden = !element;
    if (!element) return;

    this.get<HTMLElement>('[data-field="selected-label"]').textContent = describeElement(element);
    const text = this.get<HTMLTextAreaElement>('[data-field="text"]');
    text.value = element.textContent ?? '';
    text.disabled = element.childElementCount > 0;
    this.get<HTMLElement>('[data-field="text-help"]').textContent = text.disabled
      ? 'Сложный элемент содержит вложенную разметку: его текст не заменяется целиком.'
      : 'Изменение показывается на странице сразу и остаётся локальным до «Применить».';

    const styled = element as HTMLElement;
    this.get<HTMLInputElement>('[data-field="style-property"]').value = 'color';
    this.get<HTMLInputElement>('[data-field="style-value"]').value = styled.style?.getPropertyValue('color') ?? '';
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
      const item = this.document.createElement('button');
      item.type = 'button';
      item.className = `change change-${change.status}`;
      const title = this.document.createElement('strong');
      title.textContent = `${index + 1}. ${change.operation.kind}`;
      const detail = this.document.createElement('span');
      detail.textContent = change.message ?? change.code ?? (change.committed ? 'сохранено' : 'локально');
      item.append(title, detail);
      item.addEventListener('mouseenter', () => this.actions.highlightChange(change.nodeElement));
      item.addEventListener('mouseleave', () => this.actions.highlightChange(null));
      tree.appendChild(item);
    });
  }

  setStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
    const status = this.get<HTMLElement>('[data-field="status"]');
    status.textContent = message;
    status.dataset.tone = tone;
  }

  destroy(): void {
    this.controller.abort();
    this.host.remove();
  }

  private bindEvents(): void {
    const { signal } = this.controller;
    this.get('[data-action="close"]').addEventListener('click', () => this.actions.close(), { signal });
    this.get('[data-action="undo"]').addEventListener('click', () => this.actions.undo(), { signal });
    this.get('[data-action="redo"]').addEventListener('click', () => void this.actions.redo(), { signal });
    this.get('[data-action="apply"]').addEventListener('click', () => void this.commit(), { signal });
    this.get('[data-field="text"]').addEventListener('input', () => void this.previewText(), { signal });
    this.get('[data-field="style-value"]').addEventListener('input', () => void this.previewStyle(), { signal });
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

  private async previewStyle(): Promise<void> {
    const element = this.selected;
    const property = this.get<HTMLInputElement>('[data-field="style-property"]').value.trim();
    if (!element || !property) return;
    await this.preview({
      schemaVersion: 1,
      id: createOperationId('style'),
      kind: 'setStyle',
      target: buildTargetDescriptor(element),
      property,
      value: this.get<HTMLInputElement>('[data-field="style-value"]').value,
    }, `${this.selectionKey}:style:${toKebab(property)}`, element);
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

  private async loadProposal(): Promise<void> {
    if (!this.selected) return;
    this.setStatus('Формирую dummy-предложение…');
    this.proposal = await this.proposalProvider.propose(this.selected);
    this.renderProposal();
    this.setStatus('Dummy-предложение готово. Внешний API не использовался.', 'success');
  }

  private async acceptProposal(): Promise<void> {
    const element = this.selected;
    if (!this.proposal || !element) return;
    const proposal = this.proposal;
    this.proposal = null;
    this.renderProposal();
    for (const operation of proposal.operations) await this.preview(operation, undefined, element);
  }

  private async preview(operation: OperationV1, key?: string, element?: Element | null): Promise<void> {
    try {
      const report = await this.actions.preview(operation, key, element);
      const tone = report.errors > 0 ? 'error' : 'success';
      this.setStatus(
        report.errors > 0
          ? report.operations[0]?.message ?? 'Изменение не выполнено.'
          : 'Локальный preview обновлён. Для сохранения нажмите «Применить».',
        tone,
      );
    } catch (error) {
      this.setStatus(errorMessage(error), 'error');
    }
  }

  private async commit(): Promise<void> {
    const button = this.get<HTMLButtonElement>('[data-action="apply"]');
    button.disabled = true;
    this.setStatus('Сохраняю последовательность изменений…');
    try {
      const result = await this.actions.commit();
      this.setStatus(`Сохранено команд: ${result.saved}${result.revision !== undefined ? `, revision: ${result.revision}` : ''}.`, 'success');
    } catch (error) {
      this.setStatus(errorMessage(error), 'error');
    }
  }

  private renderProposal(): void {
    const container = this.get<HTMLElement>('[data-view="proposal"]');
    container.hidden = !this.proposal;
    if (!this.proposal) return;
    this.get<HTMLElement>('[data-field="proposal-title"]').textContent = this.proposal.title;
    this.get<HTMLElement>('[data-field="proposal-description"]').textContent = this.proposal.description;
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
      .panel { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 380px; z-index: 2147483647; display:flex; flex-direction:column; overflow:hidden; border:1px solid #e5e7eb; border-radius:14px; background:#fff; color:#111827; box-shadow:0 20px 60px rgba(15,23,42,.25); font:13px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif; }
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
      .change { width:100%; display:flex; justify-content:space-between; gap:8px; margin:0 0 6px; text-align:left; }
      .change span { color:#6b7280; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .change-error { border-color:#ef4444; background:#fef2f2; } .change-skipped { border-color:#f59e0b; background:#fffbeb; }
      .footer-actions .primary { flex:1; } [hidden] { display:none !important; }
    `;
    return style;
  }

  private buildMarkup(pagePath: string): HTMLElement {
    const panel = this.document.createElement('aside');
    panel.className = 'panel';
    panel.innerHTML = `
      <header><h1>Lykar Editor</h1><div class="path"></div><div class="toolbar">
        <button type="button" data-action="undo">↶</button><button type="button" data-action="redo">↷</button><button type="button" data-action="close">Закрыть</button>
        <span style="margin-left:auto;color:#6b7280">Команд: <b data-field="history-count">0</b></span>
      </div></header>
      <div class="body">
        <div data-view="empty"><p>Наведите курсор и кликните по элементу страницы.</p></div>
        <div data-view="editor">
          <section><h2>Выбранный элемент</h2><div class="selected" data-field="selected-label"></div></section>
          <section><h2>Текст</h2><textarea data-field="text" aria-label="Element text"></textarea><p class="help" data-field="text-help"></p></section>
          <section><h2>Inline style</h2><div class="row"><input data-field="style-property" aria-label="CSS property"><input data-field="style-value" aria-label="CSS value"></div></section>
          <section><h2>Атрибут</h2><div class="row"><input data-field="attribute-name" aria-label="Attribute name"><input data-field="attribute-value" aria-label="Attribute value"></div><label class="check"><input type="checkbox" data-field="attribute-remove"> Удалить атрибут</label></section>
          <section><h2>Структура</h2><div class="actions"><button type="button" data-action="duplicate">Дублировать</button><button type="button" class="danger" data-action="delete">Удалить</button></div>
            <label>Добавить элемент</label><div class="row"><input data-field="insert-tag" value="div"><input data-field="insert-text" placeholder="Текст"></div>
            <div class="row" style="margin-top:8px"><select data-field="insert-position"><option value="after">После</option><option value="before">До</option><option value="append">Внутрь, в конец</option><option value="prepend">Внутрь, в начало</option></select><button type="button" data-action="insert">Добавить</button></div>
            <label>Переместить</label><div class="row"><select data-field="move-position"><option value="append">Внутрь назначения</option><option value="before">Перед назначением</option><option value="after">После назначения</option><option value="prepend">В начало назначения</option></select><button type="button" data-action="choose-destination">Выбрать место</button></div>
          </section>
          <section><h2>Предложение агента</h2><button type="button" data-action="dummy-proposal">Создать dummy-предложение</button><div class="proposal" data-view="proposal" hidden style="margin-top:8px"><strong data-field="proposal-title"></strong><span data-field="proposal-description"></span><button type="button" data-action="accept-proposal" style="margin-top:8px">Принять</button></div></section>
        </div>
        <section><h2>Дерево изменений</h2><div data-view="change-tree"></div></section>
        <section><div class="footer-actions"><button type="button" class="primary" data-action="apply">Применить (<span data-field="pending-count">0</span>)</button></div></section>
      </div>
      <div class="status" data-field="status" data-tone="neutral">Изменения показываются локально. «Применить» сохраняет их в draft.</div>`;
    panel.querySelector<HTMLElement>('.path')!.textContent = pagePath;
    return panel;
  }
}

function describeElement(element: Element): string {
  const id = element.getAttribute('id');
  const classes = Array.from(element.classList).slice(0, 3).join('.');
  return `${element.tagName.toLowerCase()}${id ? `#${id}` : ''}${classes ? `.${classes}` : ''}`;
}

function toKebab(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('--') ? trimmed : trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
