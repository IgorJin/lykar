import type { InsertPosition, OperationV1 } from '@lykar/protocol';

import { createOperationId } from './operation-id.js';
import type { EditorProposal, ProposalProvider } from './proposal.js';
import type { EditorApplyReport, EditorSessionState } from './session.js';
import { buildTargetDescriptor, serializeEditableElement } from './target-builder.js';

export type SidePanelActions = {
  apply: (operations: OperationV1[]) => Promise<EditorApplyReport>;
  undo: () => void;
  redo: () => Promise<void>;
  close: () => void;
  captureDestination: (callback: (element: Element) => void) => void;
};

export class SidePanel {
  readonly host: HTMLDivElement;

  private readonly document: Document;
  private readonly actions: SidePanelActions;
  private readonly proposalProvider: ProposalProvider;
  private readonly shadow: ShadowRoot | HTMLDivElement;
  private readonly controller = new AbortController();
  private selected: Element | null = null;
  private stagedOperations: OperationV1[] = [];
  private proposal: EditorProposal | null = null;

  constructor(
    document: Document,
    pagePath: string,
    actions: SidePanelActions,
    proposalProvider: ProposalProvider,
  ) {
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
    this.stagedOperations = [];
    this.proposal = null;

    const empty = this.get<HTMLElement>('[data-view="empty"]');
    const editor = this.get<HTMLElement>('[data-view="editor"]');
    empty.hidden = Boolean(element);
    editor.hidden = !element;
    if (!element) return;

    this.get<HTMLElement>('[data-field="selected-label"]').textContent = describeElement(element);
    const text = this.get<HTMLTextAreaElement>('[data-field="text"]');
    text.value = element.textContent ?? '';
    text.disabled = element.childElementCount > 0;
    this.get<HTMLElement>('[data-field="text-help"]').textContent = text.disabled
      ? 'Текст сложного элемента не заменяется, чтобы не удалить вложенную разметку.'
      : 'Изменение будет применено только после нажатия «Применить».';

    const styled = element as HTMLElement;
    this.get<HTMLInputElement>('[data-field="style-property"]').value = 'color';
    this.get<HTMLInputElement>('[data-field="style-value"]').value = styled.style?.getPropertyValue('color') ?? '';

    const suggestedAttribute = element.tagName === 'A' ? 'href' : element.tagName === 'IMG' ? 'src' : 'class';
    this.get<HTMLInputElement>('[data-field="attribute-name"]').value = suggestedAttribute;
    this.get<HTMLInputElement>('[data-field="attribute-value"]').value = element.getAttribute(suggestedAttribute) ?? '';
    this.get<HTMLInputElement>('[data-field="attribute-remove"]').checked = false;
    this.updateStaged();
    this.renderProposal();
  }

  updateSession(state: EditorSessionState): void {
    this.get<HTMLButtonElement>('[data-action="undo"]').disabled = !state.canUndo;
    this.get<HTMLButtonElement>('[data-action="redo"]').disabled = !state.canRedo;
    this.get<HTMLElement>('[data-field="history-count"]').textContent = String(state.operationCount);
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
    this.get('[data-action="apply"]').addEventListener('click', () => void this.apply(), { signal });
    this.get('[data-action="stage-delete"]').addEventListener('click', () => this.stageDelete(), { signal });
    this.get('[data-action="stage-duplicate"]').addEventListener('click', () => this.stageDuplicate(), { signal });
    this.get('[data-action="stage-insert"]').addEventListener('click', () => this.stageInsert(), { signal });
    this.get('[data-action="choose-destination"]').addEventListener('click', () => this.chooseDestination(), { signal });
    this.get('[data-action="dummy-proposal"]').addEventListener('click', () => void this.loadProposal(), { signal });
    this.get('[data-action="accept-proposal"]').addEventListener('click', () => this.acceptProposal(), { signal });
    this.get('[data-action="clear-staged"]').addEventListener('click', () => {
      this.stagedOperations = [];
      this.updateStaged();
    }, { signal });
  }

