import { camelCase } from '@/core/helpers'

export interface PropertyProps {
  name?: string;
  label?: string;
  id?: string;
  property?: string;
  type?: string;
  defaults?: string;
  default?: string;
  info?: string;
  value?: any;
  icon?: string;
  functionName?: string;
  status?: string;
  visible?: boolean;
  fixedValues?: string[];
  className?: string;
}

type SelectOption = {
  id: string;
  value?: string;
  label?: string;
  name?: string;
  className?: string;
  title?: string;
  style?: string;
};

export interface PropertyNumberProps extends PropertyProps {
	units?: string[];
	min?: number;
	max?: number;
	step?: number;
}

export interface PropertySelectProps extends PropertyProps {
  options?: SelectOption[] | string[];
  list?: SelectOption[];
}

export interface SectorProperties {
  name: string;
  properties?: PropertyProps[];
}

export interface StyleManagerConfig {
  /**
   * Default sectors and properties
   */
  sectors?: (Omit<SectorProperties, 'properties'> & { properties?: (string | PropertyProps)[] })[];
}

type PartialProps = Partial<
  PropertyProps & PropertyNumberProps & PropertySelectProps & { properties?: any }
>;

type PropsToCreate = ([string, PartialProps, string] | [string, PartialProps])[]

const typeString = 'string'
const typeNumber = 'number';
const typeColor = 'color';
const typeRadio = 'radio';
const typeSelect = 'select';
const typeFile = 'file';
const typeSlider = 'slider';
const typeComposite = 'composite';
const typeStack = 'stack';
const unitsSize = ['px', '%', 'em', 'rem', 'vh', 'vw'];
const unitsSizeNoPerc = ['px', 'em', 'rem', 'vh', 'vw'];
const unitsTime = ['s', 'ms'];
const unitsAngle = ['deg', 'rad', 'grad'];
const fixedValues = ['initial', 'inherit', 'auto'];
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
  { id: '100', label: 'Thin' },
  { id: '200', label: 'Extra-Light' },
  { id: '300', label: 'Light' },
  { id: '400', label: 'Normal' },
  { id: '500', label: 'Medium' },
  { id: '600', label: 'Semi-Bold' },
  { id: '700', label: 'Bold' },
  { id: '800', label: 'Extra-Bold' },
  { id: '900', label: 'Ultra-Bold' },
];
const optsShadowType = [
  { id: '', label: 'Outside' },
  { id: 'inset', label: 'Inside' },
];
const optsFonts = [
  'Arial, Helvetica' + ss,
  'Arial Black, Gadget' + ss,
  'Brush Script MT' + ss,
  'Comic Sans MS, cursive' + ss,
  'Courier New, Courier, monospace',
  'Georgia, serif',
  'Helvetica' + ss,
  'Impact, Charcoal' + ss,
  'Lucida Sans Unicode, Lucida Grande' + ss,
  'Tahoma, Geneva' + ss,
  'Times New Roman, Times, serif',
  'Trebuchet MS, Helvetica' + ss,
  'Verdana, Geneva' + ss,
].map(font => {
  return { id: font, label: font.split(',')[0] };
});

// Fixed values
const fixedFontSizes = [
  'medium',
  'xx-small',
  'x-small',
  'small',
  'large',
  'x-large',
  'xx-large',
  'smaller',
  'larger',
  'length',
  'initial',
  'inherit',
];
const fixedLetSpace = ['normal', 'initial', 'inherit'];
const requireFlex = { display: ['flex'] };

const __sub = (items: any) => items

