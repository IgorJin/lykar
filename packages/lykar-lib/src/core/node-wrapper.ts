import { getElementSelectors, getElementStylesMap } from './element-state';
import type { DropOrder } from './drag-and-drop/dnd';

type MovePatch = {
  order: DropOrder;
  source: NodeWrapperInterface;
  target: NodeWrapperInterface;
};

export class NodeWrapperStorage {
  private store = new Map<string, NodeWrapper>();

  push(wrapper: NodeWrapper) {
    this.store.set(wrapper.id, wrapper);
  }

  getById(id: string): NodeWrapper | undefined {
    return this.store.get(id);
  }

  getByDataId(node: HTMLElement): NodeWrapper | undefined {
    // TODO env constant
    const id = node.dataset['lykarSelectorId'];

    return id ? this.store.get(id) : undefined;
  }

  getByElement(node: HTMLElement): NodeWrapper | undefined {
    for (const wrapper of this.store.values()) {
      if (wrapper.element === node) return wrapper;
    }
    return undefined;
  }

  delete(id: string) {
    const wrapper = this.store.get(id);

    if (wrapper) {
      this.store.delete(id);
    }

    return true
  }
}

export interface NodeWrapperInterface {
  element: HTMLElement
  id: string
  selectors: { css: string, xpath: string }
  isSimplicity: boolean;
  stylesList: Record<string, string>;
  originalText: string | null;
}

export class NodeWrapper implements NodeWrapperInterface {
  element: HTMLElement
  id: string
  selectors: { css: string, xpath: string } = { css: '', xpath: '' }
  isSimplicity: boolean = false
  stylesList: Record<string, string> = {}
  originalText: string | null = null

  constructor(node: HTMLElement) {
    this.element = node
    // TODO заменит на uid
    const id = Math.floor(Math.random() * 10000).toString()
    this.id = id
    this.element.dataset['lykarSelectorId'] = id
  }

  create() {
    this.isSimplicity = this.element.childElementCount === 0
    this.originalText = this.element.textContent

    this.createSelectors()
    this.createStylesListMap()
  }

  createSelectors() {
    this.selectors = getElementSelectors(this.element)
  }

  createStylesListMap() {
    this.stylesList = getElementStylesMap(this.element)

    for (let i = 0; i < this.element.attributes.length; i++) console.log(this.element.attributes[i])
  }

  applyTextPatch(newValue: string | null) {
    this.element.textContent = newValue;
  }

  applyStylePatch(parameter: string, newValue: string | null) {
    console.log('applyStylePatch',parameter, newValue, (this.element.style as any)[parameter]);

    (this.element.style as any)[parameter] = newValue;
  }

  applyMovePatch({ order, source, target }: MovePatch) {
    const sourceElement = source.element;
    const targetElement = target.element;

    if (order === 'before') targetElement.parentNode?.insertBefore(sourceElement, targetElement);
    else if (order === 'after') targetElement.parentNode?.insertBefore(sourceElement, targetElement.nextSibling);
    else targetElement.appendChild(sourceElement);
  }

   // Подписаться на события hover TODO на будущее
  //  subscribeHover(onEnter: () => void, onLeave: () => void) {
  //   const enterHandler = (e: Event) => onEnter();
  //   const leaveHandler = (e: Event) => onLeave();
  //   this.el.addEventListener('mouseenter', enterHandler);
  //   this.el.addEventListener('mouseleave', leaveHandler);
  //   this.listeners.push({ type: 'mouseenter', handler: enterHandler });
  //   this.listeners.push({ type: 'mouseleave', handler: leaveHandler });
  // }
}
