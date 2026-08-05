import { finder } from '@medv/finder';
import { NodeWrapper, NodeWrapperStorage } from './node-wrapper';
import { ALL_STYLE_KEYS, StylesObject } from './styles-service/styles-config';
import { camelToKebab } from './helpers';

export function isEditorUiElement(node: HTMLElement | null): boolean {
  if (!node) return false;
  return (
    node.closest('.lykar-disable-tooltip') !== null ||
    node.closest('[data-lykar-ui-part]') !== null
  );
}

// TODO если решу сравнивать с наложением сайдбара на элемент
function isOverlapping(a: HTMLElement, b: HTMLElement): boolean {
  const rectA = a.getBoundingClientRect();
  const rectB = b.getBoundingClientRect();
  return !(
    rectA.right < rectB.left ||
    rectA.left > rectB.right ||
    rectA.bottom < rectB.top ||
    rectA.top > rectB.bottom
  );
}


export function getToolbarPosition(rect: DOMRect): { x: number; y: number } {
  const TOOLBAR_HEIGHT = 25;
  // const TOOLBAR_WIDTH = 180;
  const EDITOR_WIDTH = 300;

  const innerWidth = window.innerWidth - EDITOR_WIDTH;
  const resultPositions = { x: 0, y: 0 }

  resultPositions.x = rect.left
  resultPositions.y = rect.top

  // по идее не надо
  // if (rect.right > innerWidth) {
  //   console.log("rect.right > innerWidth", rect)
  //   resultPositions.x = rect.x + TOOLBAR_WIDTH
  //   resultPositions.y = rect.top - TOOLBAR_HEIGHT
  // }
  if (rect.top < TOOLBAR_HEIGHT) {
    resultPositions.x = Math.max(0, rect.left)
    resultPositions.y = (rect.bottom + TOOLBAR_HEIGHT) > window.innerHeight ? TOOLBAR_HEIGHT : rect.bottom + TOOLBAR_HEIGHT
  }

  return resultPositions
}

export const getElementSelectors = (element: HTMLElement) => {
  const getCssSelector = (el: HTMLElement) => {
    return finder(el, { root: document.body });
  }

  const getXPathSelector = (element: HTMLElement) => {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let ix = 0;
      let sib = element.previousSibling;
      while (sib) {
        if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === element.nodeName) {
          ix++;
        }
        sib = sib.previousSibling;
      }
      const tagName = element.nodeName.toLowerCase();
      const part = ix ? `${tagName}[${ix + 1}]` : tagName;
      parts.unshift(part);
      element = element.parentElement!;
    }
    return '/' + parts.join('/');
  }

  return {
    css: getCssSelector(element),
    xpath: getXPathSelector(element),
  };
}

export function getOrCreateWrapper(nodeWrapperStorage: NodeWrapperStorage, element: HTMLElement) {
  let wrapper = nodeWrapperStorage.getByElement(element);
  if (!wrapper) {
    wrapper = new NodeWrapper(element);
    wrapper.create()

    nodeWrapperStorage.push(wrapper);
  }
  return wrapper;
}

// TODO добавить сравнение результатов поиска?
export function findElementBySelectors(selectors: { css: string, xpath: string }) {
  let element: HTMLElement | null = document.querySelector(selectors.css)

  if (element) return element

  element = document.evaluate(selectors.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement | null

  return element;
}

export function getElementStylesMap(element: HTMLElement) {
  const elementStyles: Record<string, any> = window.getComputedStyle(element, null)

  const allowedStyles = ALL_STYLE_KEYS.reduce((acc, allowedKey) => ({ ...acc, [allowedKey]: elementStyles.getPropertyValue(camelToKebab(allowedKey)) || '' }), {} as StylesObject);

  return allowedStyles
}