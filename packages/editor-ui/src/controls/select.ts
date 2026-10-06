export type SelectOption = {value: string; label: string};

export type SelectOptions = {
  label: string;
  options: readonly SelectOption[];
  input?: HTMLInputElement;
  placeholder?: string;
  searchable?: boolean;
  onChange: (value: string) => void;
};

let selectSequence = 0;

/** A compact preset menu that can share its control with an existing raw input. */
export class Select {
  readonly element: HTMLDivElement;
  readonly trigger: HTMLButtonElement;
  private readonly controller: AbortController;
  private readonly listId = `lykar-select-options-${++selectSequence}`;
  private readonly valueText: HTMLSpanElement | null;
  private popupController: AbortController | null = null;
  private popup: HTMLDivElement | null = null;
  private list: HTMLDivElement | null = null;
  private search: HTMLInputElement | null = null;
  private filteredOptions: readonly SelectOption[] = [];
  private activeIndex = -1;
  private value = '';
  private disabled = false;
  private destroyed = false;

  constructor(private readonly document: Document, private readonly options: SelectOptions) {
    this.controller = this.makeController();
    const {signal} = this.controller;
    this.element = document.createElement('div');
    this.element.className = 'lykar-select';
    this.element.setAttribute('data-lykar-editor-root', 'select');
    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'lykar-select-trigger';
    this.trigger.setAttribute('role', 'combobox');
    this.trigger.setAttribute('aria-label', options.label);
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-controls', this.listId);
    this.trigger.title = options.label;
    if (options.input) {
      this.element.classList.add('is-editable');
      options.input.classList.add('lykar-select-input');
      this.element.append(options.input);
      this.valueText = null;
      this.value = options.input.value;
      options.input.addEventListener('input', () => this.setValue(options.input!.value), {signal});
      options.input.addEventListener('keydown', event => this.onKeyDown(event, 'input'), {capture: true, signal});
    } else {
      this.valueText = document.createElement('span');
      this.valueText.className = 'lykar-select-value';
      this.trigger.append(this.valueText);
    }
    this.trigger.append(this.icon('chevron'));
    this.element.append(this.trigger);
    this.trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (this.popup) this.close();
      else this.open();
    }, {signal});
    this.trigger.addEventListener('keydown', event => this.onKeyDown(event, 'trigger'), {signal});
    document.addEventListener('pointerdown', this.onOutside, {capture: true, signal});
    document.addEventListener('click', this.onOutside, {capture: true, signal});
    document.addEventListener('focusin', this.onOutside, {capture: true, signal});
    document.addEventListener('scroll', this.onScroll, {capture: true, passive: true, signal});
    document.defaultView?.addEventListener('resize', this.onResize, {passive: true, signal});
    this.setValue(this.value);
    this.setDisabled(Boolean(options.input?.disabled));
  }

  /** Reading computed styles must never create an authored textbox value. */
  setValue(value: string, displayValue?: string): void {
    this.value = value;
    if (this.valueText) {
      const selected = this.options.options.find(option => option.value === value);
      this.valueText.textContent = displayValue ?? selected?.label ?? (value || this.options.placeholder || 'Выберите значение');
      this.element.classList.toggle('is-placeholder', !value && !selected && !displayValue);
    }
    this.updateOptionStates();
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    this.trigger.disabled = disabled;
    this.element.classList.toggle('is-disabled', disabled);
    this.element.setAttribute('aria-disabled', String(disabled));
    if (this.options.input) this.options.input.disabled = disabled;
    if (disabled) this.close();
  }

  close(): void {
    this.popupController?.abort();
    this.popupController = null;
    this.popup?.remove();
    this.popup = null;
    this.list = null;
    this.search = null;
    this.filteredOptions = [];
    this.activeIndex = -1;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.removeAttribute('aria-activedescendant');
    this.element.classList.remove('is-open');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.close();
    this.controller.abort();
    this.element.remove();
  }

  private open(direction = 1): void {
    if (this.disabled || this.destroyed || this.popup || !this.element.isConnected) return;
    const popup = this.document.createElement('div');
    popup.className = 'lykar-select-popup';
    popup.setAttribute('data-lykar-editor-root', 'select-popup');
    this.popup = popup;
    this.popupController = this.makeController();
    const {signal} = this.popupController;
    if (this.options.searchable || this.options.options.length > 8) {
      const wrap = this.document.createElement('div');
      wrap.className = 'lykar-select-search-wrap';
      const search = this.document.createElement('input');
      search.type = 'search';
      search.className = 'lykar-select-search';
      search.setAttribute('role', 'searchbox');
      search.setAttribute('aria-label', `Поиск: ${this.options.label}`);
      search.setAttribute('aria-controls', this.listId);
      search.placeholder = 'Найти значение…';
      search.autocomplete = 'off';
      search.spellcheck = false;
      search.addEventListener('input', () => this.filter(search.value), {signal});
      search.addEventListener('keydown', event => this.onKeyDown(event, 'search'), {signal});
      wrap.append(this.icon('search'), search);
      popup.append(wrap);
      this.search = search;
    }
    const list = this.document.createElement('div');
    list.className = 'lykar-select-options';
    list.id = this.listId;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', this.options.label);
    list.addEventListener('pointerdown', event => {
      if (this.optionButton(event) && event.pointerType !== 'touch') event.preventDefault();
    }, {signal});
    list.addEventListener('pointermove', event => {
      const button = this.optionButton(event);
      if (!button) return;
      this.activeIndex = Number(button.dataset.selectIndex);
      this.updateOptionStates();
    }, {signal});
    list.addEventListener('click', event => {
      const button = this.optionButton(event);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      this.choose(Number(button.dataset.selectIndex));
    }, {signal});
    this.list = list;
    popup.append(list);
    // A ShadowRoot sibling stays outside the panel's scrolling/overflow boxes.
    const root = this.element.getRootNode();
    const portal = root.nodeType === 11 && 'host' in root ? root : this.document.documentElement;
    portal.appendChild(popup);
    // Scroll does not cross Shadow DOM boundaries. Observe the panel's root
    // as well as document scrolling, while leaving the menu's own list alone.
    if (root !== this.document) root.addEventListener('scroll', this.onScroll, {capture: true, passive: true, signal});
    this.filteredOptions = this.options.options;
    const selectedIndex = this.filteredOptions.findIndex(option => option.value === this.value);
    this.activeIndex = selectedIndex >= 0 ? selectedIndex : direction > 0 ? 0 : this.filteredOptions.length - 1;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.element.classList.add('is-open');
    this.renderOptions();
    this.positionPopup();
    this.scrollActive();
    this.search?.focus({preventScroll: true});
  }

  private filter(query: string): void {
    const normalized = query.trim().toLocaleLowerCase();
    this.filteredOptions = this.options.options.filter(option => `${option.label} ${option.value}`.toLocaleLowerCase().includes(normalized));
    const selectedIndex = this.filteredOptions.findIndex(option => option.value === this.value);
    this.activeIndex = selectedIndex >= 0 ? selectedIndex : this.filteredOptions.length ? 0 : -1;
    this.renderOptions();
    this.positionPopup();
  }

  private renderOptions(): void {
    if (!this.list) return;
    this.list.replaceChildren();
    this.filteredOptions.forEach((option, index) => {
      const row = this.document.createElement('button');
      row.type = 'button';
      row.className = 'lykar-select-option';
      row.id = `${this.listId}-${index}`;
      row.tabIndex = -1;
      row.setAttribute('role', 'option');
      row.setAttribute('data-select-option', '');
      row.dataset.value = option.value;
      row.dataset.selectIndex = String(index);
      const label = this.document.createElement('span');
      label.className = 'lykar-select-option-label';
      label.textContent = option.label;
      const check = this.icon('check');
      check.classList.add('lykar-select-check');
      row.append(label, check);
      this.list!.append(row);
    });
    if (!this.filteredOptions.length) {
      const empty = this.document.createElement('div');
      empty.className = 'lykar-select-empty';
      empty.setAttribute('role', 'status');
      empty.textContent = 'Ничего не найдено';
      this.list.append(empty);
    }
    this.updateOptionStates();
  }

  private updateOptionStates(): void {
    if (!this.list) return;
    for (const row of Array.from(this.list.querySelectorAll<HTMLButtonElement>('[data-select-option]'))) {
      const index = Number(row.dataset.selectIndex);
      row.setAttribute('aria-selected', String(this.filteredOptions[index]?.value === this.value));
      row.classList.toggle('is-active', index === this.activeIndex);
    }
    if (this.activeIndex >= 0 && this.activeIndex < this.filteredOptions.length) {
      const activeId = `${this.listId}-${this.activeIndex}`;
      this.trigger.setAttribute('aria-activedescendant', activeId);
      this.search?.setAttribute('aria-activedescendant', activeId);
    } else {
      this.trigger.removeAttribute('aria-activedescendant');
      this.search?.removeAttribute('aria-activedescendant');
    }
  }

  private onKeyDown(event: KeyboardEvent, source: 'trigger' | 'input' | 'search'): void {
    if (this.disabled || this.destroyed) return;
    if (event.key === 'Escape' && this.popup) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.closeAndFocus();
      return;
    }
    if (event.key === 'Tab' && this.popup) {
      // Resume native tab order at the control, rather than at a removed
      // search input in the portal (which can jump focus to the host page).
      this.closeAndFocus();
      return;
    }
    if (!this.popup) {
      const arrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
      const buttonKey = source === 'trigger' && ['Enter', ' ', 'Home', 'End'].includes(event.key);
      if (!arrow && !buttonKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.open(event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1);
      if (event.key === 'Home' || event.key === 'End') this.moveActive(event.key === 'Home' ? 0 : this.filteredOptions.length - 1);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? this.filteredOptions.length - 1
          : this.activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
      this.moveActive(next);
    } else if (event.key === 'Enter' || (event.key === ' ' && source === 'trigger')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.choose(this.activeIndex);
    }
  }

  private moveActive(index: number): void {
    this.activeIndex = this.filteredOptions.length ? Math.max(0, Math.min(this.filteredOptions.length - 1, index)) : -1;
    this.updateOptionStates();
    this.scrollActive();
  }

  private scrollActive(): void {
    this.list?.querySelector<HTMLElement>(`[data-select-index="${this.activeIndex}"]`)?.scrollIntoView?.({block: 'nearest'});
  }

  private choose(index: number): void {
    const option = this.filteredOptions[index];
    if (!option || this.disabled) return;
    // Only an explicit user choice writes the existing textbox. No synthetic
    // events are dispatched: the owner performs one change transaction.
    if (this.options.input) this.options.input.value = option.value;
    this.setValue(option.value);
    this.closeAndFocus();
    this.options.onChange(option.value);
  }

  private closeAndFocus(): void {
    this.close();
    if (!this.disabled && this.trigger.isConnected) this.trigger.focus({preventScroll: true});
  }

  private onOutside = (event: Event): void => {
    if (!this.popup) return;
    const path = event.composedPath();
    if (path.includes(this.element) || path.includes(this.popup)) return;
    this.close();
  };

  private onScroll = (event: Event): void => {
    if (this.popup && !event.composedPath().includes(this.popup)) this.close();
  };

  private onResize = (): void => { this.close(); };

  private positionPopup(): void {
    const popup = this.popup;
    if (!popup || !this.list) return;
    const rect = this.element.getBoundingClientRect();
    const view = this.document.defaultView;
    const viewportWidth = view?.innerWidth || this.document.documentElement.clientWidth;
    const viewportHeight = view?.innerHeight || this.document.documentElement.clientHeight;
    const margin = 8;
    const gap = 5;
    const availableWidth = Math.max(1, viewportWidth - margin * 2);
    const width = Math.min(availableWidth, Math.max(rect.width, 180));
    popup.style.width = `${width}px`;
    const searchHeight = this.search ? (this.search.parentElement?.getBoundingClientRect().height || 40) + 3 : 0;
    const desiredHeight = Math.min(320, searchHeight + Math.max(1, this.filteredOptions.length) * 34 + 12);
    const below = Math.max(0, viewportHeight - rect.bottom - margin - gap);
    const above = Math.max(0, rect.top - margin - gap);
    const flip = below < desiredHeight && above > below;
    const availableHeight = Math.max(1, viewportHeight - margin * 2);
    const maxHeight = Math.min(desiredHeight, Math.max(70, flip ? above : below), availableHeight);
    popup.style.maxHeight = `${maxHeight}px`;
    this.list.style.maxHeight = `${Math.max(0, maxHeight - searchHeight - 10)}px`;
    const height = Math.min(maxHeight, popup.getBoundingClientRect().height || desiredHeight);
    popup.style.left = `${Math.max(margin, Math.min(rect.left, viewportWidth - width - margin))}px`;
    const top = flip ? rect.top - gap - height : rect.bottom + gap;
    popup.style.top = `${Math.max(margin, Math.min(top, viewportHeight - height - margin))}px`;
    popup.dataset.placement = flip ? 'above' : 'below';
  }

  private optionButton(event: Event): HTMLButtonElement | null {
    const target = event.target as Element | null;
    const row = target?.nodeType === 1 ? target.closest<HTMLButtonElement>('button[data-select-option]') : null;
    return row && this.list?.contains(row) ? row : null;
  }

  private makeController(): AbortController {
    const Controller = this.document.defaultView?.AbortController ?? AbortController;
    return new Controller();
  }

  private icon(name: 'chevron' | 'search' | 'check'): SVGSVGElement {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = this.document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = this.document.createElementNS(namespace, 'path');
    path.setAttribute('d', {
      chevron: 'm6 9 6 6 6-6',
      search: 'm21 21-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
      check: 'm5 12 4 4 10-10',
    }[name]);
    svg.append(path);
    return svg;
  }
}

