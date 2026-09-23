import {describe, expect, it} from 'vitest';

import {ALL_STYLE_KEYS} from '../../../lykar-lib/src/core/styles-service/styles-config.js';
import {LEGACY_STYLE_COVERAGE} from './legacy-style-coverage.js';
import {
  decodeBorderRadiusShorthand,
  decodeBorderShorthand,
  decodeFourSideShorthand,
  encodeFourSideShorthand,
  decodeShadow,
  encodeShadow,
} from './css-codecs.js';
import {splitTopLevel} from './style-manager.js';
import {
  STYLE_CATALOG,
  STYLE_FIELDS,
  STYLE_SECTIONS,
  getStyleField,
  normalizeCustomPropertyName,
} from './styles-config.js';

describe('style catalog schema', () => {
  it('has unique ids, kebab-case properties and complete section references', () => {
    const fieldIds = STYLE_FIELDS.map(field => field.id);
    const sectionIds = STYLE_SECTIONS.map(section => section.id);
    const references = STYLE_SECTIONS.flatMap(section => section.fieldIds);

    expect(new Set(fieldIds).size).toBe(fieldIds.length);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(new Set(references).size).toBe(references.length);
    expect(new Set(references)).toEqual(new Set(fieldIds));
    for (const field of STYLE_FIELDS) {
      expect(field.property).toMatch(/^(--[A-Za-z0-9_-]+|-?[a-z][a-z0-9-]*)$/);
      expect(field.ui.writeOnMount).toBe(false);
      if (field.control === 'select') expect(field.allowCustomValue).toBe(true);
      if (field.control === 'composite' || field.control === 'stack') {
        for (const part of field.parts) {
          expect(part.virtual).toBe(true);
          expect('property' in part).toBe(false);
          expect(part.affectedProperties.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('covers every active legacy key and the commented legacy capabilities', () => {
    const activeLegacy = new Set(ALL_STYLE_KEYS);
    const activeCoverage = new Set(
      LEGACY_STYLE_COVERAGE.filter(entry => entry.source === 'active').map(entry => entry.legacyKey),
    );
    expect(activeCoverage).toEqual(activeLegacy);
    expect(
      LEGACY_STYLE_COVERAGE.filter(entry => entry.source === 'commented-section').map(entry => entry.legacyKey).sort(),
    ).toEqual(['flexBasis', 'textShadow', 'transform']);
    for (const entry of LEGACY_STYLE_COVERAGE) {
      expect(getStyleField(entry.fieldId), `${entry.legacyKey} → ${entry.fieldId}`).toBeDefined();
      if (entry.virtual) expect(entry.reason).toBeTruthy();
    }
  });

  it('keeps unitless values unitless and fixes the legacy border radius alias', () => {
    for (const id of ['flex-grow', 'flex-shrink', 'order', 'opacity', 'z-index']) {
      expect(getStyleField(id)).toMatchObject({control: 'number-unit', units: [], unitless: true});
    }
    expect(LEGACY_STYLE_COVERAGE.find(entry => entry.legacyKey === 'borderRadiusC')).toMatchObject({
      fieldId: 'border-radius', aliasOf: 'border-radius',
    });
    expect(getStyleField('border-radius')?.property).toBe('border-radius');
  });

  it('exposes required visual groups and an open-ended raw fallback', () => {
    const expectedFields = [
      'font-family', 'font-size', 'color', 'display', 'flex-direction',
      'grid-template-columns', 'margin', 'padding', 'width', 'min-width',
      'max-width', 'background', 'border', 'box-shadow', 'opacity',
    ];
    for (const id of expectedFields) expect(getStyleField(id), id).toBeDefined();
    expect(STYLE_CATALOG.advanced).toMatchObject({
      control: 'input', codec: 'raw', allowAnyProperty: true, preserveCustomPropertyCase: true,
    });
    expect(normalizeCustomPropertyName('--BrandAccent')).toBe('--BrandAccent');
    expect(normalizeCustomPropertyName('fontSize')).toBe('font-size');
  });

  it('includes common layout and motion fields and declares all background side effects', () => {
    for (const property of [
      'grid-column', 'grid-row', 'grid-template-areas', 'grid-auto-columns',
      'justify-items', 'border-top', 'border-image', 'background-clip',
      'background-origin', 'writing-mode', 'container-type', 'scroll-snap-type',
      'mask', 'fill', 'stroke', 'animation-direction', 'animation-play-state',
    ]) expect(getStyleField(property), property).toBeDefined();
    expect(getStyleField('background')).toMatchObject({
      affectedProperties: expect.arrayContaining(['background-color', 'background-origin', 'background-clip']),
    });
    for (const id of ['box-shadow', 'text-shadow']) {
      const field = getStyleField(id);
      if (field?.control !== 'stack') throw new Error(`${id} must be a stack`);
      for (const part of field.parts.filter(part => part.control === 'number-unit')) {
        expect(part.units).not.toContain('%');
      }
    }
  });
});

describe('stack layer splitting', () => {
  it('preserves nested commas, quotes and transform function order', () => {
    expect(splitTopLevel('0 1px 4px rgb(1, 2, 3), inset 0 2px 3px var(--shadow)', 'comma')).toEqual([
      '0 1px 4px rgb(1, 2, 3)', 'inset 0 2px 3px var(--shadow)',
    ]);
    expect(splitTopLevel('linear-gradient(red, blue), url("a,b.png")', 'comma')).toEqual([
      'linear-gradient(red, blue)', 'url("a,b.png")',
    ]);
    expect(splitTopLevel('translate(10px, 20px) rotate(30deg)', 'space')).toEqual([
      'translate(10px, 20px)', 'rotate(30deg)',
    ]);
  });
});

describe('composite CSS codecs', () => {
  it('edits one shadow component without losing inset, offsets or a second layer', () => {
    const layers = splitTopLevel('0 1px 2px rgb(1, 2, 3), inset 0 2px 4px rgb(4, 5, 6)', 'comma');
    const second = decodeShadow(layers[1], true);
    expect(second).toMatchObject({x: '0', y: '2px', blur: '4px', color: 'rgb(4, 5, 6)', inset: 'inset'});
    layers[1] = encodeShadow({...second!, color: 'rgb(7, 8, 9)'});
    expect(splitTopLevel(layers.join(', '), 'comma')).toEqual([
      '0 1px 2px rgb(1, 2, 3)',
      'inset 0 2px 4px rgb(7, 8, 9)',
    ]);
    expect(decodeShadow('var(--shadow)', true)).toBeNull();
  });
  it('decodes and re-encodes one-to-four spacing values', () => {
    expect(decodeFourSideShorthand('1px')).toEqual(['1px', '1px', '1px', '1px']);
    expect(decodeFourSideShorthand('1px 2px')).toEqual(['1px', '2px', '1px', '2px']);
    expect(decodeFourSideShorthand('1px 2px 3px')).toEqual(['1px', '2px', '3px', '2px']);
    expect(decodeFourSideShorthand('1px 2px 3px 4px')).toEqual(['1px', '2px', '3px', '4px']);
    expect(decodeFourSideShorthand('var(--spacing)')).toBeNull();
    expect(encodeFourSideShorthand(['1px', '2px', '1px', '2px'])).toBe('1px 2px');
  });

  it('decodes common borders while leaving ambiguous shorthand raw', () => {
    expect(decodeBorderShorthand('2px solid rgb(1, 2, 3)')).toEqual({
      width: '2px', style: 'solid', color: 'rgb(1, 2, 3)',
    });
    expect(decodeBorderShorthand('var(--border)')).toBeNull();
  });

  it('decodes elliptical radii into per-corner values', () => {
    expect(decodeBorderRadiusShorthand('10px 20px / 30px 40px')).toEqual({
      topLeft: '10px 30px',
      topRight: '20px 40px',
      bottomRight: '10px 30px',
      bottomLeft: '20px 40px',
    });
    expect(decodeBorderRadiusShorthand('var(--radius)')).toBeNull();
  });
});
