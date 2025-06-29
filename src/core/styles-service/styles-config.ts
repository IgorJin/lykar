type StyleInputType =
  | 'number'
  | 'color'
  | 'select'
  | 'radio'
  | 'file'
  | 'slider'
  | 'composite'
  | 'stack';

type Unit = 'px' | 'em' | 'rem' | '%' | 'vh' | 'vw' | 's' | 'ms';

export interface Option {
  value: string;
  label: string;
}

export interface BaseStyleProperty {
  // TODO непонятно почему так работает, ведь ключи у меня через "-" пишутся
  // лучше в будущем перенести тут в конфиге все key через camelCase
  key: StylesKeysType;
  label: string;
  type: StyleInputType;
  units?: Unit[];
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | Option[];
  default?: string;
  properties?: BaseStyleProperty[]; // для composite/stack
  property?: string;
  functionName?: any
}

export type Section = {
  name: string;
  properties: string[];
}

// stylesConfig.js
export const typeNumber = 'number';
export const typeColor = 'color';
export const typeRadio = 'radio';
export const typeSelect = 'select';
export const typeFile = 'file';
export const typeSlider = 'slider';
export const typeComposite = 'composite';
export const typeGrouped = 'grouped';
const unitsSize: Unit[] = ['px', '%', 'em', 'rem', 'vh', 'vw'];
const unitsSizeNoPerc: Unit[] = ['px', 'em', 'rem', 'vh', 'vw'];
const unitsTime: Unit[] = ['s', 'ms'];

const unitsAngle = ['deg', 'rad', 'grad'];
const ss = ', sans-serif';
const optsFlex = ['flex-start', 'flex-end', 'center'];
const optsFlexAlign = [...optsFlex, 'baseline', 'stretch'];

