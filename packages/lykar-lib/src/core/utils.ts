import { NodeWrapper, NodeWrapperStorage } from './node-wrapper';

export { getElementSelectors, getElementStylesMap } from './element-state';

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
