import type {
  ColorStyleField,
  CompositeStyleField,
  InputStyleField,
  NumberUnitStyleField,
  SelectStyleField,
  StackStyleField,
  StyleApplicability,
  StyleCatalog,
  StyleCodecId,
  StyleCompositePart,
  StyleFieldDefinition,
  StyleOption,
  StyleSectionDefinition,
} from './types.js';

const LENGTH_UNITS = ['px', '%', 'em', 'rem', 'vh', 'vw', 'vmin', 'vmax', 'ch', 'ex'] as const;
const LENGTH_UNITS_NO_PERCENT = ['px', 'em', 'rem', 'vh', 'vw', 'vmin', 'vmax', 'ch', 'ex'] as const;
const TIME_UNITS = ['ms', 's'] as const;
const ANGLE_UNITS = ['deg', 'rad', 'grad', 'turn'] as const;
const LENGTH_KEYWORDS = ['auto', 'min-content', 'max-content', 'fit-content', 'inherit', 'initial', 'unset', 'revert'] as const;
const GLOBAL_KEYWORDS = ['inherit', 'initial', 'unset', 'revert', 'revert-layer'] as const;

const options = (...values: string[]): StyleOption[] => values.map(value => ({value, label: value}));
const ui = (placeholder?: string, defaultValue?: string) => ({
  ...(placeholder ? {placeholder} : {}),
  ...(defaultValue ? {defaultValue} : {}),
  writeOnMount: false as const,
});

function input(
  id: string,
  label: string,
  property = id,
  codec: StyleCodecId = 'raw',
  placeholder = 'CSS value',
  applicability?: StyleApplicability,
): InputStyleField {
  return {id, label, property, control: 'input', codec, ui: ui(placeholder), ...(applicability ? {applicability} : {})};
}

function select(
  id: string,
  label: string,
  values: string[],
  defaultValue?: string,
  property = id,
  applicability?: StyleApplicability,
): SelectStyleField {
  return {
    id,
    label,
    property,
    control: 'select',
    codec: 'keyword',
    options: options(...values),
    allowCustomValue: true,
    ui: ui('Custom CSS value', defaultValue),
    keywords: GLOBAL_KEYWORDS,
    ...(applicability ? {applicability} : {}),
  };
}

function color(id: string, label: string, property = id, defaultValue?: string): ColorStyleField {
  return {
    id,
    label,
    property,
    control: 'color',
    codec: 'color',
    allowRawValue: true,
    ui: ui('Color, currentColor or var(--token)', defaultValue),
    keywords: ['transparent', 'currentColor', ...GLOBAL_KEYWORDS],
  };
}

function numberUnit(
  id: string,
  label: string,
  config: {
    property?: string;
    units?: readonly string[];
    unitless?: boolean;
    min?: number;
    max?: number;
    step?: number;
    defaultValue?: string;
    keywords?: readonly string[];
    applicability?: StyleApplicability;
  } = {},
): NumberUnitStyleField {
  return {
    id,
    label,
    property: config.property ?? id,
    control: 'number-unit',
    codec: 'number-unit',
    units: config.units ?? LENGTH_UNITS,
    unitless: config.unitless ?? false,
    ui: ui('Number, keyword or CSS expression', config.defaultValue),
    keywords: config.keywords ?? LENGTH_KEYWORDS,
    ...(config.min !== undefined ? {min: config.min} : {}),
    ...(config.max !== undefined ? {max: config.max} : {}),
    ...(config.step !== undefined ? {step: config.step} : {}),
    ...(config.applicability ? {applicability: config.applicability} : {}),
  };
}

const part = (
  id: string,
  label: string,
  affectedProperties: readonly string[],
  config: Partial<Omit<StyleCompositePart, 'id' | 'label' | 'virtual' | 'affectedProperties'>> = {},
): StyleCompositePart => ({
  id,
  label,
  control: config.control ?? 'input',
  codec: config.codec ?? 'raw',
  virtual: true,
  affectedProperties,
  ...(config.units ? {units: config.units} : {}),
  ...(config.options ? {options: config.options} : {}),
  ...(config.keywords ? {keywords: config.keywords} : {}),
});