const propsToCreate: PropsToCreate = [
  // Number types
  ['text-shadow-h', { type: typeNumber, default: '0', units: unitsSizeNoPerc }],
  ['top', { default: 'auto', units: unitsSize, fixedValues }, 'text-shadow-h'],
  ['right', {}, 'top'],
  ['bottom', {}, 'top'],
  ['left', {}, 'top'],
  ['margin-top', { default: '0' }, 'top'],
  ['margin-right', {}, 'margin-top'],
  ['margin-bottom', {}, 'margin-top'],
  ['margin-left', {}, 'margin-top'],
  ['padding-top', { min: 0 }, 'margin-top'],
  ['padding-right', {}, 'padding-top'],
  ['padding-bottom', {}, 'padding-top'],
  ['padding-left', {}, 'padding-top'],
  ['width', { min: 0 }, 'top'],
  ['min-width', {}, 'width'],
  ['max-width', {}, 'width'],
  ['height', {}, 'width'],
  ['min-height', {}, 'width'],
  ['max-height', {}, 'width'],
  // ['flex-basis', { requiresParent: requireFlex }, 'width'],
  ['font-size', { default: 'medium', fixedValues: fixedFontSizes }, 'width'],
  ['letter-spacing', { default: 'normal', fixedValues: fixedLetSpace }, 'top'],
  ['line-height', {}, 'letter-spacing'],
  ['text-shadow-v', {}, 'text-shadow-h'],
  ['text-shadow-blur', { min: 0 }, 'text-shadow-h'],
  ['border-radius-c', { property: 'border-radius', fixedValues: undefined }, 'padding-top'],
  ['border-top-left-radius', {}, 'border-radius-c'],
  ['border-top-right-radius', {}, 'border-radius-c'],
  ['border-bottom-left-radius', {}, 'border-radius-c'],
  ['border-bottom-right-radius', {}, 'border-radius-c'],
  ['border-width', { units: unitsSizeNoPerc }, 'border-radius-c'],
  ['box-shadow-h', {}, 'text-shadow-h'],
  ['box-shadow-v', {}, 'text-shadow-h'],
  ['box-shadow-blur', { default: '5px' }, 'text-shadow-blur'],
  ['box-shadow-spread', {}, 'text-shadow-h'],
  ['transition-duration', { default: '2s', units: unitsTime }, 'border-radius-c'],
  ['perspective', {}, 'border-radius-c'],
  ['order', { type: typeNumber, default: '0' }],
  ['flex-grow', {}, 'order'],
  ['flex-shrink', { default: '1' }, 'order'],

  // Radio types
  ['float', { type: typeRadio, default: 'none', options: optsFloat }],
  ['position', { default: 'static', options: optsPos }, 'float'],
  ['text-align', { default: 'left', options: optsTextAlign }, 'float'],

  // Color types
  ['color', { type: typeColor, default: 'black' }],
  ['text-shadow-color', {}, 'color'],
  ['border-color', {}, 'color'],
  ['box-shadow-color', {}, 'color'],
  ['background-color', { default: 'none' }, 'color'],

  // File type
  [
    'background-image',
    {
      type: typeFile,
      functionName: 'url',
      default: 'none',
    },
  ],

  // Slider type
  ['opacity', { type: typeSlider, default: '1', min: 0, max: 1, step: 0.01 }],

  // Select types
  ['display', { type: typeSelect, default: 'block', options: opstDisplay }],
  ['flex-direction', { default: 'row', options: optsDir }, 'display'],
  ['flex-wrap', { default: 'nowrap', options: optsWrap }, 'flex-direction'],
  ['justify-content', { default: 'flex-start', options: optsJustCont }, 'flex-wrap'],
  ['align-items', { default: 'stretch', options: optsFlexAlign }, 'flex-wrap'],
  ['align-content', { options: optsAlignCont }, 'align-items'],
  [
    'align-self',
    {
      default: 'auto',
      options: optsAlignSelf,
    },
    'display',
  ],
  ['font-family', { default: 'Arial, Helvetica, sans-serif', options: optsFonts }, 'display'],
  ['font-weight', { default: '400', options: optsWeight }, 'display'],
  ['border-style', { default: 'solid', options: optsBorderStyle }, 'display'],
  ['box-shadow-type', { default: '', options: optsShadowType }, 'display'],
  ['background-repeat', { default: 'repeat', options: optsBgRepeat }, 'display'],
  ['background-position', { default: 'left top', options: optsBgPos }, 'display'],
  ['background-attachment', { default: 'scroll', options: optsBgAttach }, 'display'],
  ['background-size', { 'default': 'auto', options: optsBgSize }, 'display'],
  ['transition-property', { default: 'width', options: optsTransitProp }, 'display'],
  ['transition-timing-function', { default: 'ease', options: optsTransitFn }, 'display'],
  ['cursor', { default: 'auto', options: optsCursor }, 'display'],
  ['overflow', { default: 'visible', options: optsOverflow }, 'display'],
  ['overflow-x', {}, 'overflow'],
  ['overflow-y', {}, 'overflow'],

  // Composite types
  [
    'margin',
    {
      type: typeComposite,
      properties: __sub([
        { extend: 'margin-top', id: 'margin-top-sub' },
        { extend: 'margin-right', id: 'margin-right-sub' },
        { extend: 'margin-bottom', id: 'margin-bottom-sub' },
        { extend: 'margin-left', id: 'margin-left-sub' },
      ]),
    },
  ],
  [
    'padding',
    {
      properties: __sub([
        { extend: 'padding-top', id: 'padding-top-sub' },
        { extend: 'padding-right', id: 'padding-right-sub' },
        { extend: 'padding-bottom', id: 'padding-bottom-sub' },
        { extend: 'padding-left', id: 'padding-left-sub' },
      ]),
    },
    'margin',
  ],
  [
    'border',
    {
      properties: __sub([
        { extend: 'border-width', id: 'border-width-sub' },
        { extend: 'border-style', id: 'border-style-sub' },
        { extend: 'border-color', id: 'border-color-sub' },
      ]),
    },
    'margin',
  ],
  [
    'border-radius',
    {
      properties: __sub([
        {
          extend: 'border-top-left-radius',
          id: 'border-top-left-radius-sub',
        },
        {
          extend: 'border-top-right-radius',
          id: 'border-top-right-radius-sub',
        },
        {
          extend: 'border-bottom-right-radius',
          id: 'border-bottom-right-radius-sub',
        },
        {
          extend: 'border-bottom-left-radius',
          id: 'border-bottom-left-radius-sub',
        },
      ]),
    },
    'margin',
  ],

  // Stack types
  [
    'transition',
    {
      type: typeStack,
      properties: __sub([
        { extend: 'transition-property', id: 'transition-property-sub' },
        { extend: 'transition-duration', id: 'transition-duration-sub' },
        {
          extend: 'transition-timing-function',
          id: 'transition-timing-function-sub',
        },
      ]),
    },
  ],
  [
    'box-shadow',
    {
      // layerLabel: (l, { values }) => {
      //   const x = values['box-shadow-h'];
      //   const y = values['box-shadow-v'];
      //   const blur = values['box-shadow-blur'];
      //   const spread = values['box-shadow-spread'];
      //   return `${x} ${y} ${blur} ${spread}`;
      // },
      properties: __sub([
        'box-shadow-h',
        'box-shadow-v',
        'box-shadow-blur',
        'box-shadow-spread',
        'box-shadow-color',
        'box-shadow-type',
      ]),
    },
    'transition',
  ],
  [
    'background',
    {
      // layerLabel: (l, { values }) => {
      //   const repeat = values['background-repeat-sub'] || '';
      //   const pos = values['background-position-sub'] || '';
      //   const att = values['background-attachment-sub'] || '';
      //   const size = values['background-size-sub'] || '';
      //   return [repeat, pos, att, size].join(' ');
      // },
      properties: __sub([
        { extend: 'background-image', id: 'background-image-sub' },
        { extend: 'background-repeat', id: 'background-repeat-sub' },
        { extend: 'background-position', id: 'background-position-sub' },
        {
          extend: 'background-attachment',
          id: 'background-attachment-sub',
        },
        { extend: 'background-size', id: 'background-size-sub' },
      ]),
    },
    'box-shadow',
  ],
  // [
  //   'transform',
  //   {
  //     type: 'stack',
  //     layerSeparator: ' ',
  //     fromStyle(style, { property, name }) {
  //       const filter = (style[name] || '') as string;
  //       const sep = property.getLayerSeparator();
  //       return filter
  //         ? filter.split(sep).map(input => {
  //             const { name, value } = property.__parseFn(input);
  //             return {
  //               'transform-type': name,
  //               'transform-value': value,
  //             };
  //           })
  //         : [];
  //     },
  //     toStyle(values, { name }) {
  //       return { [name]: `${values['transform-type']}(${values['transform-value']})` };
  //     },
  //     properties: [
  //       {
  //         property: 'transform-type',
  //         name: 'Type',
  //         type: this.typeSelect,
  //         default: 'rotateZ',
  //         full: true,
  //         options: [
  //           { id: 'scaleX', propValue: { units: [''], step: 0.01 } },
  //           { id: 'scaleY', propValue: { units: [''], step: 0.01 } },
  //           { id: 'scaleZ', propValue: { units: [''], step: 0.01 } },
  //           {
  //             id: 'rotateX',
  //             propValue: { units: this.unitsAngle, step: 1 },
  //           },
  //           {
  //             id: 'rotateY',
  //             propValue: { units: this.unitsAngle, step: 1 },
  //           },
  //           {
  //             id: 'rotateZ',
  //             propValue: { units: this.unitsAngle, step: 1 },
  //           },
  //           {
  //             id: 'translateX',
  //             propValue: { units: this.unitsSize, step: 1 },
  //           },
  //           {
  //             id: 'translateY',
  //             propValue: { units: this.unitsSize, step: 1 },
  //           },
  //         ],
  //         onChange({ property, to }) {
  //           if (to.value) {
  //             const option = (property as PropertySelect).getOption();
  //             const props = { ...(option.propValue || {}) };
  //             const propToUp = property.getParent().getProperty('transform-value') as PropertyNumber;
  //             const unit = propToUp.getUnit();
  //             if (!unit || props?.units.indexOf(unit) < 0) {
  //               props.unit = props?.units[0] || '';
  //             }
  //             propToUp.up(props);
  //           }
  //         },
  //       },
  //       {
  //         property: 'transform-value',
  //         type: this.typeNumber,
  //         default: '0',
  //         full: true,
  //       },
  //     ],
  //   },
  // ],
];

