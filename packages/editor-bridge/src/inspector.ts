import { OverlayService } from './overlay.js';

const BLOCKED_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'TITLE']);

export type SelectionListener = (element: Element | null) => void;

export class ElementInspector {
  private readonly document: Document;
  private readonly overlay: OverlayService;
  private readonly root: Document | Element;
  private readonly onSelection: SelectionListener;
  private controller: AbortController | null = null;
  private hovered: Element | null = null;
  private selected: Element | null = null;
  private captureNext: ((element: Element) => void) | null = null;
  private pointerFrame: number | null = null;
  private pointerTarget: Element | null = null;

  constructor(
    document: Document,
    overlay: OverlayService,
    onSelection: SelectionListener,
    root: Document | Element = document,
  ) {
    this.document = document;
    this.overlay = overlay;
    this.root = root;
    this.onSelection = onSelection;
  }

  start(): void {
    if (this.controller) return;
    this.controller = new AbortController();
    const { signal } = this.controller;
    this.document.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: true, signal });
    this.document.addEventListener('mouseover', this.onPointerMove, { capture: true, passive: true, signal });
    this.document.addEventListener('click', this.onClick, { capture: true, signal });
    this.document.addEventListener('keydown', this.onKeyDown, { capture: true, signal });
    this.document.defaultView?.addEventListener('scroll', this.onViewportChange, { capture: true, passive: true, signal });
    this.document.defaultView?.addEventListener('resize', this.onViewportChange, { passive: true, signal });
  }

  select(element: Element | null): void {
    this.selected = element;
    if (element) this.overlay.show('selection', element, describeElement(element));
    else this.overlay.hide('selection');
    this.onSelection(element);
  }

  captureNextSelection(callback: (element: Element) => void): void {
    this.captureNext = callback;
    if (this.hovered) this.overlay.show('destination', this.hovered, 'Выбрать место');
  }

  cancelCapture(): void {
    this.captureNext = null;
    this.overlay.hide('destination');
  }

  destroy(): void {
    this.controller?.abort();
    this.controller = null;
    if (this.pointerFrame !== null) {
      this.document.defaultView?.cancelAnimationFrame?.(this.pointerFrame);
      this.document.defaultView?.clearTimeout(this.pointerFrame);
      this.pointerFrame = null;
    }
    this.pointerTarget = null;
    this.hovered = null;
    this.selected = null;
    this.cancelCapture();
    this.overlay.hide('hover');
    this.overlay.hide('selection');
  }

  private onPointerMove = (event: Event): void => {
    if (isEditorEvent(event)) return;
    const element = editableElement(event.target, this.root);
    this.pointerTarget = element;
    if (this.pointerFrame !== null) return;

    const view = this.document.defaultView;
    const update = () => {
      this.pointerFrame = null;
      this.hovered = this.pointerTarget;
      if (this.hovered) {
        this.overlay.show('hover', this.hovered, describeElement(this.hovered));
        if (this.captureNext) this.overlay.show('destination', this.hovered, 'Кликните для выбора');
      } else {
        this.overlay.hide('hover');
        if (this.captureNext) this.overlay.hide('destination');
      }
    };
    this.pointerFrame = view?.requestAnimationFrame
      ? view.requestAnimationFrame(update)
      : (view?.setTimeout(update, 0) ?? 0);
  };

  private onClick = (event: MouseEvent): void => {
    if (isEditorEvent(event)) return;
    const element = editableElement(event.target, this.root);
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (this.captureNext) {
      const callback = this.captureNext;
      this.cancelCapture();
      callback(element);
      return;
    }
    this.select(element);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (isEditorEvent(event)) return;
    if (this.captureNext) this.cancelCapture();
    else this.select(null);
  };

  private onViewportChange = (): void => this.overlay.refresh();
}

function editableElement(target: EventTarget | null, root: Document | Element): Element | null {
  const element = target instanceof Element ? target : null;
  if (!element || BLOCKED_TAGS.has(element.tagName)) return null;
  if (root.nodeType === 1 && root !== element && !root.contains(element)) return null;
  return element.closest('[data-lykar-editor-root]') ? null : element;
}

function isEditorEvent(event: Event): boolean {
  return event.composedPath().some(item => item instanceof Element && item.hasAttribute('data-lykar-editor-root'));
}

function describeElement(element: Element): string {
  const id = element.getAttribute('id');
  const className = Array.from(element.classList).slice(0, 2).join('.');
  return `${element.tagName.toLowerCase()}${id ? `#${id}` : ''}${className ? `.${className}` : ''}`;
}
