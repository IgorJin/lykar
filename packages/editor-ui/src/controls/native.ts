/** Native DOM controls for the lazy editor. These factories hold no target,
 * protocol, history or network state; StyleManager owns the edit transaction. */
export function makeInput(document: Document, type: string, placeholder: string, label: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  if (type !== 'color') input.placeholder = placeholder;
  input.setAttribute('aria-label', label);
  return input;
}

export function makeButton(document: Document, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  return button;
}

export function makeFieldRow(document: Document, id: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'style-row';
  row.dataset.field = id;
  return row;
}

export function makeSection(document: Document, id: string, label: string, open = false): HTMLDetailsElement {
  const section = document.createElement('details');
  section.className = 'style-section';
  section.dataset.section = id;
  section.open = open;
  const summary = document.createElement('summary');
  summary.textContent = label;
  section.append(summary);
  return section;
}

export function makeSelect(document: Document, label: string, options: readonly {value: string; label: string}[]): HTMLSelectElement {
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  }
  return select;
}
