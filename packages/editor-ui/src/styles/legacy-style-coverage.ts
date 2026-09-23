export type LegacyStyleCoverageEntry = {
  legacyKey: string;
  fieldId: string;
  source: 'active' | 'commented-section';
  aliasOf?: string;
  virtual?: true;
  reason?: string;
};

const direct = (legacyKey: string, fieldId: string): LegacyStyleCoverageEntry => ({legacyKey, fieldId, source: 'active'});
const virtual = (legacyKey: string, fieldId: string, reason: string): LegacyStyleCoverageEntry => ({
  legacyKey, fieldId, source: 'active', virtual: true, reason,
});

/**
 * Audited against packages/lykar-lib/src/core/styles-service/styles-config.ts.
 * Virtual legacy keys are codec inputs and must never be emitted as standalone
 * CSS property names.
 */
export const LEGACY_STYLE_COVERAGE: readonly LegacyStyleCoverageEntry[] = [
  direct('top', 'top'),
  direct('right', 'right'),
  direct('bottom', 'bottom'),
  direct('left', 'left'),
  direct('marginTop', 'margin-top'),
  direct('marginRight', 'margin-right'),
  direct('marginBottom', 'margin-bottom'),
  direct('marginLeft', 'margin-left'),
  direct('paddingTop', 'padding-top'),
  direct('paddingRight', 'padding-right'),
  direct('paddingBottom', 'padding-bottom'),
  direct('paddingLeft', 'padding-left'),
  direct('width', 'width'),
  direct('minWidth', 'min-width'),
  direct('maxWidth', 'max-width'),
  direct('height', 'height'),
  direct('minHeight', 'min-height'),
  direct('maxHeight', 'max-height'),
  direct('fontSize', 'font-size'),
  direct('letterSpacing', 'letter-spacing'),
  direct('lineHeight', 'line-height'),
  virtual('textShadowV', 'text-shadow', 'Y offset is encoded by the text-shadow stack codec.'),
  virtual('textShadowBlur', 'text-shadow', 'Blur is encoded by the text-shadow stack codec.'),
  {legacyKey: 'borderRadiusC', fieldId: 'border-radius', source: 'active', aliasOf: 'border-radius'},
  direct('borderTopLeftRadius', 'border-top-left-radius'),
  direct('borderTopRightRadius', 'border-top-right-radius'),
  direct('borderBottomLeftRadius', 'border-bottom-left-radius'),
  direct('borderBottomRightRadius', 'border-bottom-right-radius'),
  direct('borderWidth', 'border-width'),
  virtual('boxShadowH', 'box-shadow', 'X offset is encoded by the box-shadow stack codec.'),
  virtual('boxShadowV', 'box-shadow', 'Y offset is encoded by the box-shadow stack codec.'),
  virtual('boxShadowBlur', 'box-shadow', 'Blur is encoded by the box-shadow stack codec.'),
  virtual('boxShadowSpread', 'box-shadow', 'Spread is encoded by the box-shadow stack codec.'),
  virtual('transitionDuration', 'transition-duration', 'Legacy grouped transition input maps to a real duration field and stack part.'),
  direct('perspective', 'perspective'),
  direct('order', 'order'),
  direct('flexGrow', 'flex-grow'),
  direct('flexShrink', 'flex-shrink'),
  direct('float', 'float'),
  direct('position', 'position'),
  direct('textAlign', 'text-align'),
  direct('color', 'color'),
  virtual('textShadowColor', 'text-shadow', 'Color is encoded by the text-shadow stack codec.'),
  direct('borderColor', 'border-color'),
  virtual('boxShadowColor', 'box-shadow', 'Color is encoded by the box-shadow stack codec.'),
  direct('backgroundColor', 'background-color'),
  direct('backgroundImage', 'background-image'),
  direct('opacity', 'opacity'),
  direct('display', 'display'),
  direct('flexDirection', 'flex-direction'),
  direct('flexWrap', 'flex-wrap'),
  direct('justifyContent', 'justify-content'),
  direct('alignItems', 'align-items'),
  direct('alignContent', 'align-content'),
  direct('alignSelf', 'align-self'),
  direct('fontFamily', 'font-family'),
  direct('fontWeight', 'font-weight'),
  direct('borderStyle', 'border-style'),
  virtual('boxShadowType', 'box-shadow', 'Inset/outside is encoded by the box-shadow stack codec.'),
  direct('backgroundRepeat', 'background-repeat'),
  direct('backgroundPosition', 'background-position'),
  direct('backgroundAttachment', 'background-attachment'),
  direct('backgroundSize', 'background-size'),
  virtual('transitionProperty', 'transition-property', 'Legacy grouped transition input maps to a real property field and stack part.'),
  virtual('transitionTimingFunction', 'transition-timing-function', 'Legacy grouped transition input maps to a real timing field and stack part.'),
  direct('cursor', 'cursor'),
  direct('overflow', 'overflow'),
  direct('overflowX', 'overflow-x'),
  direct('overflowY', 'overflow-y'),
  direct('margin', 'margin'),
  direct('padding', 'padding'),
  direct('border', 'border'),
  direct('borderRadius', 'border-radius'),
  direct('transition', 'transition'),
  direct('boxShadow', 'box-shadow'),
  direct('background', 'background'),

  {legacyKey: 'flexBasis', fieldId: 'flex-basis', source: 'commented-section'},
  {legacyKey: 'textShadow', fieldId: 'text-shadow', source: 'commented-section'},
  {legacyKey: 'transform', fieldId: 'transform', source: 'commented-section'},
] as const;
