export type CSSPropertyName = string;

export type StyleControlKind =
  | 'input'
  | 'select'
  | 'color'
  | 'number-unit'
  | 'composite'
  | 'stack';

export type StyleCodecId =
  | 'raw'
  | 'keyword'
  | 'color'
  | 'number-unit'
  | 'spacing'
  | 'border'
  | 'radius'
  | 'shadow'
  | 'background'
  | 'transform'
  | 'filter'
  | 'transition'
  | 'animation';

export type StyleOption = {value: string; label: string};

export type StyleApplicability = {
  hint?: string;
  requires?: Readonly<Record<CSSPropertyName, readonly string[]>>;
  elements?: readonly string[];
  warning?: string;
};

export type StyleFieldUi = {
  placeholder?: string;
  defaultValue?: string;
  /** Defaults are display-only and must never create a mutation on read/mount. */
  writeOnMount: false;
};

type StyleFieldBase = {
  id: string;
  label: string;
  property: CSSPropertyName;
  codec: StyleCodecId;
  help?: string;
  keywords?: readonly string[];
  ui: StyleFieldUi;
  applicability?: StyleApplicability;
};

export type InputStyleField = StyleFieldBase & {
  control: 'input';
};

export type SelectStyleField = StyleFieldBase & {
  control: 'select';
  options: readonly StyleOption[];
  allowCustomValue: true;
};

export type ColorStyleField = StyleFieldBase & {
  control: 'color';
  allowRawValue: true;
};

export type NumberUnitStyleField = StyleFieldBase & {
  control: 'number-unit';
  units: readonly string[];
  unitless: boolean;
  min?: number;
  max?: number;
  step?: number;
};

export type StyleCompositePart = {
  id: string;
  label: string;
  control: Exclude<StyleControlKind, 'composite' | 'stack'>;
  codec: StyleCodecId;
  /** Virtual parts feed the parent codec and never become CSS property names. */
  virtual: true;
  affectedProperties: readonly CSSPropertyName[];
  units?: readonly string[];
  options?: readonly StyleOption[];
  keywords?: readonly string[];
};

export type CompositeStyleField = StyleFieldBase & {
  control: 'composite';
  parts: readonly StyleCompositePart[];
  affectedProperties: readonly CSSPropertyName[];
};

export type StackStyleField = StyleFieldBase & {
  control: 'stack';
  itemLabel: string;
  parts: readonly StyleCompositePart[];
  affectedProperties: readonly CSSPropertyName[];
};

export type StyleFieldDefinition =
  | InputStyleField
  | SelectStyleField
  | ColorStyleField
  | NumberUnitStyleField
  | CompositeStyleField
  | StackStyleField;

export type StyleSectionDefinition = {
  id: string;
  label: string;
  description: string;
  fieldIds: readonly string[];
  initiallyOpen?: boolean;
};

export type CustomStyleFallback = {
  control: 'input';
  codec: 'raw';
  allowAnyProperty: true;
  preserveCustomPropertyCase: true;
  propertyPlaceholder: string;
  valuePlaceholder: string;
  unsupportedValueMessage: string;
};

export type StyleCatalog = {
  sections: readonly StyleSectionDefinition[];
  fields: readonly StyleFieldDefinition[];
  advanced: CustomStyleFallback;
};

export type StyleValidationState =
  | {status: 'valid'}
  | {status: 'empty'}
  | {status: 'invalid'; message: string}
  | {status: 'unsupported'; message: string};

export type StyleFieldState = {
  fieldId: string;
  property: CSSPropertyName;
  authoredValue: string | null;
  computedValue: string | null;
  priority: '' | 'important';
  dirty: boolean;
  validation: StyleValidationState;
  affectedProperties: readonly CSSPropertyName[];
  applicability: 'applicable' | 'inactive' | 'unknown';
  applicabilityHint?: string;
};
