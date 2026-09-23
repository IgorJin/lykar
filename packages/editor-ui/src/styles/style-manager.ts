import {STYLE_FIELDS, STYLE_SECTIONS, normalizeCustomPropertyName} from './styles-config.js';
import type {StyleFieldDefinition} from './types.js';
import {
  decodeBorderShorthand,
  decodeBackgroundLayers,
  decodeTransformFunctions,
  encodeBackgroundLayers,
  encodeTransformFunctions,
  getExplicitDeclaration,
  hasExplicitDeclaration,
  listExplicitDeclarations,
  readCompositePart,
  splitTopLevel,
} from './css-codecs.js';

export {splitTopLevel};

export type StyleChangePart = {property: string; value: string; priority?: '' | 'important'; reset?: true};
export type StyleChange = StyleChangePart & {transactionId?: string; group?: readonly StyleChangePart[]};

/** A framework-independent, Shadow DOM-friendly view. All writes go through onChange. */
export class StyleManager {
  readonly element: HTMLElement;
  private readonly document: Document;
  private readonly onChange: (change: StyleChange) => void;
  private readonly onReset: (property: string) => void;
  private readonly onCancel: () => void;
  private readonly isDirty: (element: Element, property: string) => boolean;
  private target: Element | null = null;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly sections = new Map<string, HTMLDetailsElement>();
  private readonly compositeInputs = new Map<string, HTMLInputElement[]>();
  private readonly compositeLinked = new Map<string, HTMLInputElement>();
  private readonly customRows: HTMLElement;
  private readonly customProperty: HTMLInputElement;
  private readonly customValue: HTMLInputElement;
  private readonly customPriority: HTMLInputElement;
  private readonly customSection: HTMLDetailsElement;
  private editSequence = 0;
  private readonly search: HTMLInputElement;

  constructor(
    document: Document,
    onChange: (change: StyleChange) => void,
    onReset: (property: string) => void = () => {},
    onCancel: () => void = () => {},
    isDirty: (element: Element, property: string) => boolean = () => false,
  ) {
    this.document = document;
    this.onChange = onChange;
    this.onReset = onReset;
    this.onCancel = onCancel;
    this.isDirty = isDirty;
    const root = document.createElement('div');
    root.className = 'style-manager';
    this.element = root;
    this.search = this.makeInput('search', 'Найти CSS-свойство', 'Поиск свойства');
    this.search.addEventListener('input', () => this.filter());
    root.append(this.search);

    for (const section of STYLE_SECTIONS) {
      const details = document.createElement('details');
      details.className = 'style-section';
      details.open = Boolean(section.initiallyOpen);
      details.dataset.section = section.id;
      const summary = document.createElement('summary');
      summary.textContent = section.label;
      details.append(summary);
      details.addEventListener('toggle', () => {
        if (details.open) {
          this.ensureRows(section.id);
          this.refresh();
        }
      });
      this.sections.set(section.id, details);
      root.append(details);
      if (section.initiallyOpen) this.ensureRows(section.id);
    }

    const advanced = document.createElement('details');
    this.customSection = advanced;
    advanced.className = 'style-section';
    advanced.dataset.section = 'custom';
    const title = document.createElement('summary');
    title.textContent = 'Любое CSS-свойство';
    advanced.append(title);
    const row = document.createElement('div');
    row.className = 'style-custom-row';
    this.customProperty = this.makeInput('text', 'Свойство, например grid-column или --Accent', 'CSS property');
    this.customValue = this.makeInput('text', 'CSS-значение', 'CSS value');
    this.customPriority = this.makeInput('checkbox', '', '!important');
    const priorityLabel = document.createElement('label');
    priorityLabel.className = 'style-important';
    priorityLabel.append(this.customPriority, document.createTextNode(' !important'));
    const apply = this.makeButton('Добавить / изменить');
    const restoreCustom = this.makeButton('Вернуть исходный');
    restoreCustom.addEventListener('click', () => {
      const property = normalizeCustomPropertyName(this.customProperty.value);
      if (property) this.onReset(property);
    });
    const submit = () => {
      const property = normalizeCustomPropertyName(this.customProperty.value);
      if (this.validate(property, this.customValue.value, this.customValue)) {
        this.onChange({property, value: this.customValue.value, priority: this.customPriority.checked ? 'important' : ''});
      }
    };
    apply.addEventListener('click', submit);
    this.customValue.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    row.append(this.customProperty, this.customValue, priorityLabel, apply, restoreCustom);
    advanced.append(row);
    this.customRows = document.createElement('div');
    advanced.append(this.customRows);
    root.append(advanced);
  }

