type PanelGesture = {
  pointerId: number;
  x: number;
  y: number;
  currentX: number;
  currentY: number;
  left: number;
  top: number;
  dragging: boolean;
  placed: boolean;
  original: {left: string; top: string; right: string};
};

/** Move editor chrome in viewport coordinates without changing the host page. */
export class PanelDragController {
  private readonly controller: AbortController;
  private gesture: PanelGesture | null = null;
  private placed = false;
  private suppressedClick: {x: number; y: number; until: number} | null = null;

  constructor(
    private readonly document: Document,
    private readonly panel: HTMLElement,
    private readonly handle: HTMLElement,
    private readonly suspend: (active: boolean) => void,
  ) {
    const Controller = document.defaultView?.AbortController ?? AbortController;
    this.controller = new Controller();
    const {signal} = this.controller;
    handle.addEventListener('pointerdown', this.onPointerDown, {signal});
    handle.addEventListener('keydown', this.onHandleKeyDown, {signal});
    handle.addEventListener('dblclick', () => this.reset(), {signal});
    handle.addEventListener('lostpointercapture', event => {
      if (this.gesture?.pointerId === event.pointerId) this.cancel();
    }, {signal});
    document.addEventListener('pointermove', this.onPointerMove, {capture: true, passive: false, signal});
    document.addEventListener('pointerup', this.onPointerUp, {capture: true, signal});
    document.addEventListener('pointercancel', event => {
      if (this.gesture?.pointerId === event.pointerId) this.cancel();
    }, {capture: true, signal});
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.gesture) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
    }, {capture: true, signal});
    document.addEventListener('pointerdown', () => { this.suppressedClick = null; }, {capture: true, signal});
    document.addEventListener('click', event => {
      const click = this.suppressedClick;
      if (!click || Date.now() > click.until) return;
      if (!event.composedPath().includes(handle) && Math.hypot(event.clientX - click.x, event.clientY - click.y) > 2) return;
      this.suppressedClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, {capture: true, signal});
    document.defaultView?.addEventListener('resize', () => {
      this.cancel();
      this.reflow();
    }, {signal});
  }

  reflow(): void {
    if (!this.placed) return;
    const rect = this.panel.getBoundingClientRect();
    this.place(rect.left, rect.top);
  }

  destroy(): void {
    this.cancel();
    this.controller.abort();
    this.suppressedClick = null;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.isPrimary === false || this.gesture) return;
    const rect = this.panel.getBoundingClientRect();
    this.gesture = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      currentX: event.clientX, currentY: event.clientY,
      left: rect.left, top: rect.top, dragging: false, placed: this.placed,
      original: {left: this.panel.style.left, top: this.panel.style.top, right: this.panel.style.right},
    };
  };

  private onPointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.currentX = event.clientX;
    gesture.currentY = event.clientY;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.hypot(dx, dy) <= 4) return;
      gesture.dragging = true;
      this.panel.dataset.panelDragging = 'true';
      this.suspend(true);
      try { this.handle.setPointerCapture(event.pointerId); } catch { /* Document listeners also track the gesture. */ }
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.place(gesture.left + dx, gesture.top + dy);
  };

  private onPointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.dragging) {
      this.place(gesture.left + event.clientX - gesture.x, gesture.top + event.clientY - gesture.y);
      this.suppressedClick = {x: event.clientX, y: event.clientY, until: Date.now() + 500};
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    this.finish();
  };

  private onHandleKeyDown = (event: KeyboardEvent): void => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home') { this.reset(); return; }
    const step = event.shiftKey ? 40 : 10;
    const rect = this.panel.getBoundingClientRect();
    this.place(rect.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      rect.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
  };

  private place(left: number, top: number): void {
    const view = this.document.defaultView;
    const width = view?.innerWidth ?? this.document.documentElement.clientWidth;
    const height = view?.innerHeight ?? this.document.documentElement.clientHeight;
    const rect = this.panel.getBoundingClientRect();
    const tabs = this.panel.querySelector<HTMLElement>('.mode-tabs')?.getBoundingClientRect();
    const protrusion = tabs?.width ? Math.max(0, rect.left - tabs.left) : 0;
    const margin = width <= 520 ? 6 : 12;
    const minimumLeft = protrusion + margin;
    const maximumLeft = Math.max(minimumLeft, width - rect.width - margin);
    const maximumTop = Math.max(margin, height - rect.height - margin);
    this.panel.style.left = `${Math.min(maximumLeft, Math.max(minimumLeft, left))}px`;
    this.panel.style.top = `${Math.min(maximumTop, Math.max(margin, top))}px`;
    this.panel.style.right = 'auto';
    this.placed = true;
  }

  private reset(): void {
    this.cancel();
    this.placed = false;
    this.panel.style.removeProperty('left');
    this.panel.style.removeProperty('top');
    this.panel.style.removeProperty('right');
  }

  private cancel(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    if (gesture.dragging) {
      this.suppressedClick = {x: gesture.currentX, y: gesture.currentY, until: Date.now() + 500};
      Object.assign(this.panel.style, gesture.original);
      this.placed = gesture.placed;
    }
    this.finish();
  }

  private finish(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    delete this.panel.dataset.panelDragging;
    try { this.handle.releasePointerCapture(gesture.pointerId); } catch { /* Pointer cancellation may release it first. */ }
    if (gesture.dragging) this.suspend(false);
  }
}
