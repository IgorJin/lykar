import type { SerializedElementNode, SerializedNode, TargetDescriptor } from '@lykar/protocol';

const SERIALIZABLE_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br',
  'button', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'dd', 'del', 'details',
  'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'i', 'img', 'input',
  'ins', 'kbd', 'label', 'legend', 'li', 'main', 'mark', 'menu', 'meter', 'nav', 'ol',
  'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'section', 'select', 'small', 'source', 'span', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time',
  'tr', 'u', 'ul', 'var', 'video', 'wbr',
]);

export function buildTargetDescriptor(element: Element): TargetDescriptor {
  const marker = element.getAttribute('data-lykar-id')?.trim();
  const target: TargetDescriptor = {
    selectors: {
      css: buildCssSelector(element),
      xpath: buildXPath(element),
    },
    fingerprint: {
      tag: element.tagName.toLowerCase(),
      ...stableAttributes(element),
    },
  };

  if (marker) target.marker = marker;
  return target;
}

function stableAttributes(element: Element): { attributes?: Record<string, string> } {
  const attributes: Record<string, string> = {};
  for (const name of ['id', 'name', 'role', 'type', 'data-lykar-id', 'data-testid', 'aria-label']) {
    const value = element.getAttribute(name)?.trim();
    if (value) attributes[name] = value;
  }
  return Object.keys(attributes).length > 0 ? { attributes } : {};
}

export function buildCssSelector(element: Element): string {
  const document = element.ownerDocument;
  const id = element.getAttribute('id');
  if (id) {
    const selector = `[id="${escapeCssString(id)}"]`;
    try {
      if (document.querySelectorAll(selector).length === 1) return selector;
    } catch {
      // Fall through to a structural selector.
    }
  }

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(sibling => sibling.tagName === current!.tagName)
      : [];
    const position = siblings.indexOf(current);
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${position + 1})` : tag);
    current = current.parentElement;
  }

  return `html > ${parts.join(' > ')}`;
}

export function buildXPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current) {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(sibling => sibling.tagName === current!.tagName)
      : [];
    const position = siblings.indexOf(current);
    parts.unshift(siblings.length > 1 ? `${tag}[${position + 1}]` : tag);
    current = current.parentElement;
  }

  return `/${parts.join('/')}`;
}

export function serializeEditableElement(element: Element): SerializedElementNode {
  const tag = element.tagName.toLowerCase();
  if (!SERIALIZABLE_TAGS.has(tag)) {
    throw new Error(`Element <${tag}> cannot be duplicated by the static-page editor`);
  }

  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (
      name.startsWith('on')
      || name === 'id'
      || name === 'style'
      || name === 'srcdoc'
      || name === 'srcset'
      || name === 'data-lykar-operation-id'
      || name === 'data-lykar-id'
    ) continue;
    attributes[attribute.name] = attribute.value;
  }

  const children: SerializedNode[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      children.push({ type: 'text', value: child.nodeValue ?? '' });
    } else if (child.nodeType === 1 && SERIALIZABLE_TAGS.has((child as Element).tagName.toLowerCase())) {
      children.push(serializeEditableElement(child as Element));
    }
  }

  return {
    type: 'element',
    tag,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ')
    .replace(/\r/g, '\\d ')
    .replace(/\f/g, '\\c ');
}