const flexContainer = {requires: {display: ['flex', 'inline-flex']}, hint: 'Active on a flex container.'} as const;
const layoutContainer = {requires: {display: ['flex', 'inline-flex', 'grid', 'inline-grid']}, hint: 'Usually active on a flex or grid container.'} as const;
const flexItem = {hint: 'Applies to an item inside a flex or grid container.'} as const;
const positioned = {hint: 'Inset and z-index depend on positioning and stacking context.'} as const;

const margin: CompositeStyleField = {
  id: 'margin', label: 'Margin', property: 'margin', control: 'composite', codec: 'spacing',
  ui: ui('Top right bottom left'),
  affectedProperties: [
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'margin-block', 'margin-inline', 'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end',
  ],
  parts: [
    part('margin-top-value', 'Top', ['margin-top'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS, keywords: LENGTH_KEYWORDS}),
    part('margin-right-value', 'Right', ['margin-right'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS, keywords: LENGTH_KEYWORDS}),
    part('margin-bottom-value', 'Bottom', ['margin-bottom'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS, keywords: LENGTH_KEYWORDS}),
    part('margin-left-value', 'Left', ['margin-left'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS, keywords: LENGTH_KEYWORDS}),
  ],
};

const padding: CompositeStyleField = {
  id: 'padding', label: 'Padding', property: 'padding', control: 'composite', codec: 'spacing',
  ui: ui('Top right bottom left'),
  affectedProperties: [
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'padding-block', 'padding-inline', 'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end',
  ],
  parts: [
    part('padding-top-value', 'Top', ['padding-top'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS}),
    part('padding-right-value', 'Right', ['padding-right'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS}),
    part('padding-bottom-value', 'Bottom', ['padding-bottom'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS}),
    part('padding-left-value', 'Left', ['padding-left'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS}),
  ],
};

const border: CompositeStyleField = {
  id: 'border', label: 'Border', property: 'border', control: 'composite', codec: 'border',
  ui: ui('Width style color'),
  affectedProperties: [
    'border-width', 'border-style', 'border-color',
    'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-block', 'border-inline', 'border-block-start', 'border-block-end', 'border-inline-start', 'border-inline-end',
    'border-block-width', 'border-inline-width', 'border-block-style', 'border-inline-style', 'border-block-color', 'border-inline-color',
    'border-block-start-width', 'border-block-end-width', 'border-inline-start-width', 'border-inline-end-width',
    'border-block-start-style', 'border-block-end-style', 'border-inline-start-style', 'border-inline-end-style',
    'border-block-start-color', 'border-block-end-color', 'border-inline-start-color', 'border-inline-end-color',
    'border-image', 'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat',
  ],
  parts: [
    part('border-width-value', 'Width', ['border-width'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS_NO_PERCENT}),
    part('border-style-value', 'Style', ['border-style'], {control: 'select', codec: 'keyword', options: options('none', 'solid', 'dotted', 'dashed', 'double', 'groove', 'ridge', 'inset', 'outset')}),
    part('border-color-value', 'Color', ['border-color'], {control: 'color', codec: 'color'}),
  ],
};

const borderRadius: CompositeStyleField = {
  id: 'border-radius', label: 'Border Radius', property: 'border-radius', control: 'composite', codec: 'radius',
  ui: ui('Common or per-corner radius'),
  affectedProperties: ['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  parts: [
    part('radius-top-left', 'Top left', ['border-top-left-radius'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS}),
    part('radius-top-right', 'Top right', ['border-top-right-radius'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS}),
    part('radius-bottom-right', 'Bottom right', ['border-bottom-right-radius'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS}),
    part('radius-bottom-left', 'Bottom left', ['border-bottom-left-radius'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS}),
  ],
};

const textShadow: StackStyleField = {
  id: 'text-shadow', label: 'Text Shadows', property: 'text-shadow', control: 'stack', codec: 'shadow',
  itemLabel: 'Shadow', ui: ui('none'), affectedProperties: ['text-shadow'],
  parts: [
    part('text-shadow-x', 'X', ['text-shadow'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS_NO_PERCENT}),
    part('text-shadow-y', 'Y', ['text-shadow'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS_NO_PERCENT}),
    part('text-shadow-blur', 'Blur', ['text-shadow'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS_NO_PERCENT}),
    part('text-shadow-color', 'Color', ['text-shadow'], {control: 'color', codec: 'color'}),
  ],
};