  private async apply(): Promise<void> {
    const selected = this.selected;
    if (!selected) return;

    const operations = this.collectFieldOperations(selected).concat(this.stagedOperations);
    if (operations.length === 0) {
      this.setStatus('Нет подготовленных изменений.');
      return;
    }

    const button = this.get<HTMLButtonElement>('[data-action="apply"]');
    button.disabled = true;
    this.setStatus('Применяю локальный batch…');
    try {
      const report = await this.actions.apply(operations);
      this.stagedOperations = [];
      this.updateStaged();
      const tone = report.errors > 0 ? 'error' : 'success';
      this.setStatus(
        `Применено: ${report.applied}, пропущено: ${report.skipped}, ошибок: ${report.errors}.`,
        tone,
      );
      if (selected.isConnected) this.setSelected(selected);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  private collectFieldOperations(element: Element): OperationV1[] {
    const operations: OperationV1[] = [];
    const target = buildTargetDescriptor(element);
    const text = this.get<HTMLTextAreaElement>('[data-field="text"]');
    if (!text.disabled && text.value !== (element.textContent ?? '')) {
      operations.push({
        schemaVersion: 1,
        id: createOperationId('text'),
        kind: 'setText',
        target,
        value: text.value,
      });
    }

    const property = this.get<HTMLInputElement>('[data-field="style-property"]').value.trim();
    const value = this.get<HTMLInputElement>('[data-field="style-value"]').value;
    const styled = element as HTMLElement;
    if (property && value !== (styled.style?.getPropertyValue(toKebab(property)) ?? '')) {
      operations.push({
        schemaVersion: 1,
        id: createOperationId('style'),
        kind: 'setStyle',
        target,
        property,
        value,
      });
    }

    const attributeName = this.get<HTMLInputElement>('[data-field="attribute-name"]').value.trim();
    const attributeValue = this.get<HTMLInputElement>('[data-field="attribute-value"]').value;
    const removeAttribute = this.get<HTMLInputElement>('[data-field="attribute-remove"]').checked;
    if (attributeName) {
      if (removeAttribute && element.hasAttribute(attributeName)) {
        operations.push({
          schemaVersion: 1,
          id: createOperationId('remove-attribute'),
          kind: 'removeAttribute',
          target,
          name: attributeName,
        });
      } else if (!removeAttribute && attributeValue !== (element.getAttribute(attributeName) ?? '')) {
        operations.push({
          schemaVersion: 1,
          id: createOperationId('attribute'),
          kind: 'setAttribute',
          target,
          name: attributeName,
          value: attributeValue,
        });
      }
    }

    return operations;
  }

  private stageDelete(): void {
    if (!this.selected) return;
    this.stagedOperations.push({
      schemaVersion: 1,
      id: createOperationId('remove'),
      kind: 'removeNode',
      target: buildTargetDescriptor(this.selected),
    });
    this.updateStaged('Удаление добавлено в batch.');
  }

  private stageDuplicate(): void {
    if (!this.selected) return;
    try {
      this.stagedOperations.push({
        schemaVersion: 1,
        id: createOperationId('duplicate'),
        kind: 'insertNode',
        target: buildTargetDescriptor(this.selected),
        position: 'after',
        node: serializeEditableElement(this.selected),
      });
      this.updateStaged('Дублирование добавлено в batch.');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  private stageInsert(): void {
    if (!this.selected) return;
    const tag = this.get<HTMLInputElement>('[data-field="insert-tag"]').value.trim().toLowerCase();
    const text = this.get<HTMLInputElement>('[data-field="insert-text"]').value;
    const position = this.get<HTMLSelectElement>('[data-field="insert-position"]').value as InsertPosition;
    this.stagedOperations.push({
      schemaVersion: 1,
      id: createOperationId('insert'),
      kind: 'insertNode',
      target: buildTargetDescriptor(this.selected),
      position,
      node: {
        type: 'element',
        tag,
        ...(text ? { children: [{ type: 'text', value: text }] } : {}),
      },
    });
    this.updateStaged(`<${tag}> добавлен в batch.`);
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
      this.stagedOperations.push({
        schemaVersion: 1,
        id: createOperationId('move'),
        kind: 'moveNode',
        target: buildTargetDescriptor(source),
        destination: buildTargetDescriptor(destination),
        position,
      });
      this.updateStaged('Перемещение добавлено в batch.');
    });
  }

  private async loadProposal(): Promise<void> {
    if (!this.selected) return;
    this.setStatus('Формирую dummy-предложение…');
    this.proposal = await this.proposalProvider.propose(this.selected);
    this.renderProposal();
    this.setStatus('Dummy-предложение готово. Внешний API не использовался.', 'success');
  }

  private acceptProposal(): void {
    if (!this.proposal) return;
    this.stagedOperations.push(...this.proposal.operations);
    this.proposal = null;
    this.renderProposal();
    this.updateStaged('Предложение добавлено в batch.');
  }

  private updateStaged(message?: string): void {
    this.get<HTMLElement>('[data-field="staged-count"]').textContent = String(this.stagedOperations.length);
    if (message) this.setStatus(message, 'success');
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
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      .panel { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 360px; z-index: 2147483647; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; color: #111827; box-shadow: 0 20px 60px rgba(15,23,42,.25); font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif; }
      header { padding: 14px 16px 10px; border-bottom: 1px solid #e5e7eb; background: #fafafa; }
      h1 { margin: 0; font-size: 16px; }
      .path { margin-top: 3px; color: #6b7280; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .toolbar { display: flex; gap: 6px; margin-top: 10px; }
      .body { flex: 1; overflow: auto; padding: 14px 16px 90px; }
      section { margin: 0 0 18px; padding-bottom: 16px; border-bottom: 1px solid #eef0f3; }
      h2 { margin: 0 0 9px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
      label { display: block; margin: 8px 0 4px; font-weight: 600; }
      input, textarea, select, button { font: inherit; }
      input, textarea, select { width: 100%; border: 1px solid #d1d5db; border-radius: 7px; padding: 8px 9px; background: #fff; color: #111827; }
      textarea { min-height: 82px; resize: vertical; }
      input:focus, textarea:focus, select:focus { outline: 2px solid #c4b5fd; border-color: #8b5cf6; }
      button { border: 1px solid #d1d5db; border-radius: 7px; padding: 7px 10px; background: #fff; color: #111827; cursor: pointer; }
      button:hover { background: #f3f4f6; }
      button:disabled { opacity: .45; cursor: default; }
      button.primary { border-color: #7c3aed; background: #7c3aed; color: #fff; font-weight: 700; }
      button.danger { color: #b91c1c; }
      .row { display: grid; grid-template-columns: 1fr 1.35fr; gap: 8px; }
      .actions { display: flex; flex-wrap: wrap; gap: 7px; }
      .help { margin: 5px 0 0; color: #6b7280; font-size: 11px; }
      .selected { padding: 8px 10px; border-radius: 8px; background: #f5f3ff; color: #5b21b6; font-family: ui-monospace, monospace; }
      .check { display: flex; align-items: center; gap: 7px; font-weight: 400; }
      .check input { width: auto; }
      .status { position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 9px; background: rgba(255,255,255,.96); box-shadow: 0 5px 20px rgba(15,23,42,.12); }
      .status[data-tone="success"] { border-color: #86efac; color: #166534; }
      .status[data-tone="error"] { border-color: #fca5a5; color: #991b1b; }
      .proposal { padding: 10px; border: 1px solid #fcd34d; border-radius: 8px; background: #fffbeb; }
      .proposal strong { display: block; margin-bottom: 4px; }
      .footer-actions { display: flex; gap: 8px; }
      .footer-actions .primary { flex: 1; }
      [hidden] { display: none !important; }
    `;
    return style;
  }

  private buildMarkup(pagePath: string): HTMLElement {
    const panel = this.document.createElement('aside');
    panel.className = 'panel';
    panel.innerHTML = `
      <header>
        <h1>Lykar Editor</h1>
        <div class="path"></div>
        <div class="toolbar">
          <button type="button" data-action="undo" title="Отменить">↶</button>
          <button type="button" data-action="redo" title="Повторить">↷</button>
          <button type="button" data-action="close" title="Закрыть редактор">Закрыть</button>
          <span style="margin-left:auto;color:#6b7280">Команд: <b data-field="history-count">0</b></span>
        </div>
      </header>
      <div class="body">
        <div data-view="empty"><p>Наведите курсор и кликните по элементу страницы.</p></div>
        <div data-view="editor">
          <section>
            <h2>Выбранный элемент</h2>
            <div class="selected" data-field="selected-label"></div>
          </section>
          <section>
            <h2>Текст</h2>
            <textarea data-field="text" aria-label="Element text"></textarea>
            <p class="help" data-field="text-help"></p>
          </section>
          <section>
            <h2>Inline style</h2>
            <div class="row">
              <input data-field="style-property" aria-label="CSS property" placeholder="color">
              <input data-field="style-value" aria-label="CSS value" placeholder="#111827">
            </div>
          </section>
          <section>
            <h2>Атрибут</h2>
            <div class="row">
              <input data-field="attribute-name" aria-label="Attribute name" placeholder="href">
              <input data-field="attribute-value" aria-label="Attribute value" placeholder="/pricing">
            </div>
            <label class="check"><input type="checkbox" data-field="attribute-remove"> Удалить атрибут</label>
          </section>
          <section>
            <h2>Структура</h2>
            <div class="actions">
              <button type="button" data-action="stage-duplicate">Дублировать</button>
              <button type="button" class="danger" data-action="stage-delete">Удалить</button>
            </div>
            <label>Добавить элемент</label>
            <div class="row"><input data-field="insert-tag" value="div" aria-label="Tag"><input data-field="insert-text" placeholder="Текст" aria-label="Inserted text"></div>
            <div class="row" style="margin-top:8px"><select data-field="insert-position"><option value="after">После</option><option value="before">До</option><option value="append">Внутрь, в конец</option><option value="prepend">Внутрь, в начало</option></select><button type="button" data-action="stage-insert">Добавить в batch</button></div>
            <label>Переместить</label>
            <div class="row"><select data-field="move-position"><option value="append">Внутрь назначения</option><option value="before">Перед назначением</option><option value="after">После назначения</option><option value="prepend">В начало назначения</option></select><button type="button" data-action="choose-destination">Выбрать место</button></div>
          </section>
          <section>
            <h2>Предложение агента</h2>
            <button type="button" data-action="dummy-proposal">Создать dummy-предложение</button>
            <div class="proposal" data-view="proposal" hidden style="margin-top:8px"><strong data-field="proposal-title"></strong><span data-field="proposal-description"></span><button type="button" data-action="accept-proposal" style="margin-top:8px">Добавить в batch</button></div>
          </section>
          <section>
            <h2>Подготовлено: <span data-field="staged-count">0</span></h2>
            <div class="footer-actions"><button type="button" data-action="clear-staged">Очистить</button><button type="button" class="primary" data-action="apply">Применить</button></div>
          </section>
        </div>
      </div>
      <div class="status" data-field="status" data-tone="neutral">Редактор работает локально. Backend не вызывается.</div>
    `;
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
