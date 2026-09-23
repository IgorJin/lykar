/** Small, conservative CSS value codecs used by the visual style controls.
 *
 * These helpers deliberately do not try to parse the full CSS grammar. When a
 * shorthand cannot be decoded without guessing, callers can retain and edit
 * the original raw declaration instead.
 */

type CssListSeparator = 'comma' | 'space';
type CssList = {parts: string[]};

export type CssDeclaration = {
  property: string;
  value: string;
  priority: '' | 'important';
};

export type FourSideValues = [top: string, right: string, bottom: string, left: string];
export type BorderValues = {width: string; style: string; color: string};
export type BorderRadiusValues = {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
};

export type ShadowParts = {x: string; y: string; blur: string; spread: string; color: string; inset: string};

/** Ambiguous substitutions stay raw: var() can represent more than one token. */
export function decodeShadow(value: string, box: boolean): ShadowParts | null {
  if (/\bvar\s*\(|\/\*/i.test(value)) return null;
  const tokens = parseCssList(value, 'space')?.parts;
  if (!tokens?.length) return null;
  const lengths: string[] = [];
  let color = '';
  let inset = '';
  for (const token of tokens) {
    if (token.toLowerCase() === 'inset') {
      if (!box || inset) return null;
      inset = token;
    } else if (/^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[a-z]+)?|(?:calc|min|max|clamp)\(.+\))$/i.test(token)) {
      lengths.push(token);
    } else {
      if (color || CSS_WIDE_KEYWORDS.has(token.toLowerCase())) return null;
      color = token;
    }
  }
  if (lengths.length < 2 || lengths.length > (box ? 4 : 3)) return null;
  return {x: lengths[0], y: lengths[1], blur: lengths[2] ?? '', spread: lengths[3] ?? '', color, inset};
}

export function encodeShadow(parts: ShadowParts): string {
  return [parts.inset, parts.x, parts.y, parts.blur || (parts.spread ? '0' : ''), parts.spread, parts.color].filter(Boolean).join(' ');
}

const BORDER_STYLES = new Set([
  'none', 'hidden', 'solid', 'dotted', 'dashed', 'double', 'groove', 'ridge', 'inset', 'outset',
]);
const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const BORDER_WIDTH_KEYWORDS = new Set(['thin', 'medium', 'thick']);
/** Split a CSS list without treating commas or whitespace inside functions or
 * quoted strings as separators.
 */
export function splitTopLevel(value: string, separator: 'comma' | 'space' | 'semicolon' | 'slash'): string[] {
  const exactSeparator = separator === 'semicolon' || separator === 'slash' ? separator : undefined;
  return parseCssList(value, separator === 'comma' ? 'comma' : 'space', exactSeparator)?.parts ?? [];
}

/** Parse a comma- or whitespace-separated CSS list into intact components.
 */
function parseCssList(
  value: string,
  separator: CssListSeparator,
  exactSeparator?: 'semicolon' | 'slash',
): CssList | null {
  const boundaries = findTopLevelBoundaries(value, separator, exactSeparator);
  if (boundaries === null) return null;
  if (boundaries.length === 0) {
    const bounds = trimBounds(value, 0, value.length);
    return {parts: bounds.start === bounds.end ? [] : [value.slice(bounds.start, bounds.end)]};
  }

  const parts: string[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    const token = trimBounds(value, start, boundary.start);
    if (token.start === token.end) return null;
    parts.push(value.slice(token.start, token.end));
    start = boundary.end;
  }
  const last = trimBounds(value, start, value.length);
  if (last.start === last.end) return null;
  parts.push(value.slice(last.start, last.end));
  return {parts};
}

export function decodeFourSideShorthand(value: string): FourSideValues | null {
  if (!value.trim() || value.includes('/*') || /\bvar\s*\(/i.test(value)) return null;
  const parsed = parseCssList(value, 'space');
  if (!parsed || parsed.parts.length < 1 || parsed.parts.length > 4) return null;
  const values = parsed.parts;
  if (values.some(token => token.includes('/'))) return null;
  if (values.length === 1) return [values[0], values[0], values[0], values[0]];
  if (values.length === 2) return [values[0], values[1], values[0], values[1]];
  if (values.length === 3) return [values[0], values[1], values[2], values[1]];
  return [values[0], values[1], values[2], values[3]];
}

export function encodeFourSideShorthand(values: FourSideValues): string {
  const [top, right, bottom, left] = values;
  if (top === right && top === bottom && top === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  if (right === left) return `${top} ${right} ${bottom}`;
  return values.join(' ');
}

export function decodeBackgroundLayers(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'none') return [];
  const parsed = parseCssList(trimmed, 'comma');
  return parsed?.parts.length ? parsed.parts : null;
}

export function encodeBackgroundLayers(layers: readonly string[]): string | null {
  const values = layers.map(layer => layer.trim());
  if (values.some(layer => !layer)) return null;
  return values.join(', ') || 'none';
}

export function decodeTransformFunctions(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'none') return [];
  const parsed = parseCssList(trimmed, 'space');
  return parsed?.parts.length ? parsed.parts : null;
}