  setTarget(target: Element | null): void {
    this.target = target;
    this.customProperty.value = '';
    this.customValue.value = '';
    this.customPriority.checked = false;
    this.refresh(true);
  }

  refresh(forceCustom = false): void {
    const target = this.target;
    const styled = this.styleFor(target);
    const computed = target && this.document.defaultView?.getComputedStyle(target);
    for (const field of STYLE_FIELDS) {
      const row = this.rows.get(field.id);
      const input = this.inputs.get(field.id);
      if (!row || !input) continue;
      const authored = styled?.getPropertyValue(field.property) ?? '';
      if (forceCustom || (this.document.activeElement !== input && !input.matches(':focus'))) input.value = authored.trim();
      row.dataset.dirty = target && this.isDirty(target, field.property) ? 'true' : 'false';
      row.title = authored
        ? `Задано: ${authored}${styled?.getPropertyPriority(field.property) ? ' !important' : ''}`
        : `Вычислено: ${computed?.getPropertyValue(field.property).trim() || '—'}`;
      const inactive = Boolean(authored && computed && field.applicability?.requires
        && Object.entries(field.applicability.requires).some(([property, accepted]) => !accepted.includes(computed.getPropertyValue(property).trim())));
      row.dataset.applicability = inactive ? 'inactive' : 'applicable';
      let hint = row.querySelector<HTMLElement>('.style-applicability');
      if (inactive && !hint) {
        hint = this.document.createElement('span');
        hint.className = 'style-applicability';
        row.append(hint);
      }
      if (hint) { hint.textContent = inactive ? `Возможно не действует: ${field.applicability?.hint ?? 'проверьте условия layout'}` : ''; hint.hidden = !inactive; }
      const select = row.querySelector<HTMLSelectElement>('select[data-role="preset"]');
      if (select && this.document.activeElement !== select) select.value = field.control === 'select' && field.options.some(option => option.value === authored.trim()) ? authored.trim() : '';
      const swatch = row.querySelector<HTMLInputElement>('input[data-role="swatch"]');
      if (swatch && /^#[0-9a-f]{6}$/i.test(authored.trim())) swatch.value = authored.trim();
      const priority = row.querySelector<HTMLInputElement>('input[data-role="priority"]');
      if (priority && (forceCustom || !priority.matches(':focus'))) priority.checked = styled?.getPropertyPriority(field.property) === 'important';
      const parts = this.compositeInputs.get(field.id);
      if (parts && field.control === 'composite') {
        let hasUnreadablePart = false;
        field.parts.forEach((part, index) => {
          if (forceCustom || !parts[index].matches(':focus')) {
            const value = styled
              ? readCompositePart(styled, field.property, part.affectedProperties[0])
              : '';
            parts[index].value = value;
            if (!value) hasUnreadablePart = true;
          }
        });
        const fallback = row.querySelector<HTMLElement>('.style-codec-fallback');
        const hasShorthand = Boolean(styled && hasExplicitDeclaration(styled, field.property));
        const mixed = Boolean(hasShorthand && this.hasMixedOverrides(field));
        const needsFallback = Boolean(hasShorthand && (hasUnreadablePart || mixed));
        if (needsFallback && !fallback) {
          const note = this.document.createElement('p');
          note.className = 'style-codec-fallback';
          note.textContent = mixed
            ? 'Сохранены отдельные longhand-декларации. Правки частей добавляют только выбранное CSS-свойство; полную shorthand-строку менять нельзя.'
            : 'Сложная shorthand-строка оставлена в raw-поле. Части редактируются отдельными CSS-свойствами.';
          row.append(note);
        } else if (fallback) {
          fallback.hidden = !needsFallback;
        }
      }
    }
    if (forceCustom || !this.customRows.contains(this.document.activeElement)) this.renderCustomDeclarations();
  }

  private renderCustomDeclarations(): void {
    this.customRows.replaceChildren();
    const style = this.styleFor(this.target);
    if (!style) return;
    const known = new Set(STYLE_FIELDS.map(field => field.property));
    for (const declaration of listExplicitDeclarations(style)) {
      const property = declaration.property;
      if (known.has(property)) continue;
      const row = this.document.createElement('div');
      row.className = 'style-row';
      const label = this.document.createElement('label');
      label.textContent = property;
      const value = this.makeInput('text', 'CSS-значение', property);
      value.value = declaration.value.trim();
      const priority = this.makeInput('checkbox', '', `${property}: !important`);
      priority.checked = declaration.priority === 'important';
      const priorityLabel = this.document.createElement('label');
      priorityLabel.className = 'style-important';
      priorityLabel.append(priority, this.document.createTextNode(' !important'));
      value.addEventListener('change', () => {
        if (this.validate(property, value.value, value)) this.onChange({property, value: value.value, priority: priority.checked ? 'important' : ''});
      });
      priority.addEventListener('change', () => this.onChange({property, value: value.value, priority: priority.checked ? 'important' : ''}));
      const reset = this.makeButton('Удалить');
      reset.setAttribute('aria-label', `Удалить inline CSS ${property}`);
      reset.addEventListener('click', () => this.onChange({property, value: '', reset: true}));
      const restore = this.makeButton('Вернуть исходный');
      restore.setAttribute('aria-label', `Вернуть исходный ${property}`);
      restore.addEventListener('click', () => this.onReset(property));
      row.append(label, value, priorityLabel, restore, reset);
      this.customRows.append(row);
    }
  }

  private makeRow(field: StyleFieldDefinition): HTMLElement {
    const row = this.document.createElement('div');
    row.className = 'style-row';
    row.dataset.field = field.id;
    const label = this.document.createElement('label');
    label.textContent = field.label;
    label.title = field.property;
    const input = this.makeInput('text', field.ui.placeholder ?? 'CSS-значение', field.label);
    const priority = this.makeInput('checkbox', '', `${field.label}: !important`);
    priority.dataset.role = 'priority';
    const priorityLabel = this.document.createElement('label');
    priorityLabel.className = 'style-important';
    priorityLabel.append(priority, this.document.createTextNode(' !important'));
    let composing = false;
    let activeTransaction: string | undefined;
    let lastPreview = '';
    let pendingFrame: number | null = null;
    let hasPreview = false;
    let cancelled = false;
    let startValue = '';
    let startPriority = false;
    let focusedTarget: Element | null = null;
    const change = () => {
      if (composing || cancelled || (activeTransaction && focusedTarget !== this.target)) return;
      if (!this.validate(field.property, input.value, input)) return;
      if (this.hasMixedOverrides(field)) {
        this.setError(input, 'Заданы отдельные CSS-свойства этой группы. Изменяйте их по частям, чтобы сохранить исходные значения.');
        return;
      }
      if (field.id === 'background' && this.hasBackgroundLonghandOverrides()) {
        this.setError(input, 'Заданы отдельные background-* свойства. Изменяйте их в своих полях, чтобы shorthand не сбросил их значения.');
        return;
      }
      this.setError(input, '');
      const selectedPriority = priority.checked ? 'important' : '';
      const signature = `${input.value}\u0000${selectedPriority}`;
      if (activeTransaction && lastPreview === signature) return;
      if (activeTransaction) lastPreview = signature;
      if (activeTransaction) hasPreview = true;
      this.onChange({property: field.property, value: input.value, priority: selectedPriority, transactionId: activeTransaction ?? `edit-${++this.editSequence}`});
    };
    input.addEventListener('focus', () => {
      activeTransaction = `edit-${++this.editSequence}`;
      lastPreview = '';
      hasPreview = false;
      cancelled = false;
      startValue = input.value;
      startPriority = priority.checked;
      focusedTarget = this.target;
    });
    input.addEventListener('blur', () => {
      if (pendingFrame !== null) {
        this.document.defaultView?.cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
        change();
      }
      activeTransaction = undefined;
      lastPreview = '';
      hasPreview = false;
      cancelled = false;
      focusedTarget = null;
    });
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('input', () => {
      if (!input.value || composing || !this.validate(field.property, input.value, input)) return;
      const view = this.document.defaultView;
      if (!view?.requestAnimationFrame) { change(); return; }
      if (pendingFrame !== null) return;
      pendingFrame = view.requestAnimationFrame(() => { pendingFrame = null; change(); });
    });
    priority.addEventListener('change', change);
    input.addEventListener('change', () => {
      if (pendingFrame !== null) {
        this.document.defaultView?.cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
      }
      change();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        if (pendingFrame !== null) { this.document.defaultView?.cancelAnimationFrame(pendingFrame); pendingFrame = null; }
        change();
        input.blur();
      }
      if (event.key === 'Escape') {
        event.stopPropagation();
        cancelled = true;
        if (pendingFrame !== null) { this.document.defaultView?.cancelAnimationFrame(pendingFrame); pendingFrame = null; }
        input.value = startValue;
        priority.checked = startPriority;
        if (hasPreview && focusedTarget === this.target) this.onCancel();
        input.blur();
      }
    });
    row.append(label);
    if (field.control === 'select') {
      const select = this.document.createElement('select');
      select.setAttribute('aria-label', `${field.label}: варианты`);
      select.dataset.role = 'preset';
      for (const option of [{value: '', label: 'Произвольное значение'}, ...field.options]) {
        const item = this.document.createElement('option');
        item.value = option.value;
        item.textContent = option.label;
        select.append(item);
      }
      select.addEventListener('change', () => {
        if (!select.value) { input.focus(); return; }
        input.value = select.value;
        change();
      });
      row.append(select);
    }
    if (field.control === 'color') {
      const swatch = this.makeInput('color', '#000000', `${field.label}: палитра`);
      swatch.dataset.role = 'swatch';
      swatch.addEventListener('change', () => { input.value = swatch.value; change(); });
      row.append(swatch);
    }
    row.append(input, priorityLabel);
    if (field.control === 'composite' && ['margin', 'padding', 'border-radius', 'border'].includes(field.id)) {
      const parts = this.document.createElement('div');
      parts.className = 'style-composite-parts';
      const partInputs: HTMLInputElement[] = [];
      for (const part of field.parts) {
        const cell = this.document.createElement('label');
        cell.textContent = part.label;
        const partInput = this.makeInput('text', 'CSS-значение', `${field.label}: ${part.label}`);
        partInput.addEventListener('change', () => this.changeCompositePart(field, part.affectedProperties[0], partInput));
        cell.append(partInput);
        parts.append(cell);
        partInputs.push(partInput);
      }
      this.compositeInputs.set(field.id, partInputs);
      row.append(parts);
      if (field.id === 'margin' || field.id === 'padding') {
        const linkedLabel = this.document.createElement('label');
        linkedLabel.className = 'style-linked-control';
        const linked = this.makeInput('checkbox', '', `${field.label}: связать стороны`);
        linked.dataset.role = 'linked-spacing';
        linkedLabel.append(linked, this.document.createTextNode('Связать стороны'));
        this.compositeLinked.set(field.id, linked);
        row.append(linkedLabel);
      }
    }
    if (field.control === 'stack') {
      const layers = this.document.createElement('div');
      layers.className = 'style-stack-items';
      const toggle = this.makeButton('Редактировать слои');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        layers.hidden = !layers.hidden;
        toggle.setAttribute('aria-expanded', String(!layers.hidden));
        if (!layers.hidden) this.renderStackLayers(field, input, layers, change);
      });
      layers.hidden = true;
      row.append(toggle, layers);
      input.addEventListener('change', () => {
        if (!layers.hidden) this.renderStackLayers(field, input, layers, change);
      });
    }
    if (field.control === 'number-unit' && field.units.length > 0) {
      const units = this.document.createElement('select');
      units.setAttribute('aria-label', `${field.label}: единица`);
      const blank = this.document.createElement('option');
      blank.value = '';
      blank.textContent = 'ед.';
      units.append(blank);
      for (const unit of field.units) {
        const item = this.document.createElement('option');
        item.value = unit;
        item.textContent = unit || 'без ед.';
        units.append(item);
      }
      units.addEventListener('change', () => {
        if (!units.value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[a-z%]*)$/i.test(input.value.trim())) return;
        input.value = input.value.trim().replace(/[a-z%]*$/i, units.value);
        change();
      });
      row.append(units);
    }
    const reset = this.makeButton('Удалить');
    reset.setAttribute('aria-label', `Удалить inline CSS ${field.label}`);
    reset.addEventListener('click', () => { input.value = ''; this.onChange({property: field.property, value: '', reset: true}); });
    const restore = this.makeButton('Вернуть исходный');
    restore.setAttribute('aria-label', `Вернуть исходный ${field.label}`);
    restore.addEventListener('click', () => this.onReset(field.property));
    row.append(restore, reset);
    this.rows.set(field.id, row);
    this.inputs.set(field.id, input);
    return row;
  }

  private changeCompositePart(field: StyleFieldDefinition, property: string, input: HTMLInputElement): void {
    if (field.control !== 'composite' || !property || !this.target) return;
    const style = this.styleFor(this.target);
    if (!style) return;
    const value = input.value.trim();
    if (!value) {
      const linked = this.compositeLinked.get(field.id)?.checked ?? false;
      const properties = linked && (field.id === 'margin' || field.id === 'padding')
        ? field.parts.map(part => part.affectedProperties[0])
        : [property];
      const group = properties
        .filter(name => hasExplicitDeclaration(style, name))
        .map(name => ({property: name, value: '', reset: true as const}));
      if (group.length > 0) {
        this.onChange({
          ...group[0],
          ...(group.length > 1 ? {group} : {}),
          transactionId: `part-${++this.editSequence}`,
        });
      } else {
        input.value = readCompositePart(style, field.property, property);
      }
      this.setError(input, '');
      return;
    }
    if (!this.validate(property, value, input)) return;
    if (field.id === 'border' && this.hasMixedOverrides(field)) {
      this.setError(input, 'Есть отдельные стороны или longhand border-декларации. Изменяйте их в соответствующих полях, чтобы не переписать другие стороны.');
      return;
    }
    const inherited = getExplicitDeclaration(style, field.property);
    if (field.id === 'border' && inherited) {
      const border = decodeBorderShorthand(inherited.value);
      if (!border || [border.width, border.style, border.color].some(part => /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(part))) {
        this.setError(input, 'Сложная граница доступна в полном CSS-поле. Части нельзя изменить без потери значения.');
        return;
      }
      if (property === 'border-width') border.width = value;
      else if (property === 'border-style') border.style = value;
      else if (property === 'border-color') border.color = value;
      else return;
      const next = `${border.width} ${border.style} ${border.color}`;
      if (!this.validate('border', next, input)) return;
      this.onChange({
        property: 'border', value: next, priority: inherited.priority,
        transactionId: `part-${++this.editSequence}`,
      });
      this.setError(input, '');
      return;
    }
    const linked = this.compositeLinked.get(field.id)?.checked ?? false;
    const properties = linked && (field.id === 'margin' || field.id === 'padding')
      ? field.parts.map(part => part.affectedProperties[0])
      : [property];
    const shorthandPriority = inherited?.priority || '';
    const group = properties.map(name => {
      const priority = getExplicitDeclaration(style, name)?.priority || shorthandPriority;
      return {property: name, value, ...(priority ? {priority} : {})};
    });
    this.onChange({
      ...group[0],
      ...(group.length > 1 ? {group} : {}),
      transactionId: `part-${++this.editSequence}`,
    });
    this.setError(input, '');
  }

  private renderStackLayers(
    field: StyleFieldDefinition,
    input: HTMLInputElement,
    container: HTMLElement,
    commit: () => void,
  ): void {
    const raw = input.value.trim();
    const parsed = field.id === 'background'
      ? (raw && raw.toLowerCase() !== 'none' ? decodeBackgroundLayers(raw) : [])
      : field.id === 'transform'
        ? (raw && raw.toLowerCase() !== 'none' ? decodeTransformFunctions(raw) : [])
        : (raw && raw.toLowerCase() !== 'none' ? splitTopLevel(raw, 'comma') : []);
    const values = parsed ?? [];
    const update = (next: string[]) => {
      const serialized = field.id === 'background'
        ? encodeBackgroundLayers(next)
        : field.id === 'transform'
          ? encodeTransformFunctions(next)
          : next.map(item => item.trim()).filter(Boolean).join(', ') || 'none';
      if (serialized === null) {
        this.setError(input, 'Не удалось безопасно сериализовать CSS-слои. Используйте полное raw-значение.');
        return;
      }
      if (field.id === 'background' && this.hasBackgroundLonghandOverrides()) {
        this.setError(input, 'Есть отдельные background-* декларации. Сначала измените их в полях ниже или восстановите исходные значения.');
        return;
      }
      this.setError(input, '');
      input.value = serialized;
      commit();
      this.renderStackLayers(field, input, container, commit);
    };
    container.replaceChildren();
    if (raw && parsed === null) {
      const hint = this.document.createElement('p');
      hint.className = 'style-error';
      hint.setAttribute('role', 'status');
      hint.textContent = 'Слой не разобран без потери значения. Полное CSS-значение доступно в поле выше.';
      container.append(hint);
      return;
    }
    values.forEach((value, index) => {
      const row = this.document.createElement('div');
      row.className = 'style-layer';
      const editor = this.makeInput('text', field.control === 'stack' ? field.itemLabel : 'CSS value', `${field.label} ${index + 1}`);
      editor.value = value;
      editor.addEventListener('change', () => update(values.map((item, offset) => offset === index ? editor.value.trim() : item)));
      const up = this.makeButton('↑');
      up.setAttribute('aria-label', `Поднять слой ${index + 1}`);
      up.disabled = index === 0;
      up.addEventListener('click', () => { const next = [...values]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; update(next); });
      const down = this.makeButton('↓');
      down.setAttribute('aria-label', `Опустить слой ${index + 1}`);
      down.disabled = index === values.length - 1;
      down.addEventListener('click', () => { const next = [...values]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; update(next); });
      const remove = this.makeButton('×');
      remove.setAttribute('aria-label', `Удалить слой ${index + 1}`);
      remove.addEventListener('click', () => update(values.filter((_, offset) => offset !== index)));
      row.append(editor, up, down, remove);
      container.append(row);
    });
    const add = this.makeButton('Добавить слой');
    add.addEventListener('click', () => {
      const row = this.document.createElement('div');
      row.className = 'style-layer';
      const editor = this.makeInput('text', field.control === 'stack' ? field.itemLabel : 'CSS value', `${field.label} ${values.length + 1}`);
      editor.addEventListener('change', () => {
        if (editor.value.trim()) update([...values, editor.value.trim()]);
      });
      row.append(editor);
      container.insertBefore(row, add);
      editor.focus();
    });
    container.append(add);
  }

  private styleFor(target: Element | null): CSSStyleDeclaration | undefined {
    return (target as (Element & {style?: CSSStyleDeclaration}) | null)?.style;
  }

  private hasMixedOverrides(field: StyleFieldDefinition): boolean {
    if (field.control !== 'composite') return false;
    const style = this.styleFor(this.target);
    if (!style) return false;
    const affected = new Set(field.affectedProperties.map(property => property.toLowerCase()));
    return listExplicitDeclarations(style).some(({property}) => {
      const name = property.toLowerCase();
      return name !== field.property.toLowerCase() && affected.has(name);
    });
  }

  private hasBackgroundLonghandOverrides(): boolean {
    const style = this.styleFor(this.target);
    if (!style) return false;
    const background = STYLE_FIELDS.find(field => field.id === 'background');
    if (!background || background.control !== 'stack') return false;
    const affected = background.affectedProperties;
    const present = new Set(listExplicitDeclarations(style).map(declaration => declaration.property.toLowerCase()));
    return affected.some(property => property !== 'background' && present.has(property));
  }

  private filter(): void {
    const query = this.search.value.trim().toLowerCase();
    let matchCount = 0;
    for (const section of STYLE_SECTIONS) {
      const matches = section.fieldIds.filter(id => {
        const field = STYLE_FIELDS.find(candidate => candidate.id === id)!;
        return !query || `${field.label} ${field.property}`.toLowerCase().includes(query);
      });
      const details = this.sections.get(section.id)!;
      matchCount += matches.length;
      details.hidden = matches.length === 0;
      if (query && matches.length) {
        this.ensureRows(section.id);
        details.open = true;
      }
      for (const id of section.fieldIds) {
        const row = this.rows.get(id);
        if (row) row.hidden = !matches.includes(id);
      }
    }
    if (query && matchCount === 0 && (/^--[\w-]+$/.test(this.search.value.trim()) || /^-?[a-z][a-z0-9-]*$/i.test(this.search.value.trim()))) {
      this.customSection.open = true;
      this.customProperty.value = normalizeCustomPropertyName(this.search.value);
    }
    if (query) this.refresh();
  }

  private ensureRows(sectionId: string): void {
    const section = STYLE_SECTIONS.find(candidate => candidate.id === sectionId);
    const details = this.sections.get(sectionId);
    if (!section || !details) return;
    for (const id of section.fieldIds) {
      if (this.rows.has(id)) continue;
      const field = STYLE_FIELDS.find(candidate => candidate.id === id);
      if (field) details.append(this.makeRow(field));
    }
  }

  private validate(property: string, value: string, input: HTMLInputElement): boolean {
    const supported = /^--[\w-]+$/.test(property) || /^-?[a-z][a-z0-9-]*$/.test(property);
    const accepts = !value || !this.document.defaultView?.CSS?.supports || this.document.defaultView.CSS.supports(property, value);
    this.setError(input, supported ? (accepts ? '' : 'Браузер не поддерживает это CSS-значение.') : 'Некорректное имя CSS-свойства.');
    return supported && accepts;
  }

  private setError(input: HTMLInputElement, message: string): void {
    input.setAttribute('aria-invalid', String(Boolean(message)));
    input.title = message;
    const container = input.closest<HTMLElement>('.style-row, .style-custom-row');
    if (!container) return;
    let error = container.querySelector<HTMLElement>('.style-error');
    if (!error && message) {
      error = this.document.createElement('span');
      error.className = 'style-error';
      error.setAttribute('role', 'alert');
      container.append(error);
    }
    if (error) { error.textContent = message; error.hidden = !message; }
  }

  private makeInput(type: string, placeholder: string, label: string): HTMLInputElement {
    const input = this.document.createElement('input');
    input.type = type;
    if (type !== 'color') input.placeholder = placeholder;
    input.setAttribute('aria-label', label);
    return input;
  }

  private makeButton(label: string): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    return button;
  }
}
