import { stylesConfig, BaseStyleProperty, sectionsConfig, SectionsStylesType } from './styles-config';
import { camelCase } from '@/core/helpers'

export interface ConfigReducer {
  [index: string]: BaseStyleProperty & { key: SectionsStylesType }
}

type SectionsConfig = typeof sectionsConfig

function resolveExtends(
  config: typeof stylesConfig
): ConfigReducer {

  return config.reduce((acc, style) => {
    const camelCaseKey = camelCase(style.key) as SectionsStylesType;

    acc[camelCaseKey] = { ...style, key: camelCaseKey };

    if ('extends' in style && style.extends) {
      const camelCaseOfExtendsKey = camelCase(style.extends)

      const extendsProperty = acc[camelCaseOfExtendsKey]


      acc[camelCaseKey] = { ...acc[camelCaseKey], ...extendsProperty, key: camelCaseKey }
    };

    return acc
  }, {} as ConfigReducer);
}

export const stylesListConfigResolved = resolveExtends(stylesConfig);

type SectionResolved = { name: string; properties: BaseStyleProperty[] };

function resolveSections(sectionsConfig: SectionsConfig, stylesListConfigResolved: ConfigReducer): SectionResolved[] {
  return sectionsConfig.map(section => {
    const { properties: propertiesNames } = section;

    const properties = propertiesNames.map(p => stylesListConfigResolved[p]);

    return { ...section, properties };
  });
}

export const sectionsConfigResolved = resolveSections(sectionsConfig, stylesListConfigResolved)
console.log("🚀 ~ sectionsConfigResolved:", sectionsConfigResolved)
