import { NodeWrapper } from '../node-wrapper';
import { DomOverlay } from './dom-overlay';

export type DropOrder = 'before' | 'after' | 'inside';
export type MovePatch = unknown; // replace with your concrete type

export interface DndConfig {
  excludeSelectors?: string[];
  allowInside?: (container: Element, dragged: Element) => boolean;
  onPatch?: (patch: MovePatch) => void;
  highlightTarget?: boolean;
}

const BLOCKLIST_TAGS = new Set(['SCRIPT','STYLE','LINK','META','TITLE','HEAD']);
const VOID_TAGS = new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR','IFRAME']);

export type OverlayState = {
  lineVisible: boolean;
  lineInside: boolean;
  lineLeft: number;
  lineTop: number;
  lineWidth: number;
  highlightVisible: boolean;
  highlightLeft: number;
  highlightTop: number;
  highlightWidth: number;
  highlightHeight: number;
};

// Simple pub/sub
type Subscriber = (s: OverlayState) => void;
class Emitter {
  private subs = new Set<Subscriber>();
  subscribe(fn: Subscriber) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(s: OverlayState) { for (const fn of this.subs) fn(s); }
}

// ---- Controller ----
export class DndController {
  private cfg: Required<DndConfig>;
  private dragging = false;
  private draggedNode: NodeWrapper | null = null;
  private draggedEl: Element | null = null;
  private overEl: Element | null = null;
  private order: DropOrder | null = null;
  private ac: AbortController | null = null;
  private rafId: number | null = null;
  private emitter = new Emitter();
  private isExcluded: (el: Element) => boolean;

  constructor(cfg: DndConfig) {
    this.cfg = {
      excludeSelectors: ['.dnd-overlay-root', '[data-lykar-ui-part="toolbar"]'],
      allowInside: (container, dragged) => (
        container !== dragged && !container.contains(dragged) && !VOID_TAGS.has(container.tagName)
      ),
      onPatch: () => {},
      highlightTarget: true,
      ...cfg,
    };
    const excludes = this.cfg.excludeSelectors;

    this.isExcluded = (el: Element) => excludes.some(sel => {
      console.log('isExcluded', sel, el.matches(sel));
      try { return el.matches(sel); } catch { return false; }
    });
  }

  subscribe(fn: Subscriber) { return this.emitter.subscribe(fn); }

