import { SOURCE_SNAPSHOT_ALGORITHM } from '@lykar/protocol';
import type { SourceSnapshotV1 } from '@lykar/protocol';

import { sha256Text } from './hash.js';

const IGNORED_TAGS = new Set(['script', 'style', 'noscript', 'template']);
const STABLE_ATTRIBUTES = new Set([
  'id', 'class', 'name', 'role', 'type', 'data-lykar-id', 'data-testid',
  'aria-label', 'aria-labelledby', 'aria-describedby',
]);

export async function captureSourceSnapshot(
  document: Document,
  root: Document | Element = document,
): Promise<SourceSnapshotV1> {
  const source = root.nodeType === 9
    ? document.body ?? document.documentElement
    : root as Element;
  const canonical = canonicalElement(source);
  return {
    algorithm: SOURCE_SNAPSHOT_ALGORITHM,
    pageHash: await sha256Text(canonical),
    capturedAt: new Date().toISOString(),
  };
}

function canonicalElement(element: Element): string {
  if (
    element.hasAttribute('data-lykar-editor-root')
    || element.hasAttribute('data-lykar-operation-id')
  ) return '';
  const tag = element.tagName.toLowerCase();
  if (IGNORED_TAGS.has(tag)) return '';

  const attributes = Array.from(element.attributes)
    .filter(attribute => STABLE_ATTRIBUTES.has(attribute.name.toLowerCase()))
    .map(attribute => [attribute.name.toLowerCase(), normalizeAttribute(attribute.name, attribute.value)] as const)
    .filter(([, value]) => value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join(',');
  const children = Array.from(element.children).map(canonicalElement).filter(Boolean).join('');
  return `<${tag}${attributes ? ` ${attributes}` : ''}>${children}</${tag}>`;
}

function normalizeAttribute(name: string, value: string): string {
  if (name.toLowerCase() === 'class') {
    return value.split(/\s+/).filter(Boolean).sort().join(' ');
  }
  return value.trim();
}
