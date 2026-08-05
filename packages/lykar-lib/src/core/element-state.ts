import { finder } from '@medv/finder';

import { camelToKebab } from './helpers';
import { ALL_STYLE_KEYS, StylesObject } from './styles-service/styles-config';

export function getElementSelectors(element: HTMLElement) {
  const css = finder(element, { root: document.body });

  if (element.id) {
    return { css, xpath: `//*[@id="${element.id}"]` };
  }

  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 0;
    let sibling = current.previousSibling;

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = current.nodeName.toLowerCase();
    parts.unshift(index ? `${tagName}[${index + 1}]` : tagName);
    current = current.parentElement;
  }

  return { css, xpath: `/${parts.join('/')}` };
}

export function getElementStylesMap(element: HTMLElement) {
  const elementStyles = window.getComputedStyle(element, null);

  return ALL_STYLE_KEYS.reduce(
    (styles, key) => ({
      ...styles,
      [key]: elementStyles.getPropertyValue(camelToKebab(key)) || '',
    }),
    {} as StylesObject,
  );
}