const boxShadow: StackStyleField = {
  id: 'box-shadow', label: 'Box Shadows', property: 'box-shadow', control: 'stack', codec: 'shadow',
  itemLabel: 'Shadow', ui: ui('none'), affectedProperties: ['box-shadow'],
  parts: [
    part('shadow-x', 'X', ['box-shadow'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS_NO_PERCENT}),
    part('shadow-y', 'Y', ['box-shadow'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS_NO_PERCENT}),
    part('shadow-blur', 'Blur', ['box-shadow'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS_NO_PERCENT}),
    part('shadow-spread', 'Spread', ['box-shadow'], {control: 'number-unit', codec: 'number-unit', units: LENGTH_UNITS_NO_PERCENT}),
    part('shadow-color', 'Color', ['box-shadow'], {control: 'color', codec: 'color'}),
    part('shadow-inset', 'Inset', ['box-shadow'], {control: 'select', codec: 'keyword', options: options('', 'inset')}),
  ],
};

const background: StackStyleField = {
  id: 'background', label: 'Background Layers', property: 'background', control: 'stack', codec: 'background',
  itemLabel: 'Layer', ui: ui('none'),
  affectedProperties: ['background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-attachment', 'background-origin', 'background-clip'],
  parts: [
    part('background-layer-image', 'Image/gradient', ['background-image'], {control: 'input', codec: 'raw'}),
    part('background-layer-position', 'Position', ['background-position'], {control: 'input', codec: 'raw'}),
    part('background-layer-size', 'Size', ['background-size'], {control: 'input', codec: 'raw'}),
    part('background-layer-repeat', 'Repeat', ['background-repeat'], {control: 'select', codec: 'keyword', options: options('repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round')}),
    part('background-layer-attachment', 'Attachment', ['background-attachment'], {control: 'select', codec: 'keyword', options: options('scroll', 'fixed', 'local')}),
  ],
};

const transition: StackStyleField = {
  id: 'transition', label: 'Transitions', property: 'transition', control: 'stack', codec: 'transition',
  itemLabel: 'Transition', ui: ui('Property duration timing delay'), affectedProperties: ['transition'],
  parts: [
    part('transition-item-property', 'Property', ['transition-property'], {control: 'input', codec: 'raw'}),
    part('transition-item-duration', 'Duration', ['transition-duration'], {control: 'number-unit', codec: 'number-unit', units: TIME_UNITS}),
    part('transition-item-timing', 'Timing', ['transition-timing-function'], {control: 'input', codec: 'raw'}),
    part('transition-item-delay', 'Delay', ['transition-delay'], {control: 'number-unit', codec: 'number-unit', units: TIME_UNITS}),
  ],
};

const transform: StackStyleField = {
  id: 'transform', label: 'Transforms', property: 'transform', control: 'stack', codec: 'transform',
  itemLabel: 'Transform function', ui: ui('none'), affectedProperties: ['transform'],
  parts: [
    part('transform-function', 'Function', ['transform'], {control: 'select', codec: 'keyword', options: options('translate', 'translateX', 'translateY', 'scale', 'rotate', 'skew')}),
    part('transform-value', 'Value', ['transform'], {control: 'input', codec: 'raw', units: [...LENGTH_UNITS, ...ANGLE_UNITS]}),
  ],
};