export function encodeTransformFunctions(functions: readonly string[]): string | null {
  const values = functions.map(item => item.trim());
  if (values.some(item => !item)) return null;
  return values.join(' ') || 'none';
}

export function decodeBorderShorthand(value: string): BorderValues | null {
  if (!value.trim() || value.includes('/*') || /\bvar\s*\(/i.test(value)) return null;
  const tokens = parseCssList(value, 'space')?.parts;
  if (!tokens?.length) return null;
  if (tokens.length === 1 && CSS_WIDE_KEYWORDS.has(tokens[0].toLowerCase())) {
    return {width: tokens[0], style: tokens[0], color: tokens[0]};
  }

  let width = 'medium';
  let style = 'none';
  let hasWidth = false;
  let hasStyle = false;
  let color: string | undefined;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (BORDER_STYLES.has(lower)) {
      if (hasStyle) return null;
      style = token;
      hasStyle = true;
      continue;
    }
    if (BORDER_WIDTH_KEYWORDS.has(lower) || isBorderWidth(token)) {
      if (hasWidth) return null;
      width = token;
      hasWidth = true;
      continue;
    }
    if (CSS_WIDE_KEYWORDS.has(lower)) return null;
    if (color !== undefined) return null;
    color = token;
  }
  return {width, style, color: color ?? 'currentColor'};
}

export function decodeBorderRadiusShorthand(value: string): BorderRadiusValues | null {
  if (!value.trim() || value.includes('/*') || /\bvar\s*\(/i.test(value)) return null;
  const slash = splitAtTopLevelCharacter(value, '/');
  if (!slash) return null;
  const horizontal = parseCssList(slash[0], 'space')?.parts;
  const vertical = slash[1] === undefined ? horizontal : parseCssList(slash[1], 'space')?.parts;
  if (!horizontal || !vertical || horizontal.length < 1 || horizontal.length > 4 || vertical.length < 1 || vertical.length > 4) return null;
  const h = expandFour(horizontal);
  const v = expandFour(vertical);
  const corner = (index: number) => h[index] === v[index] ? h[index] : `${h[index]} ${v[index]}`;
  return {
    topLeft: corner(0),
    topRight: corner(1),
    bottomRight: corner(2),
    bottomLeft: corner(3),
  };
}

export function readCompositePart(style: CSSStyleDeclaration, parent: string, property: string): string {
  const explicit = getExplicitDeclaration(style, property);
  if (explicit) return explicit.value.trim();

  if (parent === 'margin' || parent === 'padding') {
    const shorthand = getExplicitDeclaration(style, parent)?.value;
    const values = shorthand ? decodeFourSideShorthand(shorthand) : null;
    const index = sideIndex(property, parent);
    return values && index >= 0 ? values[index] : '';
  }

  if (parent === 'border-radius') {
    const shorthand = getExplicitDeclaration(style, parent)?.value;
    const values = shorthand ? decodeBorderRadiusShorthand(shorthand) : null;
    if (!values) return '';
    const corner = radiusCorner(property);
    return corner ? values[corner] : '';
  }

  if (parent === 'border') {
    const shorthand = getExplicitDeclaration(style, parent)?.value;
    const values = shorthand ? decodeBorderShorthand(shorthand) : null;
    if (!values) return '';
    if (property === 'border-width') return values.width;
    if (property === 'border-style') return values.style;
    if (property === 'border-color') return values.color;
  }
  return '';
}

export function listExplicitDeclarations(style: CSSStyleDeclaration): CssDeclaration[] {
  // CSSStyleDeclaration.item() may enumerate longhands synthesized from a
  // shorthand. Only cssText identifies declarations actually authored in the
  // inline style, so those synthetic entries must not trigger mixed guards.
  const cssText = style.cssText.trim().replace(/;$/, '');
  const declarations = cssText ? parseCssList(cssText, 'space', 'semicolon')?.parts ?? [] : [];
  const explicit: CssDeclaration[] = [];
  for (const declaration of declarations) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim();
    if (!name) continue;
    explicit.push({
      property: name,
      value: style.getPropertyValue(name),
      priority: style.getPropertyPriority(name) === 'important' ? 'important' : '',
    });
  }
  return explicit;
}

