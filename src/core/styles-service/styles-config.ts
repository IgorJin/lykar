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
  key: SectionsStylesType;
  label?: string;
  type: StyleInputType;
  units?: Unit[];
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | Option[];
  default?: string;
  extends?: string; // для наследования параметров
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
export const typeStack = 'stack';
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
const opstDisplay = ['block', 'inline', 'inline-block', 'flex', 'none']
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

export const stylesConfig = [
  // Number types
  {
    key: 'text-shadow-h',
    label: 'Text shadow X',
    type: typeNumber,
    units: unitsSizeNoPerc,
    default: '0',
  },
  {
    key: 'top',
    label: 'Top',
    type: typeNumber,
    units: unitsSize,
    default: 'auto',
    extends: 'text-shadow-h',
  },
  { key: 'right', type: typeNumber, extends: 'top' },
  { key: 'bottom', type: typeNumber, extends: 'top' },
  { key: 'left', type: typeNumber, extends: 'top' },

  { key: 'margin-top', type: typeNumber, default: '0', extends: 'top' },
  { key: 'margin-right', type: typeNumber, extends: 'margin-top' },
  { key: 'margin-bottom', type: typeNumber, extends: 'margin-top' },
  { key: 'margin-left', type: typeNumber, extends: 'margin-top' },

  { key: 'padding-top', type: typeNumber, min: 0, extends: 'margin-top' },
  { key: 'padding-right', type: typeNumber, extends: 'padding-top' },
  { key: 'padding-bottom', type: typeNumber, extends: 'padding-top' },
  { key: 'padding-left', type: typeNumber, extends: 'padding-top' },

  { key: 'width', type: typeNumber, min: 0, extends: 'top' },
  { key: 'min-width', type: typeNumber, extends: 'width' },
  { key: 'max-width', type: typeNumber, extends: 'width' },
  { key: 'height', type: typeNumber, extends: 'width' },
  { key: 'min-height', type: typeNumber, extends: 'width' },
  { key: 'max-height', type: typeNumber, extends: 'width' },

  { key: 'font-size', type: typeNumber, default: 'medium', extends: 'width' },
  { key: 'letter-spacing', type: typeNumber, default: 'normal', extends: 'top' },
  { key: 'line-height', type: typeNumber, extends: 'letter-spacing' },

  { key: 'text-shadow-v', type: typeNumber, extends: 'text-shadow-h' },
  { key: 'text-shadow-blur', type: typeNumber, min: 0, extends: 'text-shadow-h' },

  { key: 'border-radius-c', type: typeNumber, property: 'border-radius', extends: 'padding-top' },
  { key: 'border-top-left-radius', type: typeNumber, extends: 'border-radius-c' },
  { key: 'border-top-right-radius', type: typeNumber, extends: 'border-radius-c' },
  { key: 'border-bottom-left-radius', type: typeNumber, extends: 'border-radius-c' },
  { key: 'border-bottom-right-radius', type: typeNumber, extends: 'border-radius-c' },

  { key: 'border-width', type: typeNumber, units: unitsSizeNoPerc, extends: 'border-radius-c' },

  { key: 'box-shadow-h', type: typeNumber, extends: 'text-shadow-h' },
  { key: 'box-shadow-v', type: typeNumber, extends: 'text-shadow-h' },
  { key: 'box-shadow-blur', type: typeNumber, default: '5px', extends: 'text-shadow-blur' },
  { key: 'box-shadow-spread', type: typeNumber, extends: 'text-shadow-h' },

  { key: 'transition-duration', type: typeNumber, default: '2s', units: unitsTime, extends: 'border-radius-c' },
  { key: 'perspective', type: typeNumber, extends: 'border-radius-c' },

  { key: 'order', type: typeNumber, default: '0' },
  { key: 'flex-grow', type: typeNumber, extends: 'order' },
  { key: 'flex-shrink', type: typeNumber, default: '1', extends: 'order' },

  // Radio types
  { key: 'float', type: typeRadio, default: 'none', options: optsFloat },
  { key: 'position', type: typeSelect, default: 'static', options: optsPos, extends: 'float' },
  { key: 'text-align', type: typeSelect, default: 'left', options: optsTextAlign, extends: 'float' },

  // Color types
  { key: 'color', type: typeColor, default: 'black' },
  { key: 'text-shadow-color', type: typeColor, extends: 'color' },
  { key: 'border-color', type: typeColor, extends: 'color' },
  { key: 'box-shadow-color', type: typeColor, extends: 'color' },
  { key: 'background-color', type: typeColor, default: 'none', extends: 'color' },

  // File type
  {
    key: 'background-image',
    type: typeFile,
    functionName: 'url',
    default: 'none',
  },

  // Slider type
  { key: 'opacity', type: typeSlider, default: '1', min: 0, max: 1, step: 0.01 },

  // Select types
  { key: 'display', type: typeSelect, default: 'block', options: opstDisplay },
  { key: 'flex-direction', type: typeSelect, default: 'row', options: optsDir },
  { key: 'flex-wrap', type: typeSelect, default: 'nowrap', options: optsWrap, extends: 'flex-direction' },
  { key: 'justify-content', type: typeSelect, default: 'flex-start', options: optsJustCont, extends: 'flex-wrap' },
  { key: 'align-items', type: typeSelect, default: 'stretch', options: optsFlexAlign, extends: 'flex-wrap' },
  { key: 'align-content', type: typeSelect, options: optsAlignCont, extends: 'align-items' },
  { key: 'align-self', type: typeSelect, default: 'auto', options: optsAlignSelf },
  { key: 'font-family', type: typeSelect, default: 'Arial, Helvetica', options: optsFonts },
  { key: 'font-weight', type: typeSelect, default: '400', options: optsWeight },
  { key: 'border-style', type: typeSelect, default: 'solid', options: optsBorderStyle },
  { key: 'box-shadow-type', type: typeSelect, default: '', options: optsShadowType },
  { key: 'background-repeat', type: typeSelect, default: 'repeat', options: optsBgRepeat },
  { key: 'background-position', type: typeSelect, default: 'left top', options: optsBgPos },
  { key: 'background-attachment', type: typeSelect, default: 'scroll', options: optsBgAttach },
  { key: 'background-size', type: typeSelect, default: 'auto', options: optsBgSize },
  { key: 'transition-property', type: typeSelect, default: 'width', options: optsTransitProp },
  { key: 'transition-timing-function', type: typeSelect, default: 'ease', options: optsTransitFn },
  { key: 'cursor', type: typeSelect, default: 'auto', options: optsCursor },
  { key: 'overflow', type: typeSelect, default: 'visible', options: optsOverflow },
  { key: 'overflow-x', type: typeSelect, extends: 'overflow' },
  { key: 'overflow-y', type: typeSelect, extends: 'overflow' },

  // Composite types
  {
    key: 'margin',
    label: 'Margin',
    type: typeComposite,
    properties: [
      { key: 'margin-top', type: typeNumber, units: ['px'], default: '0' },
      { key: 'margin-right', type: typeNumber, units: ['px'], default: '0' },
      { key: 'margin-bottom', type: typeNumber, units: ['px'], default: '0' },
      { key: 'margin-left', type: typeNumber, units: ['px'], default: '0' },
    ]
  },
  {
    key: 'padding',
    label: 'Padding',
    type: typeComposite,
    properties: [
      { key: 'padding-top', type: typeNumber, units: ['px'], default: '0' },
      { key: 'padding-right', type: typeNumber, units: ['px'], default: '0' },
      { key: 'padding-bottom', type: typeNumber, units: ['px'], default: '0' },
      { key: 'padding-left', type: typeNumber, units: ['px'], default: '0' },
    ]
  },
  {
    key: 'border',
    label: 'Border',
    type: typeComposite,
    properties: [
      { key: 'border-width', type: typeNumber, units: ['px'], default: '0' },
      { key: 'border-style', type: typeSelect, options: optsBorderStyle, default: 'solid' },
      { key: 'border-color', type: typeColor, default: '#000' },
    ]
  },
  {
    key: 'border-radius',
    label: 'Border Radius',
    type: typeComposite,
    properties: [
      { key: 'border-top-left-radius', type: typeNumber, units: ['px'], default: '0' },
      { key: 'border-top-right-radius', type: typeNumber, units: ['px'], default: '0' },
      { key: 'border-bottom-right-radius', type: typeNumber, units: ['px'], default: '0' },
      { key: 'border-bottom-left-radius', type: typeNumber, units: ['px'], default: '0' },
    ]
  },

  // Stack types
  {
    key: 'transition',
    label: 'Transition',
    type: typeStack,
    properties: [
      { key: 'transition-property', type: typeSelect, options: optsTransitProp, default: 'width' },
      { key: 'transition-duration', type: typeNumber, units: unitsTime, default: '2s' },
      { key: 'transition-timing-function', type: typeSelect, options: optsTransitFn, default: 'ease' },
    ]
  },
  {
    key: 'box-shadow',
    label: 'Box Shadow',
    type: typeStack,
    properties: [
      { key: 'box-shadow-h', type: typeNumber, units: ['px'], default: '0' },
      { key: 'box-shadow-v', type: typeNumber, units: ['px'], default: '0' },
      { key: 'box-shadow-blur', type: typeNumber, units: ['px'], default: '5' },
      { key: 'box-shadow-spread', type: typeNumber, units: ['px'], default: '0' },
      { key: 'box-shadow-color', type: typeColor, default: '#000000' },
      { key: 'box-shadow-type', type: typeSelect, options: optsShadowType, default: '' }
    ]
  },
  {
    key: 'background',
    label: 'Background',
    type: typeStack,
    properties: [
      { key: 'background-image', type: typeFile, default: 'none', functionName: 'url' },
      { key: 'background-repeat', type: typeSelect, options: optsBgRepeat, default: 'repeat' },
      { key: 'background-position', type: typeSelect, options: optsBgPos, default: 'left top' },
      { key: 'background-attachment', type: typeSelect, options: optsBgAttach, default: 'scroll' },
      { key: 'background-size', type: typeSelect, options: optsBgSize, default: 'auto' },
    ]
  },
] as BaseStyleProperty[]

export const sectionsConfig = [
  // {
  //   name: 'General',
  //   properties: ['display', 'float', 'position', 'top', 'right', 'left', 'bottom'],
  // },
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
    name: 'Dimension',
    properties: ['width', 'height', 'maxWidth', 'minHeight', 'margin', 'padding'],
  },
  {
    name: 'Typography',
    properties: [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'color',
      'lineHeight',
      'textAlign',
      // 'textShadow',
      'backgroundColor', // убрать
    ],
  },
  // {
  //   name: 'Decorations',
  //   properties: ['backgroundColor', 'borderRadius', 'border', 'boxShadow', 'background'],
  // },
  // {
  //   name: 'Extra',
  //   properties: ['opacity', 'transition'] //'transform'],
  // },
] as const

export const STYLE_KEYS = stylesConfig.map(p => p.key) as string[];

export type SectionsStylesType = typeof sectionsConfig[number]['properties'][number];;

export default stylesConfig;