export const STYLE_FIELDS: readonly StyleFieldDefinition[] = [
  select('display', 'Display', ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'contents', 'none'], 'block', 'display', {warning: 'display:none hides the target; Reset remains available from history.'}),
  select('box-sizing', 'Box Sizing', ['content-box', 'border-box'], 'content-box'),
  select('visibility', 'Visibility', ['visible', 'hidden', 'collapse'], 'visible'),
  select('float', 'Float', ['none', 'left', 'right', 'inline-start', 'inline-end'], 'none'),
  select('overflow', 'Overflow', ['visible', 'hidden', 'clip', 'scroll', 'auto'], 'visible'),
  select('overflow-x', 'Overflow X', ['visible', 'hidden', 'clip', 'scroll', 'auto'], 'visible'),
  select('overflow-y', 'Overflow Y', ['visible', 'hidden', 'clip', 'scroll', 'auto'], 'visible'),
  select('flex-direction', 'Flex Direction', ['row', 'row-reverse', 'column', 'column-reverse'], 'row', 'flex-direction', flexContainer),
  select('flex-wrap', 'Flex Wrap', ['nowrap', 'wrap', 'wrap-reverse'], 'nowrap', 'flex-wrap', flexContainer),
  select('justify-content', 'Justify Content', ['normal', 'flex-start', 'flex-end', 'start', 'end', 'center', 'space-between', 'space-around', 'space-evenly', 'stretch'], 'normal', 'justify-content', layoutContainer),
  select('align-items', 'Align Items', ['normal', 'stretch', 'flex-start', 'flex-end', 'start', 'end', 'center', 'baseline'], 'normal', 'align-items', layoutContainer),
  select('align-content', 'Align Content', ['normal', 'stretch', 'flex-start', 'flex-end', 'start', 'end', 'center', 'space-between', 'space-around', 'space-evenly'], 'normal', 'align-content', layoutContainer),
  select('align-self', 'Align Self', ['auto', 'normal', 'stretch', 'flex-start', 'flex-end', 'start', 'end', 'center', 'baseline'], 'auto', 'align-self', flexItem),
  numberUnit('flex-basis', 'Flex Basis', {applicability: flexItem}),
  numberUnit('flex-grow', 'Flex Grow', {units: [], unitless: true, min: 0, step: 0.1, defaultValue: '0', keywords: GLOBAL_KEYWORDS, applicability: flexItem}),
  numberUnit('flex-shrink', 'Flex Shrink', {units: [], unitless: true, min: 0, step: 0.1, defaultValue: '1', keywords: GLOBAL_KEYWORDS, applicability: flexItem}),
  numberUnit('order', 'Order', {units: [], unitless: true, step: 1, defaultValue: '0', keywords: GLOBAL_KEYWORDS, applicability: flexItem}),
  input('grid-template-columns', 'Grid Columns'),
  input('grid-template-rows', 'Grid Rows'),
  input('grid-template-areas', 'Grid Areas'),
  input('grid-auto-columns', 'Grid Auto Columns'),
  input('grid-auto-rows', 'Grid Auto Rows'),
  input('grid-column', 'Grid Column'),
  input('grid-row', 'Grid Row'),
  input('grid-area', 'Grid Area'),
  select('justify-items', 'Justify Items', ['normal', 'stretch', 'start', 'end', 'center', 'baseline'], 'normal'),
  select('justify-self', 'Justify Self', ['auto', 'normal', 'stretch', 'start', 'end', 'center', 'baseline'], 'auto'),
  select('grid-auto-flow', 'Grid Auto Flow', ['row', 'column', 'dense', 'row dense', 'column dense'], 'row'),
  numberUnit('gap', 'Gap', {min: 0, keywords: ['normal', ...GLOBAL_KEYWORDS]}),
  numberUnit('row-gap', 'Row Gap', {min: 0, keywords: ['normal', ...GLOBAL_KEYWORDS]}),
  numberUnit('column-gap', 'Column Gap', {min: 0, keywords: ['normal', ...GLOBAL_KEYWORDS]}),

  numberUnit('width', 'Width', {min: 0}),
  numberUnit('min-width', 'Min Width', {min: 0}),
  numberUnit('max-width', 'Max Width', {min: 0, keywords: ['none', ...LENGTH_KEYWORDS]}),
  numberUnit('height', 'Height', {min: 0}),
  numberUnit('min-height', 'Min Height', {min: 0}),
  numberUnit('max-height', 'Max Height', {min: 0, keywords: ['none', ...LENGTH_KEYWORDS]}),
  input('aspect-ratio', 'Aspect Ratio', 'aspect-ratio', 'raw', 'auto, 16 / 9 or var(--ratio)'),

  margin,
  numberUnit('margin-top', 'Margin Top'),
  numberUnit('margin-right', 'Margin Right'),
  numberUnit('margin-bottom', 'Margin Bottom'),
  numberUnit('margin-left', 'Margin Left'),
  numberUnit('margin-block-start', 'Margin Block Start'),
  numberUnit('margin-block-end', 'Margin Block End'),
  numberUnit('margin-inline-start', 'Margin Inline Start'),
  numberUnit('margin-inline-end', 'Margin Inline End'),
  padding,
  numberUnit('padding-top', 'Padding Top', {min: 0}),
  numberUnit('padding-right', 'Padding Right', {min: 0}),
  numberUnit('padding-bottom', 'Padding Bottom', {min: 0}),
  numberUnit('padding-left', 'Padding Left', {min: 0}),
  numberUnit('padding-block-start', 'Padding Block Start', {min: 0}),
  numberUnit('padding-block-end', 'Padding Block End', {min: 0}),
  numberUnit('padding-inline-start', 'Padding Inline Start', {min: 0}),
  numberUnit('padding-inline-end', 'Padding Inline End', {min: 0}),

  select('position', 'Position', ['static', 'relative', 'absolute', 'fixed', 'sticky'], 'static'),
  numberUnit('top', 'Top', {applicability: positioned}),
  numberUnit('right', 'Right', {applicability: positioned}),
  numberUnit('bottom', 'Bottom', {applicability: positioned}),
  numberUnit('left', 'Left', {applicability: positioned}),
  numberUnit('inset-block-start', 'Inset Block Start', {applicability: positioned}),
  numberUnit('inset-block-end', 'Inset Block End', {applicability: positioned}),
  numberUnit('inset-inline-start', 'Inset Inline Start', {applicability: positioned}),
  numberUnit('inset-inline-end', 'Inset Inline End', {applicability: positioned}),
  numberUnit('z-index', 'Z Index', {units: [], unitless: true, step: 1, keywords: ['auto', ...GLOBAL_KEYWORDS], applicability: positioned}),

  color('color', 'Text Color', 'color', 'black'),
  select('font-family', 'Font Family', ['Arial', 'Arial Black', 'Comic Sans MS', 'Courier New, Courier', 'Georgia, serif', 'Helvetica', 'Impact', 'Tahoma', 'Times New Roman, Times', 'Trebuchet MS', 'Verdana'], 'Arial, Helvetica'),
  numberUnit('font-size', 'Font Size', {min: 0, defaultValue: 'medium', keywords: ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger', ...GLOBAL_KEYWORDS]}),
  select('font-weight', 'Font Weight', ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold', 'bolder', 'lighter'], '400'),
  select('font-style', 'Font Style', ['normal', 'italic', 'oblique'], 'normal'),
  numberUnit('line-height', 'Line Height', {units: [...LENGTH_UNITS, ''], unitless: true, keywords: ['normal', ...GLOBAL_KEYWORDS]}),
  numberUnit('letter-spacing', 'Letter Spacing', {defaultValue: 'normal', keywords: ['normal', ...GLOBAL_KEYWORDS]}),
  select('text-align', 'Text Align', ['start', 'end', 'left', 'right', 'center', 'justify'], 'start'),
  input('text-decoration', 'Text Decoration', 'text-decoration', 'raw', 'none, underline, color and style'),
  select('text-transform', 'Text Transform', ['none', 'capitalize', 'uppercase', 'lowercase', 'full-width'], 'none'),
  select('white-space', 'White Space', ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'], 'normal'),
  select('word-break', 'Word Break', ['normal', 'break-all', 'keep-all', 'break-word'], 'normal'),
  textShadow,

  color('background-color', 'Background Color', 'background-color', 'transparent'),
  input('background-image', 'Background Image / Gradient', 'background-image', 'raw', 'none, url(...) or gradient(...)'),
  select('background-repeat', 'Background Repeat', ['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round'], 'repeat'),
  input('background-position', 'Background Position', 'background-position', 'raw', 'center center'),
  input('background-size', 'Background Size', 'background-size', 'raw', 'auto, cover, contain or sizes'),
  select('background-attachment', 'Background Attachment', ['scroll', 'fixed', 'local'], 'scroll'),
  select('background-clip', 'Background Clip', ['border-box', 'padding-box', 'content-box', 'text'], 'border-box'),
  select('background-origin', 'Background Origin', ['border-box', 'padding-box', 'content-box'], 'padding-box'),
  select('background-blend-mode', 'Background Blend Mode', ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'], 'normal'),
  background,

  border,
  numberUnit('border-width', 'Border Width', {units: LENGTH_UNITS_NO_PERCENT, min: 0}),
  select('border-style', 'Border Style', ['none', 'hidden', 'solid', 'dotted', 'dashed', 'double', 'groove', 'ridge', 'inset', 'outset'], 'none'),
  color('border-color', 'Border Color', 'border-color', 'currentColor'),
  input('border-top', 'Border Top', 'border-top', 'border'),
  input('border-right', 'Border Right', 'border-right', 'border'),
  input('border-bottom', 'Border Bottom', 'border-bottom', 'border'),
  input('border-left', 'Border Left', 'border-left', 'border'),
  input('border-image', 'Border Image'),
  borderRadius,
  numberUnit('border-top-left-radius', 'Top Left Radius', {min: 0}),
  numberUnit('border-top-right-radius', 'Top Right Radius', {min: 0}),
  numberUnit('border-bottom-right-radius', 'Bottom Right Radius', {min: 0}),
  numberUnit('border-bottom-left-radius', 'Bottom Left Radius', {min: 0}),
  input('outline', 'Outline', 'outline', 'border', 'width style color'),
  numberUnit('outline-offset', 'Outline Offset'),

  numberUnit('opacity', 'Opacity', {units: [], unitless: true, min: 0, max: 1, step: 0.01, defaultValue: '1', keywords: GLOBAL_KEYWORDS}),
  boxShadow,
  transform,
  input('transform-origin', 'Transform Origin', 'transform-origin', 'raw', 'center or x y z'),
  numberUnit('perspective', 'Perspective', {units: LENGTH_UNITS_NO_PERCENT, min: 0, keywords: ['none', ...GLOBAL_KEYWORDS]}),
  input('filter', 'Filter', 'filter', 'filter', 'none, blur(...), brightness(...)'),
  input('backdrop-filter', 'Backdrop Filter', 'backdrop-filter', 'filter', 'none or filter functions'),
  transition,
  input('transition-property', 'Transition Property', 'transition-property', 'raw', 'all or property list'),
  numberUnit('transition-duration', 'Transition Duration', {units: TIME_UNITS, min: 0, defaultValue: '0s', keywords: GLOBAL_KEYWORDS}),
  input('transition-timing-function', 'Transition Timing', 'transition-timing-function', 'raw', 'ease, cubic-bezier(...) or steps(...)'),
  numberUnit('transition-delay', 'Transition Delay', {units: TIME_UNITS, defaultValue: '0s', keywords: GLOBAL_KEYWORDS}),
  input('animation-name', 'Animation Name', 'animation-name', 'animation', 'none or @keyframes name'),
  numberUnit('animation-duration', 'Animation Duration', {units: TIME_UNITS, min: 0, defaultValue: '0s', keywords: GLOBAL_KEYWORDS}),
  input('animation-timing-function', 'Animation Timing', 'animation-timing-function', 'animation', 'ease, cubic-bezier(...) or steps(...)'),
  numberUnit('animation-delay', 'Animation Delay', {units: TIME_UNITS, defaultValue: '0s', keywords: GLOBAL_KEYWORDS}),
  input('animation-iteration-count', 'Animation Iterations', 'animation-iteration-count', 'animation', '1, infinite or var(...)'),
  select('animation-fill-mode', 'Animation Fill Mode', ['none', 'forwards', 'backwards', 'both'], 'none'),
  select('animation-direction', 'Animation Direction', ['normal', 'reverse', 'alternate', 'alternate-reverse'], 'normal'),
  select('animation-play-state', 'Animation Play State', ['running', 'paused'], 'running'),

  select('cursor', 'Cursor', ['auto', 'default', 'pointer', 'copy', 'crosshair', 'grab', 'grabbing', 'help', 'move', 'not-allowed', 'text', 'wait', 'zoom-in', 'zoom-out'], 'auto'),
  select('object-fit', 'Object Fit', ['fill', 'contain', 'cover', 'none', 'scale-down'], 'fill', 'object-fit', {elements: ['img', 'video'], hint: 'Applies to replaced elements such as images and video.'}),
  input('object-position', 'Object Position', 'object-position', 'raw', 'center or x y'),
  input('clip-path', 'Clip Path', 'clip-path', 'raw', 'none, inset(...), circle(...) or path(...)'),
  select('writing-mode', 'Writing Mode', ['horizontal-tb', 'vertical-rl', 'vertical-lr'], 'horizontal-tb'),
  select('container-type', 'Container Type', ['normal', 'size', 'inline-size'], 'normal'),
  input('container-name', 'Container Name'),
  input('scroll-snap-type', 'Scroll Snap Type'),
  input('mask', 'Mask'),
  color('fill', 'SVG Fill'),
  color('stroke', 'SVG Stroke'),
] as const;

export const STYLE_SECTIONS: readonly StyleSectionDefinition[] = [
  {id: 'layout', label: 'Layout', description: 'Display, flex, grid, gaps and overflow.', initiallyOpen: true, fieldIds: ['display', 'box-sizing', 'visibility', 'float', 'overflow', 'overflow-x', 'overflow-y', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'align-self', 'flex-basis', 'flex-grow', 'flex-shrink', 'order', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-columns', 'grid-auto-rows', 'grid-column', 'grid-row', 'grid-area', 'justify-items', 'justify-self', 'grid-auto-flow', 'gap', 'row-gap', 'column-gap']},
  {id: 'size', label: 'Size', description: 'Width, height and constraints.', fieldIds: ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'aspect-ratio']},
  {id: 'space', label: 'Space', description: 'Physical and logical margin and padding.', fieldIds: ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end']},
  {id: 'position', label: 'Position', description: 'Position, insets and stacking.', fieldIds: ['position', 'top', 'right', 'bottom', 'left', 'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end', 'z-index']},
  {id: 'typography', label: 'Typography', description: 'Fonts, text flow, alignment and shadows.', fieldIds: ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform', 'white-space', 'word-break', 'text-shadow']},
  {id: 'background', label: 'Background', description: 'Colors, images, gradients and multiple layers.', fieldIds: ['background-color', 'background-image', 'background-repeat', 'background-position', 'background-size', 'background-attachment', 'background-clip', 'background-origin', 'background-blend-mode', 'background']},
  {id: 'borders', label: 'Borders', description: 'Border, radius and outline.', fieldIds: ['border', 'border-width', 'border-style', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-image', 'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'outline', 'outline-offset']},
  {id: 'effects', label: 'Effects', description: 'Opacity, shadows, transforms, filters and motion.', fieldIds: ['opacity', 'box-shadow', 'transform', 'transform-origin', 'perspective', 'filter', 'backdrop-filter', 'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-fill-mode', 'animation-direction', 'animation-play-state']},
  {id: 'advanced', label: 'Advanced', description: 'Less common declarations and arbitrary supported CSS.', fieldIds: ['cursor', 'object-fit', 'object-position', 'clip-path', 'writing-mode', 'container-type', 'container-name', 'scroll-snap-type', 'mask', 'fill', 'stroke']},
] as const;

export const STYLE_CATALOG: StyleCatalog = {
  sections: STYLE_SECTIONS,
  fields: STYLE_FIELDS,
  advanced: {
    control: 'input',
    codec: 'raw',
    allowAnyProperty: true,
    preserveCustomPropertyCase: true,
    propertyPlaceholder: 'property or --CustomToken',
    valuePlaceholder: 'Any CSS value supported by this browser',
    unsupportedValueMessage: 'The browser did not accept this property/value pair. The authored value was preserved for correction.',
  },
};

const FIELD_BY_ID = new Map(STYLE_FIELDS.map(field => [field.id, field]));

export function getStyleField(id: string): StyleFieldDefinition | undefined {
  return FIELD_BY_ID.get(id);
}

export function normalizeCustomPropertyName(property: string): string {
  const trimmed = property.trim();
  return trimmed.startsWith('--') ? trimmed : trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
}
