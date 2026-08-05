import { STYLES_LIST, BaseStyleProperty, SectionsConfig, SECTIONS, StylesKeysType } from './styles-config';

export interface ConfigReducer {
  [index: string]: BaseStyleProperty & { key: StylesKeysType }
}

type SectionResolved = { name: string; label: string; properties: readonly BaseStyleProperty[] };
type stylesListConfigResolved = typeof STYLES_LIST

function resolveSections(sectionsConfig: SectionsConfig, stylesConfig: stylesListConfigResolved): SectionResolved[] {
  return sectionsConfig.map(section => {
    const { childProperties } = section;
    const getProperty = (property: string) => stylesConfig.find(style => style.key === property);

    const properties = childProperties.map(childProperty => getProperty(childProperty)!) as readonly BaseStyleProperty[];

    return { ...section, properties };
  });
}

export const sectionsConfigResolved = resolveSections(SECTIONS, STYLES_LIST)