export function getExplicitDeclaration(style: CSSStyleDeclaration, property: string): CssDeclaration | undefined {
  const wanted = normalizePropertyName(property);
  return listExplicitDeclarations(style).find(declaration => normalizePropertyName(declaration.property) === wanted);
}

export function hasExplicitDeclaration(style: CSSStyleDeclaration, property: string): boolean {
  return getExplicitDeclaration(style, property) !== undefined;
}

function findTopLevelBoundaries(
  value: string,
  separator: CssListSeparator,
  exactSeparator?: 'semicolon' | 'slash',
): Array<{start: number; end: number}> | null {
  const boundaries: Array<{start: number; end: number}> = [];
  let parens = 0;
  let brackets = 0;
  let braces = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '/' && value[index + 1] === '*') {
      const end = value.indexOf('*/', index + 2);
      if (end < 0) return null;
      index = end + 1;
      continue;
    }
    if (char === '(') { parens += 1; continue; }
    if (char === ')') { if (!parens) return null; parens -= 1; continue; }
    if (char === '[') { brackets += 1; continue; }
    if (char === ']') { if (!brackets) return null; brackets -= 1; continue; }
    if (char === '{') { braces += 1; continue; }
    if (char === '}') { if (!braces) return null; braces -= 1; continue; }
    if (parens || brackets || braces) continue;

    if (exactSeparator === 'slash' && char === '/') {
      boundaries.push({start: index, end: index + 1});
      continue;
    }
    if (exactSeparator === 'semicolon' && char === ';') {
      boundaries.push({start: index, end: index + 1});
      continue;
    }
    if (exactSeparator) continue;
    if (separator === 'comma' && char === ',') {
      boundaries.push({start: index, end: index + 1});
      continue;
    }
    if (separator === 'space' && /\s/.test(char)) {
      const start = index;
      while (index + 1 < value.length && /\s/.test(value[index + 1])) index += 1;
      boundaries.push({start, end: index + 1});
    }
  }
  if (quote || parens || brackets || braces) return null;
  return boundaries;
}

function splitAtTopLevelCharacter(value: string, separator: '/' | ';'): [string, string?] | null {
  const boundaries = findTopLevelBoundaries(value, 'space', separator === '/' ? 'slash' : 'semicolon');
  if (!boundaries) return null;
  if (boundaries.length > 1) return null;
  const boundary = boundaries[0];
  return boundary ? [value.slice(0, boundary.start).trim(), value.slice(boundary.end).trim()] : [value.trim()];
}

function trimBounds(value: string, start: number, end: number): {start: number; end: number} {
  while (start < end && /\s/.test(value[start])) start += 1;
  while (end > start && /\s/.test(value[end - 1])) end -= 1;
  return {start, end};
}

function expandFour(values: readonly string[]): FourSideValues {
  if (values.length === 1) return [values[0], values[0], values[0], values[0]];
  if (values.length === 2) return [values[0], values[1], values[0], values[1]];
  if (values.length === 3) return [values[0], values[1], values[2], values[1]];
  return [values[0], values[1], values[2], values[3]];
}

function sideIndex(property: string, parent: 'margin' | 'padding'): number {
  const side = property.slice(parent.length + 1);
  return ({top: 0, right: 1, bottom: 2, left: 3} as Record<string, number>)[side] ?? -1;
}

function radiusCorner(property: string): keyof BorderRadiusValues | undefined {
  const corners: Record<string, keyof BorderRadiusValues> = {
    'border-top-left-radius': 'topLeft',
    'border-top-right-radius': 'topRight',
    'border-bottom-right-radius': 'bottomRight',
    'border-bottom-left-radius': 'bottomLeft',
  };
  return corners[property];
}

function isBorderWidth(token: string): boolean {
  return /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[a-z]+|%)?|(?:calc|min|max|clamp)\(.+\))$/i.test(token);
}

function normalizePropertyName(property: string): string {
  return property.startsWith('--') ? property : property.toLowerCase();
}
