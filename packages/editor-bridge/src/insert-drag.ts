import type { InsertPosition } from '@lykar/protocol';

export type InsertDragCallbacks = {
  resolveTarget: (x: number, y: number) => Element | null;
  highlight: (target: Element | null, position: InsertPosition) => void;
  suspend: (active: boolean) => void;
  drop: (template: string, target: Element, position: InsertPosition) => void;
  choose: (template: string) => void;
  getPosition: () => InsertPosition;
};

type InsertGesture = {
  button: HTMLButtonElement;
  template: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
  ghost: HTMLDivElement | null;
};

/** Pointer dragging and click/keyboard placement share the same template buttons. */
export class InsertDragController {
  private readonly controller: AbortController;
  private enabled = false;
  private destroyed = false;
  private gesture: InsertGesture | null = null;
  private suppressedClick: {button: HTMLButtonElement; x: number; y: number; until: number} | null = null;

  constructor(
    private readonly document: Document,
    private readonly root: ParentNode,
    private readonly callbacks: InsertDragCallbacks,
  ) {
    // Use the document's realm so native event targets accept this signal in
    // embedded documents and DOM test environments alike.
    const Controller = document.defaultView?.AbortController ?? AbortController;
    this.controller = new Controller();
    const {signal} = this.controller;
    const buttons = root.querySelectorAll<HTMLButtonElement>('button[data-insert-template]');
    for (const button of buttons) {
      button.draggable = false;
      button.addEventListener('pointerdown', event => this.onPointerDown(event, button), {signal});
      button.addEventListener('click', event => {
        if (this.suppressClick(event)) return;
        if (!this.enabled || this.destroyed || button.disabled) return;
        const template = button.dataset.insertTemplate;
        if (!template) return;
        event.preventDefault();
        event.stopPropagation();
        this.callbacks.choose(template);
      }, {signal});
      button.addEventListener('lostpointercapture', event => {
        if (this.gesture?.pointerId === event.pointerId) this.cancel();
      }, {signal});
    }
    document.addEventListener('pointerdown', () => { this.suppressedClick = null; }, {capture: true, signal});
    document.addEventListener('pointermove', this.onPointerMove, {capture: true, passive: false, signal});
    document.addEventListener('pointerup', this.onPointerUp, {capture: true, passive: false, signal});
    document.addEventListener('pointercancel', this.onPointerCancel, {capture: true, signal});
    document.addEventListener('click', this.onDocumentClick, {capture: true, signal});
    document.addEventListener('keydown', this.onKeyDown, {capture: true, signal});
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && !this.destroyed;
    if (!this.enabled) this.cancel();
  }

  cancel(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.rememberClick(gesture);
    this.finishGesture();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.enabled = false;
    this.cancel();
    this.destroyed = true;
    this.controller.abort();
    this.suppressedClick = null;
  }

  private onPointerDown(event: PointerEvent, button: HTMLButtonElement): void {
    if (!this.enabled || this.destroyed || button.disabled || event.button !== 0 || event.isPrimary === false) return;
    const template = button.dataset.insertTemplate;
    if (!template || this.gesture) return;
    this.suppressedClick = null;
    this.gesture = {
      button,
      template,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      ghost: null,
    };
  }

  private onPointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (!gesture.dragging) {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) <= 6) return;
      gesture.dragging = true;
      this.callbacks.suspend(true);
      try { gesture.button.setPointerCapture?.(gesture.pointerId); } catch { /* Document capture remains available. */ }
      const ghost = this.document.createElement('div');
      ghost.className = 'insert-drag-ghost';
      ghost.setAttribute('data-drag-ghost', '');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = gesture.button.textContent?.trim() || gesture.template;
      ghost.style.position = 'fixed';
      ghost.style.pointerEvents = 'none';
      gesture.ghost = ghost;
      this.root.append(ghost);
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (gesture.ghost) {
      gesture.ghost.style.left = `${event.clientX + 14}px`;
      gesture.ghost.style.top = `${event.clientY + 14}px`;
    }
    this.callbacks.highlight(this.callbacks.resolveTarget(event.clientX, event.clientY), this.callbacks.getPosition());
  };

  private onPointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (!gesture.dragging) {
      this.finishGesture();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.rememberClick(gesture);
    const position = this.callbacks.getPosition();
    const target = this.callbacks.resolveTarget(event.clientX, event.clientY);
    this.finishGesture();
    if (target) this.callbacks.drop(gesture.template, target, position);
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.gesture?.pointerId !== event.pointerId) return;
    event.stopImmediatePropagation();
    this.cancel();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    // A fresh keyboard activation must retain the accessible click fallback.
    this.suppressedClick = null;
    if (event.key !== 'Escape' || !this.gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancel();
  };

  private onDocumentClick = (event: MouseEvent): void => { this.suppressClick(event); };

  private suppressClick(event: MouseEvent): boolean {
    const suppressed = this.suppressedClick;
    if (!suppressed || Date.now() > suppressed.until) return false;
    const fromButton = event.composedPath().includes(suppressed.button);
    const fromDrop = Math.hypot(event.clientX - suppressed.x, event.clientY - suppressed.y) <= 2;
    if (!fromButton && !fromDrop) return false;
    this.suppressedClick = null;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
  }

  private rememberClick(gesture: InsertGesture): void {
    this.suppressedClick = {button: gesture.button, x: gesture.x, y: gesture.y, until: Date.now() + 500};
  }

  private finishGesture(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    gesture.ghost?.remove();
    try { gesture.button.releasePointerCapture?.(gesture.pointerId); } catch { /* Capture may already have ended. */ }
    if (gesture.dragging) {
      this.callbacks.highlight(null, this.callbacks.getPosition());
      this.callbacks.suspend(false);
    }
  }
}