export const SECTORS_CONFIG = [
  {
    name: 'General',
    properties: ['display', 'float', 'position', 'top', 'right', 'left', 'bottom'],
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
      'textShadow',
    ],
  },
  {
    name: 'Decorations',
    properties: ['backgroundColor', 'borderRadius', 'border', 'boxShadow', 'background'],
  },
  {
    name: 'Extra',
    properties: ['opacity', 'transition', 'transform'],
  },
] as const

export interface ConfigReducer {
  [index: string]: any
}

function normalizeDef(def: PartialProps): Omit<PartialProps, 'property'> {
  const out: Partial<PartialProps> = {};
  console.log("🚀 ~ normalizeDef ~ def:", def)

  out.type = def.type ?? typeString;

  // 1.2) Значения по умолчанию
  if (def.default !== undefined) {
    out.default = def.default;
  } else if (def.defaults !== undefined) {
    out.defaults = def.defaults;
  }

  // 1.3) Units и fixedValues
  if (def.units) {
    out.units = def.units;
  } else if (!def.options) {
    out.units = [...unitsSize];
  }
  if (def.fixedValues) {
    out.fixedValues = def.fixedValues;
  }

  // 1.4) Копируем стандартные поля, если они есть
  const copyFields: Array<keyof PartialProps> = [
    'name', 'label', 'id', 'info', 'icon', 'functionName', 'status', 'visible', 'className',
    'min', 'max', 'step', 'options', 'list'
  ];
  for (const field of copyFields) {
    if (def[field] !== undefined) {
      out[field] = def[field];
    }
  }

  return out as Omit<PropertyProps, 'property'>;
}

export const Generator = (config: PropsToCreate): ConfigReducer => {
  return config.reduce((acc, [propName, def, from] ) => {
    const camelCaseKey = camelCase(propName)

    if (acc[camelCaseKey]) {
      console.log(`Дублирование свойства "${propName}" пропускается.`);
      return acc;
    }

    const base = normalizeDef(def);

    let fromObj = {}


    if (from) {
      const camelCaseFromKey = camelCase(from)

      fromObj = normalizeDef(acc[camelCaseFromKey]);
    }
    

    acc[camelCaseKey] = { property: propName, ...fromObj, ...base }

    return acc
  }, {} as ConfigReducer)
}

export const STYLES_CONFIG = Generator(propsToCreate)

export const sectorsStyles = SECTORS_CONFIG.map(sector => sector.properties).flat()

export type StyleType = typeof sectorsStyles[number];