const optsBgSize = ['auto', 'cover', 'contain']
const optsBgAttach = ['scroll', 'fixed', 'local']
const optsBgRepeat = ['repeat', 'repeat-x', 'repeat-y', 'no-repeat']
const optsWrap = ['nowrap', 'wrap', 'wrap-reverse']
const optsOverflow = ['visible', 'hidden', 'scroll', 'auto']
const optsDir = ['row', 'row-reverse', 'column', 'column-reverse']
const optsDisplay = ['block', 'inline', 'inline-block', 'flex', 'none']
const optsTransitFn = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']
const optsCursor = ['auto', 'pointer', 'copy', 'crosshair', 'grab', 'grabbing', 'help', 'move', 'text']
const optsFloat = ['none', 'left', 'right']
const optsPos = ['static', 'relative', 'absolute', 'fixed']
const optsTextAlign = ['left', 'center', 'right', 'justify']
const optsJustCont = [...optsFlex, 'space-between', 'space-around', 'space-evenly']
const optsAlignCont = [...optsFlex, 'space-between', 'space-around', 'stretch'];
const optsAlignSelf = ['auto', ...optsFlexAlign]
const optsTransitProp = [
  'all',
  'width',
  'height',
  'background-color',
  'transform',
  'box-shadow',
  'opacity',
];
const optsBorderStyle = [
  'none',
  'solid',
  'dotted',
  'dashed',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
];
const optsBgPos = [
  'left top',
  'left center',
  'left bottom',
  'right top',
  'right center',
  'right bottom',
  'center top',
  'center center',
  'center bottom',
];
const optsWeight = [
  { value: '100', label: 'Thin' },
  { value: '200', label: 'Extra-Light' },
  { value: '300', label: 'Light' },
  { value: '400', label: 'Normal' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semi-Bold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra-Bold' },
  { value: '900', label: 'Ultra-Bold' },
];
const optsShadowType = [
  { value: '', label: 'Outside' },
  { value: 'inset', label: 'Inside' },
];
const optsFonts = [
  'Arial',
  'Arial Black',
  'Brush Scrip',
  'Comic Sans MS',
  'Courier New, Courier',
  'Georgia, serif',
  'Helvetica',
  'Impact',
  'Lucida Sans Unicode',
  'Tahoma',
  'Times New Roman, Times',
  'Trebuchet MS',
  'Verdana',
].map(font => {
  return { value: font, label: font.split(',')[0] };
});

// Fixed values
const requireFlex = { display: ['flex'] };

export const STYLES_LIST = [
  // Number types
  { key: 'top', label: 'Top', type: typeNumber, units: unitsSize, default: 'auto' },
  { key: 'right', label: 'Right', type: typeNumber, units: unitsSize },
  { key: 'bottom', label: 'Bottom', type: typeNumber, units: unitsSize },
  { key: 'left', label: 'Left', type: typeNumber, units: unitsSize },

  { key: 'marginTop', label: 'Margin Top', type: typeNumber, units: unitsSize, default: '0' },
  { key: 'marginRight', label: 'Margin Right', type: typeNumber, units: unitsSize },
  { key: 'marginBottom', label: 'Margin Bottom', type: typeNumber, units: unitsSize },
  { key: 'marginLeft', label: 'Margin Left', type: typeNumber, units: unitsSize },

  { key: 'paddingTop', label: 'Padding Top', type: typeNumber, units: unitsSize, min: 0 },
  { key: 'paddingRight', label: 'Padding Right', type: typeNumber, units: unitsSize },
  { key: 'paddingBottom', label: 'Padding Bottom', type: typeNumber, units: unitsSize },
  { key: 'paddingLeft', label: 'Padding Left', type: typeNumber, units: unitsSize },

  { key: 'width', label: 'Width', type: typeNumber, units: unitsSize, min: 0 },
  { key: 'minWidth', label: 'Min Width', type: typeNumber, units: unitsSize },
  { key: 'maxWidth', label: 'Max Width', type: typeNumber, units: unitsSize },
  { key: 'height', label: 'Height', type: typeNumber, units: unitsSize },
  { key: 'minHeight', label: 'Min Height', type: typeNumber, units: unitsSize },
  { key: 'maxHeight', label: 'Max Height', type: typeNumber, units: unitsSize },

  { key: 'fontSize', label: 'Font Size', type: typeNumber, units: unitsSize, default: 'medium' },
  { key: 'letterSpacing', label: 'Letter Spacing', type: typeNumber, units: unitsSize, default: 'normal' },
  { key: 'lineHeight', label: 'Line Height', type: typeNumber, units: unitsSize },

  { key: 'textShadowV', label: 'Text Shadow Y', type: typeNumber, units: unitsSize },
  { key: 'textShadowBlur', label: 'Text Shadow Blur', type: typeNumber, units: unitsSize, min: 0 },

  { key: 'borderRadiusC', label: 'Border Radius (Common)', type: typeNumber, units: unitsSize, property: 'border-radius' },
  { key: 'borderTopLeftRadius', label: 'Border Top Left Radius', type: typeNumber, units: unitsSize },
  { key: 'borderTopRightRadius', label: 'Border Top Right Radius', type: typeNumber, units: unitsSize },
  { key: 'borderBottomLeftRadius', label: 'Border Bottom Left Radius', type: typeNumber, units: unitsSize },
  { key: 'borderBottomRightRadius', label: 'Border Bottom Right Radius', type: typeNumber, units: unitsSize },

  { key: 'borderWidth', label: 'Border Width', type: typeNumber, units: unitsSizeNoPerc },

  { key: 'boxShadowH', label: 'Box Shadow X', type: typeNumber, units: unitsSize },
  { key: 'boxShadowV', label: 'Box Shadow Y', type: typeNumber, units: unitsSize },
  { key: 'boxShadowBlur', label: 'Box Shadow Blur', type: typeNumber, units: unitsSize, default: '5px' },
  { key: 'boxShadowSpread', label: 'Box Shadow Spread', type: typeNumber, units: unitsSize },

  { key: 'transitionDuration', label: 'Transition Duration', type: typeNumber, default: '2s', units: unitsTime },
  { key: 'perspective', label: 'Perspective', type: typeNumber, units: unitsSize },

  { key: 'order', label: 'Order', type: typeNumber, units: unitsSize, default: '0' },
  { key: 'flexGrow', label: 'Flex Grow', type: typeNumber, units: unitsSize },
  { key: 'flexShrink', label: 'Flex Shrink', type: typeNumber, units: unitsSize, default: '1' },

  // Radio types
  { key: 'float', label: 'Float', type: typeRadio, default: 'none', options: optsFloat },
  { key: 'position', label: 'Position', type: typeSelect, default: 'static', options: optsPos },
  { key: 'textAlign', label: 'Text Align', type: typeSelect, default: 'left', options: optsTextAlign },

  // Color types
  { key: 'color', label: 'Color', type: typeColor, default: 'black' },
  { key: 'textShadowColor', label: 'Text Shadow Color', type: typeColor },
  { key: 'borderColor', label: 'Border Color', type: typeColor },
  { key: 'boxShadowColor', label: 'Box Shadow Color', type: typeColor },
  { key: 'backgroundColor', label: 'Background Color', type: typeColor, default: 'none' },

  // File type
  { key: 'backgroundImage', label: 'Background Image', type: typeFile, functionName: 'url', default: 'none' },

  // Slider type
  { key: 'opacity', label: 'Opacity', type: typeSlider, default: '1', min: 0, max: 1, step: 0.01 },

  // Select types
  { key: 'display', label: 'Display', type: typeSelect, default: 'block', options: optsDisplay },
  { key: 'flexDirection', label: 'Flex Direction', type: typeSelect, default: 'row', options: optsDir },
  { key: 'flexWrap', label: 'Flex Wrap', type: typeSelect, default: 'nowrap', options: optsWrap },
  { key: 'justifyContent', label: 'Justify Content', type: typeSelect, default: 'flex-start', options: optsJustCont },
  { key: 'alignItems', label: 'Align Items', type: typeSelect, default: 'stretch', options: optsFlexAlign },
  { key: 'alignContent', label: 'Align Content', type: typeSelect, options: optsAlignCont },
  { key: 'alignSelf', label: 'Align Self', type: typeSelect, default: 'auto', options: optsAlignSelf },
  { key: 'fontFamily', label: 'Font Family', type: typeSelect, default: 'Arial, Helvetica', options: optsFonts },
  { key: 'fontWeight', label: 'Font Weight', type: typeSelect, default: '400', options: optsWeight },
  { key: 'borderStyle', label: 'Border Style', type: typeSelect, default: 'solid', options: optsBorderStyle },
  { key: 'boxShadowType', label: 'Box Shadow Type', type: typeSelect, default: '', options: optsShadowType },
  { key: 'backgroundRepeat', label: 'Background Repeat', type: typeSelect, default: 'repeat', options: optsBgRepeat },
  { key: 'backgroundPosition', label: 'Background Position', type: typeSelect, default: 'left top', options: optsBgPos },
  { key: 'backgroundAttachment', label: 'Background Attachment', type: typeSelect, default: 'scroll', options: optsBgAttach },
  { key: 'backgroundSize', label: 'Background Size', type: typeSelect, default: 'auto', options: optsBgSize },
  { key: 'transitionProperty', label: 'Transition Property', type: typeSelect, default: 'width', options: optsTransitProp },
  { key: 'transitionTimingFunction', label: 'Transition Timing Function', type: typeSelect, default: 'ease', options: optsTransitFn },
  { key: 'cursor', label: 'Cursor', type: typeSelect, default: 'auto', options: optsCursor },
  { key: 'overflow', label: 'Overflow', type: typeSelect, default: 'visible', options: optsOverflow },
  { key: 'overflowX', label: 'Overflow X', type: typeSelect, default: 'visible', options: optsOverflow },
  { key: 'overflowY', label: 'Overflow Y', type: typeSelect, default: 'visible', options: optsOverflow },

  // Composite types
  {
    key: 'margin',
    label: 'Margin',
    type: typeComposite,
    properties: [
      { key: 'marginTop', label: 'Margin Top', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'marginRight', label: 'Margin Right', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'marginBottom', label: 'Margin Bottom', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'marginLeft', label: 'Margin Left', type: typeNumber, units: unitsSize, default: '0' },
    ]
  },
  {
    key: 'padding',
    label: 'Padding',
    type: typeComposite,
    properties: [
      { key: 'paddingTop', label: 'Padding Top', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'paddingRight', label: 'Padding Right', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'paddingBottom', label: 'Padding Bottom', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'paddingLeft', label: 'Padding Left', type: typeNumber, units: unitsSize, default: '0' },
    ]
  },
  {
    key: 'border',
    label: 'Border',
    type: typeComposite,
    properties: [
      { key: 'borderWidth', label: 'Border Width', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'borderStyle', label: 'Border Style', type: typeSelect, options: optsBorderStyle, default: 'solid' },
      { key: 'borderColor', label: 'Border Color', type: typeColor, default: '#000' },
    ]
  },
  {
    key: 'borderRadius',
    label: 'Border Radius',
    type: typeComposite,
    properties: [
      { key: 'borderTopLeftRadius', label: 'Top Left', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'borderTopRightRadius', label: 'Top Right', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'borderBottomRightRadius', label: 'Bottom Right', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'borderBottomLeftRadius', label: 'Bottom Left', type: typeNumber, units: unitsSize, default: '0' },
    ]
  },

  // Grouped types
  {
    key: 'transition',
    label: 'Transition',
    type: typeGrouped,
    properties: [
      { key: 'transitionProperty', label: 'Property', type: typeSelect, options: optsTransitProp, default: 'width' },
      { key: 'transitionDuration', label: 'Duration', type: typeNumber, units: unitsTime, default: '2s' },
      { key: 'transitionTimingFunction', label: 'Timing Function', type: typeSelect, options: optsTransitFn, default: 'ease' },
    ]
  },
  {
    key: 'boxShadow',
    label: 'Box Shadow',
    type: typeGrouped,
    properties: [
      { key: 'boxShadowH', label: 'X', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'boxShadowV', label: 'Y', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'boxShadowBlur', label: 'Blur', type: typeNumber, units: unitsSize, default: '5' },
      { key: 'boxShadowSpread', label: 'Spread', type: typeNumber, units: unitsSize, default: '0' },
      { key: 'boxShadowColor', label: 'Color', type: typeColor, default: '#000000' },
      { key: 'boxShadowType', label: 'Type', type: typeSelect, options: optsShadowType, default: '' }
    ]
  },
  {
    key: 'background',
    label: 'Background',
    type: typeGrouped,
    properties: [
      { key: 'backgroundImage', label: 'Image', type: typeFile, default: 'none', functionName: 'url' },
      { key: 'backgroundRepeat', label: 'Repeat', type: typeSelect, options: optsBgRepeat, default: 'repeat' },
      { key: 'backgroundPosition', label: 'Position', type: typeSelect, options: optsBgPos, default: 'left top' },
      { key: 'backgroundAttachment', label: 'Attachment', type: typeSelect, options: optsBgAttach, default: 'scroll' },
      { key: 'backgroundSize', label: 'Size', type: typeSelect, options: optsBgSize, default: 'auto' },
    ]
  },
] as const;


export type SectionConfig<K extends string> = {
  name: string;
  label: string;
  childProperties: K[];
};

export type SectionsConfig = SectionConfig<StylesKeysType>[];

export const SECTIONS: SectionsConfig = [
  {
    name: 'general',
    label: 'General',
    childProperties: ['display', 'float', 'position', 'top', 'right', 'left', 'bottom'],
  },
  // {
  //   name: 'Flex',
  //   properties: [
  //     'flex-direction',
  //     'flex-wrap',
  //     'justify-content',
  //     'align-items',
  //     'align-content',
  //     'order',
  //     'flex-basis',
  //     'flex-grow',
  //     'flex-shrink',
  //     'align-self',
  //   ],
  // },
  {
    name: 'dimension',
    label: 'Dimension',
    childProperties: ['width', 'height', 'maxWidth', 'minHeight', 'margin', 'padding'],
  },
  {
    name: 'typography',
    label: 'Typography',
    childProperties: [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'color',
      'lineHeight',
      'textAlign',
      // 'textShadow',
    ],
  },
  {
    name: 'decorations',
    label: 'Decorations',
    childProperties: ['backgroundColor', 'borderRadius', 'border', 'boxShadow', 'background'],
  },
  // {
  //   name: 'Extra',
  //   childProperties: ['opacity', 'transition'] //'transform'],
  // },
];

function extractAllStyleKeys(config: readonly any[]): string[] {
  const keys: string[] = [];
  for (const item of config) {
    if (item.key) keys.push(item.key);
    if (item.properties) {
      keys.push(...extractAllStyleKeys(item.properties));
    }
  }
  return keys;
}
export const ALL_STYLE_KEYS = extractAllStyleKeys(STYLES_LIST);

export default STYLES_LIST;

type RecExtractKeys<T extends readonly any[]> =
  T[number] extends { key: infer K extends string, properties?: infer P }
  ? K | (P extends readonly any[] ? RecExtractKeys<P> : never)
  : never;

export type StylesKeysType = RecExtractKeys<typeof STYLES_LIST>;

export type StylesObject = Partial<Record<StylesKeysType, string>>;

