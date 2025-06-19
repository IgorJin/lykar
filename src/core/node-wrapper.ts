import { stylesConfig } from '@/core/styles-service/styles-config';
import { getElementSelectors } from './utils';

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

    // TODO может возникнуть случай когда стиль у элемента в СПА приложении изменится, и мы можем получить устаревшие данные
    // возможно стоит получать их при каждом открытии формы
    this.createStylesListMap()
  }

  createSelectors() {
    this.selectors = getElementSelectors(this.element)
  }

  createStylesListMap() {
    const elementStyles: Record<string, any> = window.getComputedStyle(this.element, null)

    this.stylesList = Object.keys(stylesConfig).reduce((acc, style) => ({ ...acc, [style]: elementStyles[style] }), {})

    for (let i = 0; i < this.element.attributes.length; i++) console.log(this.element.attributes[i])
  }

  applyTextPatch(newValue: string | null) {
    this.element.textContent = newValue;
  }

  applyStylePatch(parameter: string, newValue: string | null) {
    console.log('applyStylePatch',parameter, newValue, (this.element.style as any)[parameter]);

    (this.element.style as any)[parameter] = newValue;
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
