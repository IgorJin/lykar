import { NodeWrapper } from '@/core/node-wrapper';
import { DomOverlay } from '@/core/overlay'

export type DropOrder = 'before' | 'after' | 'inside';
export type Patch = any; // replace with your concrete type TODO

// ---- Config ----
export interface DndConfig {
  /** Селекторы, которые надо исключить (корень твоего UI, оверлеи и т.п.) */
  excludeSelectors?: string[];
  /** Разрешить drop "inside" */
  allowInside?: (container: Element, dragged: Element) => boolean;
  /** Куда отдавать патч (хранилище патчей) */
  onPatch?: (patch: Patch) => void;
  /** Подсветка прямоугольником цели */
  highlightTarget?: boolean;
  /** Автоскролл во время DnD */
  autoScroll?: boolean;
  /** Зона срабатывания у краёв окна, px */
  autoScrollViewportMargin?: number;
  /** Зона срабатывания у краёв скролл-контейнера, px */
  autoScrollContainerMargin?: number;
  /** Максимальная скорость автоскролла (px/кадр при ~60fps) */
  autoScrollMaxSpeed?: number;
}

// ---- Internals ----
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

// ---- Utilities ----
function isScrollable(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const canY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight;
  const canX = (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') && el.scrollWidth > el.clientWidth;
  return canY || canX;
}

function closestScrollParent(el: Element | null): HTMLElement | null {
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    if (isScrollable(cur)) return cur as HTMLElement;
    cur = cur.parentElement;
  }
  return null;
}

// ---- AutoScrollService ----
class AutoScrollService {
  private viewportMargin: number;
  private containerMargin: number;
  private maxSpeed: number; // px per frame (target ~60fps)
  private rafId: number | null = null;
  private active = false;
  private pointerX = 0;
  private pointerY = 0;
  private container: HTMLElement | null = null;
  private onTickRecompute: (() => void) | null = null;

  constructor(opts: { viewportMargin: number; containerMargin: number; maxSpeed: number; onTick?: () => void; }) {
    this.viewportMargin = opts.viewportMargin;
    this.containerMargin = opts.containerMargin;
    this.maxSpeed = Math.max(1, opts.maxSpeed);
    this.onTickRecompute = opts.onTick ?? null;
  }