  /** Привязать к drag-handle (в тулбаре над целевым элементом) */
  attachHandle(handleBtn: HTMLElement, source: NodeWrapper) {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // только ЛКМ
      this.beginDrag(source, e);
    };
    // Захватываем рано, чтобы не дать странице перехватить жест
    handleBtn.addEventListener('pointerdown', onDown, { capture: true });
  }

  beginDrag(source: NodeWrapper, e: PointerEvent) {
    if (this.dragging) this.cancelDrag();

    this.dragging = true;
    this.draggedNode = source;
    this.draggedEl = source.element;
    this.overEl = null;
    this.order = null;

    document.body.classList.add('dnd-dragging');

    this.ac = new AbortController();
    const { signal } = this.ac;

    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      if (this.rafId != null) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.handleMove(ev.clientX, ev.clientY);
      });
    };
    const onUp = (ev: PointerEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      this.finishDrag();
    };

    window.addEventListener('pointermove', onMove, { capture: true, passive: false, signal });
    window.addEventListener('pointerup', onUp, { capture: true, passive: false, signal });
    window.addEventListener('pointercancel', onUp, { capture: true, passive: false, signal });

    this.handleMove(e.clientX, e.clientY);
  }

  private isEditable(el: Element): boolean {
    if (!(el instanceof Element)) return false;

    if (this.isExcluded(el)) return false;

    const tag = el.tagName;

    if (BLOCKLIST_TAGS.has(tag)) return false;

    if (tag === 'HTML' || tag === 'BODY') return false; // не делаем таргетом

    return true;
  }

  private closestEditable(el: Element | null): Element | null {
    let cur: Element | null = el;
    while (cur && cur !== document.documentElement) {
      if (this.isExcluded(cur)) return null; // попали в наш UI — запрещаем
      if (this.isEditable(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  private handleMove(clientX: number, clientY: number) {
    if (!this.dragging || !this.draggedEl) return;

    const under = document.elementFromPoint(clientX, clientY) as Element | null;
    console.log("🚀 ~ DndController ~ handleMove ~ under:", under)
    const overEditable = under ? this.closestEditable(under) : null;

    if (!overEditable || overEditable === this.draggedEl || this.draggedEl.contains(overEditable)) {
      this.overEl = null;
      this.order = null;
      this.emitHidden();
      return;
    }

    const rect = overEditable.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insideBand = rect.top + rect.height * 0.33 <= clientY && clientY <= rect.bottom - rect.height * 0.33;

    let order: DropOrder;
    if (insideBand && this.cfg.allowInside(overEditable, this.draggedEl)) order = 'inside';
    else order = clientY < midY ? 'before' : 'after';

    this.overEl = overEditable;
    this.order = order;

    this.emitter.emit({
      lineVisible: true,
      lineInside: order === 'inside',
      lineLeft: rect.left + window.scrollX,
      lineTop: (order === 'before' ? rect.top : order === 'after' ? rect.bottom - 3 : rect.top + rect.height / 2 - 2) + window.scrollY,
      lineWidth: rect.width,
      highlightVisible: this.cfg.highlightTarget,
      highlightLeft: rect.left + window.scrollX,
      highlightTop: rect.top + window.scrollY,
      highlightWidth: rect.width,
      highlightHeight: rect.height,
    });
  }

  private finishDrag() {
    if (!this.dragging) return;
    this.dragging = false;

    this.ac?.abort();
    this.ac = null;

    document.body.classList.remove('dnd-dragging');

    if (this.draggedEl && this.overEl && this.order) {
      if (this.order === 'before') this.overEl.parentNode?.insertBefore(this.draggedEl, this.overEl);
      else if (this.order === 'after') this.overEl.parentNode?.insertBefore(this.draggedEl, this.overEl.nextSibling);
      else this.overEl.appendChild(this.draggedEl);

      // TODO: заменить createMovePatch на вашу реализацию
      const patch = { type: 'move', source: this.draggedEl, target: this.overEl, order: this.order } as MovePatch;
      this.cfg.onPatch(patch);
    }

    this.draggedEl = null;
    this.overEl = null;
    this.order = null;
    this.emitHidden();
  }

  cancelDrag() {
    if (!this.dragging) return;
    this.ac?.abort();
    this.ac = null;
    document.body.classList.remove('dnd-dragging');
    this.dragging = false;
    this.draggedEl = null;
    this.overEl = null;
    this.order = null;
    this.emitHidden();
  }

  private emitHidden() {
    this.emitter.emit({
      lineVisible: false,
      lineInside: false,
      lineLeft: 0,
      lineTop: 0,
      lineWidth: 0,
      highlightVisible: false,
      highlightLeft: 0,
      highlightTop: 0,
      highlightWidth: 0,
      highlightHeight: 0,
    });
  }
}

export function initDndHandler(cfg: DndConfig) {
  const fullCfg: Required<DndConfig> = {
    excludeSelectors: ['.dnd-overlay-root', '[data-lykar-ui-part="toolbar"]'],
    allowInside: (container, dragged) => (
      container !== dragged && !container.contains(dragged) && !VOID_TAGS.has(container.tagName)
    ),
    onPatch: () => {},
    highlightTarget: true,
    ...cfg,
  };

  const controller = new DndController(fullCfg);
  const overlay = new DomOverlay(controller, fullCfg);

  return {
    controller,
    destroy() {
      controller.cancelDrag();
      overlay.destroy();
    },
  } as const;
}
