import {makeInput, makeButton, makeFieldRow, makeSection} from '../controls/native.js';
import {Select} from '../controls/select.js';
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
  decodeShadow,
  encodeShadow,
  type ShadowParts,
} from './css-codecs.js';

export {splitTopLevel};

export type StyleChangePart = {property: string; value: string; priority?: '' | 'important'; reset?: true};
export type StyleChange = StyleChangePart & {transactionId?: string; intent?: 'priority'; group?: readonly StyleChangePart[]};

function numericValue(value: string): {amount: string; unit: string} | null {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-z%]*)$/i.exec(value.trim());
  return match ? {amount: match[1], unit: match[2]} : null;
}

function optionLabel(field: string, value: string, fallback: string): string {
  if (field === 'font-weight') {
    const weights: Record<string, string> = {'100': 'Тонкий · 100', '200': 'Сверхлёгкий · 200', '300': 'Лёгкий · 300', '400': 'Обычный · 400', '500': 'Средний · 500', '600': 'Полужирный · 600', '700': 'Жирный · 700', '800': 'Сверхжирный · 800', '900': 'Чёрный · 900', normal: 'Обычный', bold: 'Жирный', bolder: 'Жирнее', lighter: 'Тоньше'};
    return weights[value] ?? fallback;
  }
  if (field === 'text-align') return ({left: 'Слева', right: 'Справа', center: 'По центру', justify: 'По ширине', start: 'По началу', end: 'По концу'} as Record<string, string>)[value] ?? fallback;
  if (field === 'font-style') return ({normal: 'Обычный', italic: 'Курсив', oblique: 'Наклонный'} as Record<string, string>)[value] ?? fallback;
  return fallback;
}

// Presentation labels stay separate from the CSS catalog and stable aria-labels.
const VISIBLE_FIELD_LABELS: Readonly<Record<string, string>> = {
  'font-family': 'Шрифт',
  'font-size': 'Размер',
  'font-weight': 'Начертание',
  'font-style': 'Стиль шрифта',
  'line-height': 'Высота строки',
  'letter-spacing': 'Межбуквенный интервал',
  color: 'Цвет текста',
  'text-align': 'Выравнивание',
  'text-decoration': 'Оформление текста',
  'text-transform': 'Регистр текста',
  'white-space': 'Пробелы и переносы',
  'word-break': 'Перенос слов',
  'text-shadow': 'Тени текста',
  display: 'Отображение',
  'box-sizing': 'Расчёт размера',
  visibility: 'Видимость',
  overflow: 'Переполнение',
  'overflow-x': 'По горизонтали',
  'overflow-y': 'По вертикали',
  'flex-direction': 'Направление',
  'flex-wrap': 'Перенос элементов',
  'justify-content': 'Распределение',
  'align-items': 'Выравнивание элементов',
  'align-content': 'Выравнивание строк',
  'align-self': 'Выравнивание элемента',
  'flex-basis': 'Базовый размер',
  'flex-grow': 'Растяжение',
  'flex-shrink': 'Сжатие',
  order: 'Порядок',
  'grid-template-columns': 'Колонки сетки',
  'grid-template-rows': 'Строки сетки',
  'grid-column': 'Колонка',
  'grid-row': 'Строка',
  gap: 'Промежуток',
  'row-gap': 'Между строками',
  'column-gap': 'Между колонками',
  width: 'Ширина',
  'min-width': 'Мин. ширина',
  'max-width': 'Макс. ширина',
  height: 'Высота',
  'min-height': 'Мин. высота',
  'max-height': 'Макс. высота',
  'aspect-ratio': 'Пропорции',
  margin: 'Внешние отступы',
  'margin-top': 'Снаружи сверху',
  'margin-right': 'Снаружи справа',
  'margin-bottom': 'Снаружи снизу',
  'margin-left': 'Снаружи слева',
  padding: 'Внутренние отступы',
  'padding-top': 'Внутри сверху',
  'padding-right': 'Внутри справа',
  'padding-bottom': 'Внутри снизу',
  'padding-left': 'Внутри слева',
  position: 'Позиционирование',
  top: 'Сверху',
  right: 'Справа',
  bottom: 'Снизу',
  left: 'Слева',
  'z-index': 'Уровень слоя',
  'background-color': 'Цвет фона',
  'background-image': 'Изображение или градиент',
  'background-repeat': 'Повтор фона',
  'background-position': 'Положение фона',
  'background-size': 'Размер фона',
  'background-attachment': 'Прокрутка фона',
  background: 'Слои фона',
  border: 'Граница',
  'border-width': 'Толщина границы',
  'border-style': 'Стиль границы',
  'border-color': 'Цвет границы',
  'border-radius': 'Скругление',
  opacity: 'Прозрачность',
  'box-shadow': 'Тени блока',
  transform: 'Трансформация',
  'transform-origin': 'Центр трансформации',
  filter: 'Фильтры',
  'backdrop-filter': 'Фильтры подложки',
  transition: 'Переходы',
};