export const SELECT_CSS = `
  .lykar-select,.lykar-select-popup{box-sizing:border-box;font:12px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#362b43;letter-spacing:normal;text-transform:none}
  .lykar-select{display:flex;align-items:center;min-width:0;width:100%;height:34px;border:1px solid #ded8e8;border-radius:6px;background:#fff;overflow:hidden}
  .lykar-select:focus-within,.lykar-select.is-open{border-color:#b79bd7;box-shadow:0 0 0 2px #f3edf9}.lykar-select.is-placeholder{color:#a396ad}.lykar-select.is-disabled{opacity:.55}
  .lykar-select .lykar-select-trigger{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;width:100%;height:32px;padding:6px 8px;font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
  .lykar-select .lykar-select-trigger:disabled{opacity:1;cursor:default}.lykar-select-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lykar-select .lykar-select-trigger svg{display:block;width:15px;height:15px;flex:none;color:#9b85ac}
  .lykar-select.is-editable .lykar-select-input{box-sizing:border-box;flex:1;min-width:0;width:0;height:32px;margin:0;border:0;border-radius:0;padding:6px 8px;background:transparent;color:inherit;font:inherit;outline:0;box-shadow:none}
  .lykar-select.is-editable .lykar-select-trigger{flex:0 0 30px;width:30px;justify-content:center;padding:6px;border-left:1px solid #eee8f3}.lykar-select.is-editable .lykar-select-trigger:hover{background:#faf7fd}
  .lykar-select-popup{position:fixed;z-index:2147483647;min-width:0;margin:0;padding:4px;border:1px solid #e4dceb;border-radius:9px;background:#fff;box-shadow:0 10px 32px #49335c20,0 2px 6px #49335c0b;overflow:hidden;isolation:isolate;text-align:left}
  .lykar-select-popup *{box-sizing:border-box;font:inherit;letter-spacing:normal}.lykar-select-search-wrap{position:relative;padding:3px 3px 7px;margin-bottom:3px;border-bottom:1px solid #f0ebf4}
  .lykar-select-search-wrap>svg{position:absolute;left:11px;top:11px;display:block;width:14px;height:14px;color:#a08caf;pointer-events:none}
  .lykar-select-popup .lykar-select-search{all:unset;box-sizing:border-box;display:block;width:100%;height:30px;border:1px solid transparent;border-radius:5px;padding:5px 8px 5px 28px;background:#f8f5fb;color:#65516f;font:inherit}
  .lykar-select-popup .lykar-select-search:focus{border-color:#e1d3ec}.lykar-select-search::placeholder{color:#a897b2}
  .lykar-select-options{position:relative;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#ded3e8 transparent;padding:1px}
  .lykar-select-popup .lykar-select-option{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;min-height:32px;border-radius:5px;padding:7px 8px;color:#6a5577;font:inherit;text-align:left;cursor:pointer;touch-action:manipulation}
  .lykar-select-popup .lykar-select-option:hover,.lykar-select-popup .lykar-select-option.is-active{background:#f5effb;color:#5c3579}.lykar-select-popup .lykar-select-option[aria-selected=true]{font-weight:500}
  .lykar-select-option-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lykar-select-popup .lykar-select-check{display:block;visibility:hidden;width:14px;height:14px;flex:none;color:#8a57b4}
  .lykar-select-option[aria-selected=true] .lykar-select-check{visibility:visible}.lykar-select-empty{padding:12px 8px;color:#a08ba9;font-size:11px}
`;