  setPointer(x: number, y: number) {
    this.pointerX = x; this.pointerY = y;
    // Перезапускаем цикл, если стоим
    this.ensureTick();
  }
  setContainer(el: HTMLElement | null) {
    this.container = el;
    // На смене контейнера тоже пробуем перезапустить
    this.ensureTick();
  }
  start() { this.active = true; this.ensureTick(); }
  stop() { this.active = false; if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; } }

  private ensureTick() {
    if (!this.active || this.rafId != null) return;
    this.rafId = requestAnimationFrame(() => { this.rafId = null; this.tick(); });
  }

  private tick() {
    if (!this.active) return;

    // Compute velocities
    const v = this.computeViewportVelocity();
    const c = this.computeContainerVelocity();

    // Apply scrolls
    if (v.dx || v.dy) window.scrollBy(v.dx, v.dy);
    if (c.dx || c.dy) this.container!.scrollBy(c.dx, c.dy);

    // Recompute overlays/target based on scroll
    if ((v.dx || v.dy || c.dx || c.dy) && this.onTickRecompute) {
      this.onTickRecompute();
    }

    // Continue loop while we still need to scroll; иначе подождём следующего движения/смены контейнера
    if ((v.dx || v.dy || c.dx || c.dy)) {
      this.ensureTick();
    }
  }

  private computeViewportVelocity(): { dx: number; dy: number } {
    const m = this.viewportMargin;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let dx = 0, dy = 0;

    // Vertical
    if (this.pointerY < m) dy = -this.speedFromEdge(this.pointerY, m);
    else if (this.pointerY > vh - m) dy = this.speedFromEdge(vh - this.pointerY, m);

    // Horizontal
    if (this.pointerX < m) dx = -this.speedFromEdge(this.pointerX, m);
    else if (this.pointerX > vw - m) dx = this.speedFromEdge(vw - this.pointerX, m);

    // Clamp scrolling element availability
    const se = document.scrollingElement as HTMLElement | null;
    if (!se) return { dx: 0, dy: 0 };

    // Prevent useless scroll when already at edges
    if (dy < 0 && se.scrollTop <= 0) dy = 0;
    if (dy > 0 && se.scrollTop + se.clientHeight >= se.scrollHeight) dy = 0;
    if (dx < 0 && se.scrollLeft <= 0) dx = 0;
    if (dx > 0 && se.scrollLeft + se.clientWidth >= se.scrollWidth) dx = 0;

    return { dx, dy };
  }

  private computeContainerVelocity(): { dx: number; dy: number } {
    const el = this.container;
    if (!el) return { dx: 0, dy: 0 };
    const rect = el.getBoundingClientRect();
    const m = this.containerMargin;
    let dx = 0, dy = 0;

    const insideX = this.pointerX >= rect.left && this.pointerX <= rect.right;
    const insideY = this.pointerY >= rect.top && this.pointerY <= rect.bottom;

    if (insideY) {
      const distTop = this.pointerY - rect.top;
      const distBot = rect.bottom - this.pointerY;
      if (distTop < m) dy = -this.speedFromEdge(distTop, m);
      else if (distBot < m) dy = this.speedFromEdge(distBot, m);
    }

    if (insideX) {
      const distLeft = this.pointerX - rect.left;
      const distRight = rect.right - this.pointerX;
      if (distLeft < m) dx = -this.speedFromEdge(distLeft, m);
      else if (distRight < m) dx = this.speedFromEdge(distRight, m);
    }

    // Clamp by scroll ranges
    if (dy < 0 && el.scrollTop <= 0) dy = 0;
    if (dy > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight) dy = 0;
    if (dx < 0 && el.scrollLeft <= 0) dx = 0;
    if (dx > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth) dx = 0;

    return { dx, dy };
  }

  private speedFromEdge(distance: number, margin: number): number {
    // Чем ближе к краю — тем быстрее; 0..1 → 0..maxSpeed (квадратичная кривая для мягкости)
    const t = Math.max(0, Math.min(1, 1 - distance / margin));
    return Math.round(this.maxSpeed * t * t);
  }
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
  private rafPending = false;
  private lastX = 0;
  private lastY = 0;
  private emitter = new Emitter();
  private isExcluded: (el: Element) => boolean;
  private handleMap = new Map<HTMLElement, (e: PointerEvent) => void>();
  private autoScroll: AutoScrollService | null = null;

  constructor(cfg: DndConfig) {
    this.cfg = {
      excludeSelectors: ['.dnd-overlay-root', '[data-lykar-ui-part="toolbar"]'],
      allowInside: (container, dragged) => (
        container !== dragged && !container.contains(dragged) && !VOID_TAGS.has(container.tagName)
      ),
      onPatch: () => {},
      highlightTarget: true,
      autoScroll: true,
      autoScrollViewportMargin: 32,
      autoScrollContainerMargin: 24,
      autoScrollMaxSpeed: 18, // px/frame ~ 1000px/s @ 60fps
      ...cfg,
    };
    const excludes = this.cfg.excludeSelectors;
    // ВАЖНО: проверяем не только сам элемент, но и его предков через closest()
    this.isExcluded = (el: Element) => excludes.some(sel => {
      try { return !!(el.matches(sel) || el.closest(sel)); } catch { return false; }
    });

    if (this.cfg.autoScroll) {
      this.autoScroll = new AutoScrollService({
        viewportMargin: this.cfg.autoScrollViewportMargin,
        containerMargin: this.cfg.autoScrollContainerMargin,
        maxSpeed: this.cfg.autoScrollMaxSpeed,
        onTick: () => {
          // пересчитываем таргет/оверлей на каждом тикe автоскролла
          this.handleMove(this.lastX, this.lastY);
        }
      });
    }
  }

  subscribe(fn: Subscriber) { return this.emitter.subscribe(fn); }

  /** Привязать к drag-handle (в тулбаре над целевым элементом) */
  attachHandle(handleBtn: HTMLElement, source: NodeWrapper, onCommit? : (e: PointerEvent) => void) {
    this.detachHandle(handleBtn);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // только ЛКМ
      this.beginDrag(source, e);
    };

    if (onCommit) this.cfg.onPatch = onCommit;
    
    // Захватываем рано, чтобы не дать странице перехватить жест
    handleBtn.addEventListener('pointerdown', onDown, { capture: true });
    this.handleMap.set(handleBtn, onDown);
  }

  attachInsertHandle(handleEl: HTMLElement, block: any, onCommit?: (e: any /* InsertCommit */) => void) { };

  detachHandle(handleBtn: HTMLElement) {
    const fn = this.handleMap.get(handleBtn);
    if (fn) {
      handleBtn.removeEventListener('pointerdown', fn, { capture: true } as any);
      this.handleMap.delete(handleBtn);
    }
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
      // Используем coalesced события, берём последний (самый свежий) по координатам
      const events = (ev as any).getCoalescedEvents?.() as PointerEvent[] | undefined;
      const last = events && events.length ? events[events.length - 1] : ev;
      this.lastX = last.clientX; this.lastY = last.clientY;
      this.autoScroll?.setPointer(this.lastX, this.lastY);
      ev.preventDefault(); ev.stopPropagation();
      if (!this.rafPending) {
        this.rafPending = true;
        this.rafId = requestAnimationFrame(() => {
          this.rafPending = false;
          this.handleMove(this.lastX, this.lastY);
        });
      }
    };
    const onUp = (ev: PointerEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      this.finishDrag();
    };

    window.addEventListener('pointermove', onMove, { capture: true, passive: false, signal });
    window.addEventListener('pointerup', onUp, { capture: true, passive: false, signal });
    window.addEventListener('pointercancel', onUp, { capture: true, passive: false, signal });

    // Инициализируем первыми координатами
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.autoScroll?.setPointer(this.lastX, this.lastY);
    this.autoScroll?.start();
    this.handleMove(this.lastX, this.lastY);
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
    const overEditable = under ? this.closestEditable(under) : null;

    // Обновим кандидат для авто-скролла (ближайший скролл-контейнер под курсором)
    const scrollParent = closestScrollParent(overEditable);
    this.autoScroll?.setContainer(scrollParent);

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

  private endDrag(commit: boolean = false) {
    if (!this.dragging) return;
    this.ac?.abort();
    this.ac = null;
    document.body.classList.remove('dnd-dragging');

    if (commit && this.draggedEl && this.overEl && this.order) {
      if (this.order === 'before') this.overEl.parentNode?.insertBefore(this.draggedEl, this.overEl);
      else if (this.order === 'after') this.overEl.parentNode?.insertBefore(this.draggedEl, this.overEl.nextSibling);
      else this.overEl.appendChild(this.draggedEl);

      // TODO: заменить createMovePatch на вашу реализацию
      const patch = { type: 'move', source: this.draggedEl, target: this.overEl, order: this.order } as Patch;
      this.cfg.onPatch(patch);
    }

    this.dragging = false;
    this.draggedEl = null;
    this.overEl = null;
    this.order = null;
    this.emitHidden();
    this.autoScroll?.stop();
  }

  private finishDrag() { this.endDrag(true); }
  cancelDrag() { this.endDrag(); }

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
    autoScroll: true,
    autoScrollViewportMargin: 32,
    autoScrollContainerMargin: 24,
    autoScrollMaxSpeed: 18,
    ...cfg,
  };

  const controller = new DndController(fullCfg);
  const overlay = new DomOverlay(controller, fullCfg);

  console.log('initDndHandler');
  return {
    controller,
    destroy() {
      controller.cancelDrag();
      overlay.destroy();
    },
  } as const;
}