/** A framework-independent, Shadow DOM-friendly view. All writes go through onChange. */
export class StyleManager {
  readonly element: HTMLElement;
  private readonly document: Document;
  private readonly onChange: (change: StyleChange) => void;
  private readonly onReset: (property: string) => void;
  private readonly onCancel: () => void;
  private readonly isDirty: (element: Element, property: string) => boolean;
  private target: Element | null = null;
  private targetObserver: MutationObserver | null = null;
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
  private readonly selects = new Map<string, Select>();
  private readonly unitSelects = new Map<string, Select>();
  private readonly unitValues = new Map<string, string>();
  private readonly customTransactions = new Map<string, string>();
  private readonly stacks = new Map<string, () => void>();
  private readonly flushers = new Set<() => void>();
  private readonly cancellers = new Set<() => void>();

  flush(): void { for (const flush of this.flushers) flush(); }
  destroy(): void {
    this.targetObserver?.disconnect();
    for (const select of [...this.selects.values(), ...this.unitSelects.values()]) select.destroy();
    for (const cancel of this.cancellers) cancel();
    this.target = null;
    this.element.remove();
  }

  constructor(
    document: Document,
    onChange: (change: StyleChange) => void,
    onReset: (property: string) => void = () => {},
    onCancel: () => void = () => {},
    isDirty: (element: Element, property: string) => boolean = () => false,
    private readonly readStyle?: (element: Element) => CSSStyleDeclaration | undefined,
    private readonly hasOverride: (element: Element, property: string) => boolean = isDirty,
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
    this.search.className = 'style-search-input';
    this.search.addEventListener('input', () => this.filter());
    const search = document.createElement('div');
    search.className = 'style-search';
    search.append(this.makeIcon('search'), this.search);
    root.append(search);

    for (const section of STYLE_SECTIONS) {
      const details = makeSection(document, section.id, section.label, Boolean(section.initiallyOpen));
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

    const advanced = makeSection(document, 'custom', 'Любое CSS-свойство');
    this.customSection = advanced;
    const row = document.createElement('div');
    row.className = 'style-custom-row';
    this.customProperty = this.makeInput('text', 'Свойство, например grid-column или --Accent', 'CSS property');
    this.customValue = this.makeInput('text', 'CSS-значение', 'CSS value');
    this.customPriority = this.makeInput('checkbox', '', '!important');
    const priorityLabel = this.makePriorityLabel(this.customPriority);
    const apply = this.makeButton('Добавить / изменить');
    apply.className = 'style-custom-apply';
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
    this.closeSelects();
    this.targetObserver?.disconnect();
    this.targetObserver = null;
    this.target = target;
    this.customTransactions.clear();
    const Observer = this.document.defaultView?.MutationObserver;
    if (target && Observer) {
      this.targetObserver = new Observer(() => this.refresh());
      this.targetObserver.observe(target, {attributes: true, childList: true, characterData: true, subtree: true});
    }
    this.customProperty.value = '';
    this.customValue.value = '';
    this.customPriority.checked = false;
    this.refresh(true);
  }

  closeSelects(): void {
    for (const select of [...this.selects.values(), ...this.unitSelects.values()]) select.close();
  }

  openSection(id: string): void {
    const section = this.sections.get(id);
    if (!section) return;
    this.ensureRows(id);
    section.open = true;
    this.refresh();
  }

  refresh(forceCustom = false, forceProperty?: string): void {
    const target = this.target;
    const styled = this.styleFor(target);
    const computed = target && this.document.defaultView?.getComputedStyle(target);
    for (const field of STYLE_FIELDS) {
      const row = this.rows.get(field.id);
      const input = this.inputs.get(field.id);
      if (!row || !input) continue;
      const authored = styled?.getPropertyValue(field.property) ?? '';
      const computedValue = computed?.getPropertyValue(field.property).trim() || '';
      const numeric = this.unitSelects.has(field.id) ? numericValue(authored.trim() || computedValue) : null;
      const forceField = forceCustom || field.property === forceProperty;
      if (forceField || (this.document.activeElement !== input && !this.focused(input))) input.value = authored.trim() ? numeric?.amount ?? authored.trim() : '';
      row.dataset.source = authored ? 'override' : 'computed';
      input.placeholder = authored ? field.ui.placeholder ?? 'CSS-значение' : numeric?.amount ?? (computedValue || field.ui.placeholder || 'CSS-значение');
      row.dataset.dirty = target && this.isDirty(target, field.property) ? 'true' : 'false';
      const owned = Boolean(target && this.hasOverride(target, field.property));
      row.dataset.override = String(owned);
      const remove = row.querySelector<HTMLButtonElement>('[data-style-action="remove"]');
      if (remove) remove.disabled = !owned;
      const restore = row.querySelector<HTMLButtonElement>('[data-style-action="restore"]');
      if (restore) restore.disabled = row.dataset.dirty !== 'true';
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
      this.selects.get(field.id)?.setValue(authored.trim() || computedValue);
      this.selects.get(field.id)?.setDisabled(!target);
      const units = this.unitSelects.get(field.id);
      if (units) {
        this.unitValues.set(field.id, numeric?.unit ?? '');
        units.setValue(numeric?.unit ?? '', numeric ? numeric.unit || '—' : '—');
        units.setDisabled(!target || Boolean((authored.trim() || computedValue) && !numeric));
      }
      const swatch = row.querySelector<HTMLInputElement>('input[data-role="swatch"]');
      if (swatch) {
        const rgb = computed?.getPropertyValue(field.property).match(/^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/i);
        if (/^#[0-9a-f]{6}$/i.test(authored.trim())) swatch.value = authored.trim();
        else if (rgb) swatch.value = '#' + rgb.slice(1, 4).map(value => Math.min(255, Math.round(Number(value))).toString(16).padStart(2, '0')).join('');
      }
      const priority = row.querySelector<HTMLInputElement>('input[data-role="priority"]');
      if (priority && (forceField || !this.focused(priority))) priority.checked = styled?.getPropertyPriority(field.property) === 'important';
      const parts = this.compositeInputs.get(field.id);
      if (parts && field.control === 'composite') {
        let hasUnreadablePart = false;
        field.parts.forEach((part, index) => {
          if (forceField || !this.focused(parts[index])) {
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
    for (const refresh of this.stacks.values()) refresh();
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
      label.className = 'style-field-label';
      const value = this.makeInput('text', 'CSS-значение', property);
      value.className = 'style-field-input';
      value.value = declaration.value.trim();
      const priority = this.makeInput('checkbox', '', `${property}: !important`);
      priority.checked = declaration.priority === 'important';
      const priorityLabel = this.makePriorityLabel(priority);
      value.addEventListener('change', () => {
        if (this.validate(property, value.value, value)) {
          const transactionId = `edit-${++this.editSequence}`;
          this.customTransactions.set(property, transactionId);
          this.onChange({property, value: value.value, priority: priority.checked ? 'important' : '', transactionId});
        }
      });
      priority.addEventListener('change', () => {
        const transactionId = this.customTransactions.get(property) ?? `edit-${++this.editSequence}`;
        this.customTransactions.set(property, transactionId);
        this.onChange({property, value: value.value, priority: priority.checked ? 'important' : '', transactionId, intent: 'priority'});
      });
      const reset = this.makeIconButton('remove', `Удалить правку ${property}`);
      reset.disabled = !this.target || !this.hasOverride(this.target, property);
      reset.addEventListener('click', () => { if (this.target && this.hasOverride(this.target, property)) this.onReset(property); });
      const restore = this.makeIconButton('restore', `Вернуть исходный ${property}`);
      restore.disabled = !this.target || !this.isDirty(this.target, property);
      restore.addEventListener('click', () => this.onReset(property));
      const heading = this.document.createElement('div');
      heading.className = 'style-field-heading';
      const actions = this.document.createElement('div');
      actions.className = 'style-field-actions';
      actions.append(priorityLabel, restore, reset);
      heading.append(label, actions);
      const control = this.document.createElement('div');
      control.className = 'style-field-value';
      control.append(value);
      row.append(heading, control);
      this.customRows.append(row);
    }
  }

  private makeRow(field: StyleFieldDefinition): HTMLElement {
    const row = makeFieldRow(this.document, field.id);
    row.dataset.control = field.control;
    const label = this.document.createElement('label');
    label.textContent = VISIBLE_FIELD_LABELS[field.id] ?? field.label;
    label.className = 'style-field-label';
    label.title = field.property;
    const input = this.makeInput('text', field.ui.placeholder ?? 'CSS-значение', field.label);
    input.className = 'style-field-input';
    input.id = `lykar-style-${field.id}`;
    label.htmlFor = input.id;
    const priority = this.makeInput('checkbox', '', `${field.label}: !important`);
    priority.dataset.role = 'priority';
    const priorityLabel = this.makePriorityLabel(priority);
    const heading = this.document.createElement('div');
    heading.className = 'style-field-heading';
    const actions = this.document.createElement('div');
    actions.className = 'style-field-actions';
    actions.append(priorityLabel);
    heading.append(label, actions);
    const control = this.document.createElement('div');
    control.className = 'style-field-value';
    let composing = false;
    let activeTransaction: string | undefined;
    let propertyTransaction: string | undefined;
    let lastPreview = '';
    let pendingFrame: number | null = null;
    let hasPreview = false;
    let cancelled = false;
    let startValue = '';
    let startPriority = false;
    let focusedTarget: Element | null = null;
    const change = (intent?: 'priority') => {
      if (composing || cancelled || (activeTransaction && focusedTarget !== this.target)) return;
      const value = this.fieldValue(field, input.value);
      if (!this.validate(field.property, value, input)) return;
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
      const signature = `${value}\u0000${selectedPriority}`;
      if (activeTransaction && lastPreview === signature) return;
      if (activeTransaction) lastPreview = signature;
      if (activeTransaction) hasPreview = true;
      const transactionId = activeTransaction ?? (intent ? propertyTransaction : undefined) ?? `edit-${++this.editSequence}`;
      propertyTransaction = transactionId;
      this.onChange({property: field.property, value, priority: selectedPriority, transactionId, ...(intent ? {intent} : {})});
    };
    const begin = () => {
      activeTransaction = `edit-${++this.editSequence}`;
      lastPreview = '';
      hasPreview = false;
      cancelled = false;
      startValue = input.value;
      startPriority = priority.checked;
      focusedTarget = this.target;
    };
    input.addEventListener('focus', begin);
    this.flushers.add(() => {
      if (pendingFrame !== null) {
        this.document.defaultView?.cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
        change();
      }
    });
    this.cancellers.add(() => {
      cancelled = true;
      if (pendingFrame !== null) this.document.defaultView?.cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    });
    input.addEventListener('blur', () => {
      if (pendingFrame !== null) {
        this.document.defaultView?.cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
        change();
      }
      const numeric = this.unitSelects.has(field.id) ? numericValue(this.fieldValue(field, input.value)) : null;
      if (numeric) {
        input.value = numeric.amount;
        this.unitValues.set(field.id, numeric.unit);
        this.unitSelects.get(field.id)?.setValue(numeric.unit, numeric.unit || '—');
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
      if (!input.value || composing || !this.validate(field.property, this.fieldValue(field, input.value), input)) return;
      const view = this.document.defaultView;
      if (!view?.requestAnimationFrame) { change(); return; }
      if (pendingFrame !== null) return;
      pendingFrame = view.requestAnimationFrame(() => { pendingFrame = null; change(); });
    });
    priority.addEventListener('change', () => {
      if (!input.value.trim() && this.target) {
        const current = this.styleFor(this.target)?.getPropertyValue(field.property).trim()
          || this.document.defaultView?.getComputedStyle(this.target).getPropertyValue(field.property).trim() || '';
        input.value = this.unitSelects.has(field.id) ? numericValue(current)?.amount ?? current : current;
      }
      change('priority');
    });
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
    row.append(heading);
    if (field.control === 'select') {
      const select = new Select(this.document, {
        label: `${field.label}: варианты`, input,
        options: field.options.map(option => ({...option, label: optionLabel(field.id, option.value, option.label)})),
        searchable: true,
        onChange: value => { input.value = value; change(); },
      });
      select.trigger.dataset.role = 'preset';
      this.selects.set(field.id, select);
      control.append(select.element);
    }
    if (field.control === 'color') {
      const swatch = this.makeInput('color', '#000000', `${field.label}: палитра`);
      swatch.dataset.role = 'swatch';
      swatch.addEventListener('focus', begin);
      swatch.addEventListener('input', () => {
        if (!activeTransaction) begin();
        input.value = swatch.value;
        input.dispatchEvent(new Event('input'));
      });
      swatch.addEventListener('change', () => {
        input.value = swatch.value;
        if (pendingFrame !== null) this.document.defaultView?.cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
        change();
        activeTransaction = undefined;
      });
      swatch.addEventListener('blur', () => { this.flush(); activeTransaction = undefined; });
      control.append(swatch);
    }
    if (field.control !== 'select') control.append(input);
    row.append(control);
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
      toggle.className = 'style-stack-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        layers.hidden = !layers.hidden;
        toggle.setAttribute('aria-expanded', String(!layers.hidden));
        if (!layers.hidden) this.renderStackLayers(field, input, layers, change);
      });
      layers.hidden = true;
      row.append(toggle, layers);
      this.stacks.set(field.id, () => {
        const active = this.element.getRootNode() as Document | ShadowRoot;
        if (!layers.hidden && !layers.contains(active.activeElement)) this.renderStackLayers(field, input, layers, change);
      });
      input.addEventListener('change', () => {
        if (!layers.hidden) this.renderStackLayers(field, input, layers, change);
      });
    }
    if (field.control === 'number-unit' && field.units.length > 0) {
      const units = new Select(this.document, {
        label: `${field.label}: единица`, searchable: false,
        options: Array.from(new Set([...(field.unitless ? [''] : []), ...field.units])).map(unit => ({value: unit, label: unit || 'Без единицы'})),
        onChange: unit => {
          const amount = numericValue(input.value.trim() || input.placeholder);
          if (!amount) return;
          this.unitValues.set(field.id, unit);
          input.value = amount.amount;
          change();
        },
      });
      units.element.classList.add('style-field-unit');
      this.unitSelects.set(field.id, units);
      this.unitValues.set(field.id, field.units.includes('px') ? 'px' : field.units[0] ?? '');
      control.append(units.element);
    }
    const reset = this.makeIconButton('remove', `Удалить правку ${field.label}`);
    reset.disabled = true;
    reset.title = 'Убрать правку Lykar и вернуть исходный стиль';
    reset.addEventListener('click', () => { if (this.target && this.hasOverride(this.target, field.property)) this.onReset(field.property); });
    const restore = this.makeIconButton('restore', `Вернуть исходный ${field.label}`);
    restore.title = 'Отменить правку параметра и вернуть исходный стиль';
    restore.addEventListener('click', () => this.onReset(field.property));
    actions.append(restore, reset);
    this.rows.set(field.id, row);
    this.inputs.set(field.id, input);
    return row;
  }

  private fieldValue(field: StyleFieldDefinition, input: string): string {
    if (field.control !== 'number-unit' || !this.unitSelects.has(field.id)) return input;
    const parsed = numericValue(input.trim());
    const unit = this.unitValues.get(field.id) || (!field.unitless && field.units.includes('px') ? 'px' : '');
    return parsed && !parsed.unit ? `${parsed.amount}${unit}` : input;
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
    if (field.codec === 'background') {
      this.renderBackgroundLayers(field, container);
      return;
    }
    const raw = input.value.trim();
    const parsed = field.id === 'background'
      ? (raw && raw.toLowerCase() !== 'none' ? decodeBackgroundLayers(raw) : [])
      : field.id === 'transform' || field.id === 'filter'
        ? (raw && raw.toLowerCase() !== 'none' ? decodeTransformFunctions(raw) : [])
        : (raw && raw.toLowerCase() !== 'none' ? splitTopLevel(raw, 'comma') : []);
    const values = parsed ?? [];
    const update = (next: string[]) => {
      const serialized = field.id === 'background'
        ? encodeBackgroundLayers(next)
        : field.id === 'transform' || field.id === 'filter'
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
      if (field.codec === 'shadow') {
        const decoded = decodeShadow(value, field.id === 'box-shadow');
        if (decoded) {
          const parts = this.document.createElement('div');
          parts.className = 'style-composite-parts';
          for (const key of ['x', 'y', 'blur', 'spread', 'color', 'inset'] as const) {
            if (field.id === 'text-shadow' && (key === 'spread' || key === 'inset')) continue;
            const label = this.document.createElement('label');
            label.textContent = key;
            const part = this.makeInput('text', 'CSS value', `${field.label} ${index + 1}: ${key}`);
            part.value = decoded[key];
            part.addEventListener('change', () => {
              const next: ShadowParts = {...decoded, [key]: part.value.trim()};
              const serialized = encodeShadow(next);
              if (this.validate(field.property, serialized, part)) update(values.map((item, offset) => offset === index ? serialized : item));
            });
            label.append(part);
            parts.append(label);
          }
          row.append(parts);
        }
      }
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

  private renderBackgroundLayers(field: StyleFieldDefinition, container: HTMLElement): void {
    container.replaceChildren();
    const target = this.target;
    const style = this.styleFor(target);
    if (!target || !style) return;
    const computed = this.document.defaultView?.getComputedStyle(target);
    const properties = ['background-image', 'background-position', 'background-size', 'background-repeat', 'background-attachment', 'background-origin', 'background-clip'];
    const lists = properties.map(property => splitTopLevel(style.getPropertyValue(property) || computed?.getPropertyValue(property) || '', 'comma'));
    const images = lists[0];
    if (!images.length || lists.some(items => !items.length || items.some(value => /\bvar\s*\(/i.test(value)))) {
      const hint = this.document.createElement('p');
      hint.textContent = 'Сложный фон доступен в raw-поле и отдельных background-* полях.';
      container.append(hint);
      return;
    }
    const expanded = lists.map(items => images.map((_, index) => items[index % items.length]));
    const apply = (changes: StyleChangePart[]) => {
      if (this.target !== target) return;
      this.onChange({...changes[0], ...(changes.length > 1 ? {group: changes} : {}), transactionId: `layer-${++this.editSequence}`});
    };
    const member = (property: string, values: string[]): StyleChangePart => ({property, value: values.join(', '), priority: style.getPropertyPriority(property) === 'important' ? 'important' : ''});
    images.forEach((_, index) => {
      const layer = this.document.createElement('div');
      layer.className = 'style-layer';
      const parts = this.document.createElement('div');
      parts.className = 'style-composite-parts';
      properties.forEach((property, partIndex) => {
        const label = this.document.createElement('label');
        label.textContent = property.slice(11);
        const input = this.makeInput('text', property, `${field.label} ${index + 1}: ${property.slice(11)}`);
        input.value = expanded[partIndex][index];
        input.addEventListener('change', () => {
          const values = expanded[partIndex].map((value, offset) => offset === index ? input.value.trim() : value);
          if (this.validate(property, values.join(', '), input)) apply([member(property, values)]);
        });
        label.append(input);
        parts.append(label);
      });
      layer.append(parts);
      for (const [label, destination] of [['↑', index - 1], ['↓', index + 1], ['×', -1]] as const) {
        const button = this.makeButton(label);
        button.setAttribute('aria-label', `${label === '×' ? 'Удалить' : label === '↑' ? 'Поднять' : 'Опустить'} слой ${index + 1}`);
        button.disabled = label !== '×' && (destination < 0 || destination >= images.length);
        button.addEventListener('click', () => apply(properties.map((property, partIndex) => {
          const next = [...expanded[partIndex]];
          if (label === '×') next.splice(index, 1);
          else [next[index], next[destination]] = [next[destination], next[index]];
          return member(property, next.length ? next : [partIndex === 0 ? 'none' : expanded[partIndex][index]]);
        })));
        layer.append(button);
      }
      container.append(layer);
    });
    const add = this.makeButton('Добавить слой');
    add.addEventListener('click', () => apply(properties.map((property, index) => member(property, [...expanded[index], ['none', '0% 0%', 'auto', 'repeat', 'scroll', 'padding-box', 'border-box'][index]]))));
    container.append(add);
  }

  private focused(element: Element): boolean {
    return (element.getRootNode() as Document | ShadowRoot).activeElement === element;
  }

  private styleFor(target: Element | null): CSSStyleDeclaration | undefined {
    if (target && this.readStyle) return this.readStyle(target);
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
        return !query || `${field.label} ${VISIBLE_FIELD_LABELS[field.id] ?? ''} ${field.property}`.toLowerCase().includes(query);
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
    let fields = details.querySelector<HTMLElement>('.style-section-fields');
    if (!fields) {
      fields = this.document.createElement('div');
      fields.className = 'style-section-fields';
      details.append(fields);
    }
    for (const id of section.fieldIds) {
      if (this.rows.has(id)) continue;
      const field = STYLE_FIELDS.find(candidate => candidate.id === id);
      if (field) fields.append(this.makeRow(field));
    }
  }

  private validate(property: string, value: string, input: HTMLInputElement): boolean {
    const supported = /^--[\w-]+$/.test(property) || /^-?[a-z][a-z0-9-]*$/.test(property);
    const accepts = property.startsWith('--') || !value || !this.document.defaultView?.CSS?.supports || this.document.defaultView.CSS.supports(property, value);
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

  private makePriorityLabel(input: HTMLInputElement): HTMLLabelElement {
    const label = this.document.createElement('label');
    label.className = 'style-important';
    label.title = 'Повысить приоритет значения (!important)';
    input.title = label.title;
    label.append(input, this.makeIcon('priority'));
    return label;
  }

  private makeIconButton(icon: 'restore' | 'remove', label: string): HTMLButtonElement {
    const button = this.makeButton('');
    button.className = 'style-icon-button';
    button.dataset.styleAction = icon;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.append(this.makeIcon(icon));
    return button;
  }

  private makeIcon(icon: 'search' | 'restore' | 'remove' | 'priority'): SVGSVGElement {
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
      search: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
      restore: 'M3 10V4m0 6h6M3.7 10a8.5 8.5 0 1 1 1.9 8',
      remove: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6',
      priority: 'M12 5v9M12 18v.01',
    }[icon]);
    svg.append(path);
    return svg;
  }

  private makeInput(type: string, placeholder: string, label: string): HTMLInputElement {
    return makeInput(this.document, type, placeholder, label);
  }

  private makeButton(label: string): HTMLButtonElement {
    return makeButton(this.document, label);
  }
}
