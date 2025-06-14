import { STYLES_CONFIG } from '@/components/styles-section/styles-config';

export class NodeWrapperStorage {
  private store = new Map<string, NodeWrapper>();

  push(wrapper: NodeWrapper) {
    this.store.set(wrapper.id, wrapper);
  }

  getById(id: string): NodeWrapper | undefined {
    return this.store.get(id);
  }

  getByDataSelector(node: HTMLElement): NodeWrapper | undefined {
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
  selectors: string[]
  coordinates: { x: number, y: number }
  isSimplicity: boolean;
  stylesList: Record<string, string>;
  originalText: string | null;
}

export class NodeWrapper implements NodeWrapperInterface {
  element: HTMLElement
  id: string
  selectors: string[] = []
  coordinates: { x: number, y: number } = { x: 0, y: 0 }
  isSimplicity: boolean = false
  stylesList: Record<string, string> = {}
  originalText: string | null = null

  constructor(node: HTMLElement) {
    this.element = node
    const id = Math.floor(Math.random() * 10000).toString()
    this.id = id
    this.element.dataset['lykarSelectorId'] = id
  }

  create() {
    this.isSimplicity = this.element.childElementCount === 0
    this.originalText = this.element.textContent

    this.createSelectors()
    this.createCoordinates()

    // TODO может возникнуть случай когда стиль у элемента в СПА приложении изменится, и мы можем получить устаревшие данные
    // возможно стоит получать их при каждом открытии формы
    this.createStylesListMap()
  }

  createSelectors() {
    this.selectors = Array.from(this.element.classList) // TODO

    // TODO заменить на номральный
    const generatePath = () => {
      const stack = []
      let el: any = this.element!

      while(el.parentNode) {
        const siblings = el.parentNode.childNodes

        let elementIndex = 0
        let sibCount = 0

        // eslint-disable-next-line no-loop-func
        siblings.forEach((sib: any) => {
          if (sib.nodeName === el.nodeName){
            if (el === sib) elementIndex = sibCount
            sibCount++
          } 
        })

        if (el.hasAttribute('id') && el.id !== '') {
          stack.unshift(el.nodeName.toLowerCase() + '#' + el.id);
        } else if ( sibCount > 1 ) {
          stack.unshift(el.nodeName.toLowerCase() + ':nth-child(' + ++elementIndex + ')');
        } else if (el.classList.length && el.classList.toString().split(' ').join('.') !== '') {
          stack.unshift(el.nodeName.toLowerCase() + '.' + el.classList.toString().split(' ').join('.'));
        } else {
          stack.unshift(el.nodeName.toLowerCase());
        }


        el = el.parentNode
      }

      return stack.slice(1).join(' > ')
    }
  }

  createCoordinates() {
    this.coordinates = {
      x: this.element.offsetLeft,
      y: this.element.offsetTop
    }
  }

  createStylesListMap() {
    const elementStyles: Record<string, any> = window.getComputedStyle(this.element, null)

    this.stylesList = Object.keys(STYLES_CONFIG).reduce((acc, style) => ({ ...acc, [style]: elementStyles[style] }), {})

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
