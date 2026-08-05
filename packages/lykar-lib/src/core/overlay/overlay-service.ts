/*
 * Lykar OverlayService — единый overlay-root с менеджментом слоёв (layers) и батчингом в RAF.
 * Сервис отдаёт лёгкие объекты-слои с примитивами отрисовки (линии, прямоугольники, бейджи, HTML-хост).
 * Контроллеры (DnD/Toolbar/Mask/etc.) получают OverlayService через DI и рисуют в свои слои.
 */

export type ViewportRect = { x: number; y: number; w: number; h: number };
export type LineSpec = { x: number; y: number; w: number; h: number; cls?: string };
export type BadgeSpec = { x: number; y: number; text: string; cls?: string };

export interface OverlayLayer {
  /** Сделать слой видимым/невидимым (display). */
  setVisible(v: boolean): void;
  /** Разрешить интерактивность на слое (pointer-events: auto). */
  setPointerEventsAuto(v: boolean): void;
  /** Очистить слой (скрыть все элементы/сбросить HTML). */
  clear(): void;
  /** Набросать/обновить линии. */
  drawLine(x: number, y: number, w: number, h: number, cls?: string): void;
  /** Набросать/обновить прямоугольник. */
  drawRect(r: ViewportRect, cls?: string): void;
  /** Набросать/обновить бейдж. */
  drawBadge(x: number, y: number, text: string, cls?: string): void;
  /** Обновить "HTML-хост" слоя (для сложного UI, например тулбар/поповер). */
  setHTML(html: string): void;
  /** Встроить произвольный элемент (например, ghost при insert). */
  mount(el: HTMLElement | null): void;
  /** Внутренний: применить скрытие неиспользуемых нод, сбросить счётчики кадра. */
  _flushFrame(): void; // не использовать снаружи
}

export interface OverlayService {
  /** Получить слой по ID. Создаётся лениво и кэшируется. */
  getLayer(id: string, zIndex?: number): OverlayLayer;
  /** Начать батч (опционально). */
  beginFrame(): void;
  /** Зафиксировать батч: один RAF на все изменения. */
  commitFrame(): void;
  /** Уничтожить overlay и все слои. */
  destroy(): void;
}

export type OverlayOptions = {
  /** Идентификатор корня (для дебага). */
  rootId?: string;
  /** Использовать ShadowRoot для изоляции стилей. */
  shadowRoot?: boolean;
  /** Автоматически скрывать root, если нет видимых слоёв. */
  autoHideRoot?: boolean;
  /** Базовый z-index у root. */
  zIndexBase?: number;
  /** Префикс классов (на случай инъекции стилей хоста). */
  classPrefix?: string;
};

const DEFAULTS: Required<OverlayOptions> = {
  rootId: 'lykar-overlay-root',
  shadowRoot: true,
  autoHideRoot: true,
  zIndexBase: 2147483600,
  classPrefix: 'ly-o',
};

// ===================== Implementation =====================

class OverlayLayerImpl implements OverlayLayer {
  private container: HTMLDivElement; // слой
  private poolRoot: HTMLDivElement;  // в него кладём примитивы (line/rect/badge)
  private htmlRoot: HTMLDivElement;  // сюда кладём HTML-хост/монтируемые элементы

  private linePool: HTMLDivElement[] = [];
  private rectPool: HTMLDivElement[] = [];
  private badgePool: HTMLDivElement[] = [];
  private mountEl: HTMLElement | null = null;

  private usedLines = 0;
  private usedRects = 0;
  private usedBadges = 0;
  private visible = false;
  private onVisChange: (v: boolean) => void;

  constructor(parent: HTMLElement, zIndex: number, prefix: string, onVisChange: (v: boolean) => void) {
    this.onVisChange = onVisChange;
    const doc = parent.ownerDocument;

    this.container = doc.createElement('div');
    this.container.className = `${prefix}-layer`;
    // Слой позиционирован относительно root (который fixed на вьюпорте)
    Object.assign(this.container.style, {
      position: 'absolute',
      left: '0', top: '0', width: '100%', height: '100%',
      zIndex: String(zIndex),
      pointerEvents: 'none', // по умолчанию не перехватываем события
      display: 'none',
      contain: 'layout style size',
    } as CSSStyleDeclaration);

    this.poolRoot = doc.createElement('div');
    this.poolRoot.className = `${prefix}-pool`;
    this.htmlRoot = doc.createElement('div');
    this.htmlRoot.className = `${prefix}-html`;

    this.container.appendChild(this.poolRoot);
    this.container.appendChild(this.htmlRoot);
    parent.appendChild(this.container);
  }

  setVisible(v: boolean) {
    if (this.visible === v) return;
    this.visible = v;
    this.container.style.display = v ? 'block' : 'none';
    this.onVisChange(v);
  }

  setPointerEventsAuto(v: boolean) {
    this.container.style.pointerEvents = v ? 'auto' : 'none';
  }

  clear() {
    // скрываем все из пула (оставляя DOM-узлы для переиспользования)
    for (let i = 0; i < this.linePool.length; i++) this.linePool[i].style.display = 'none';
    for (let i = 0; i < this.rectPool.length; i++) this.rectPool[i].style.display = 'none';
    for (let i = 0; i < this.badgePool.length; i++) this.badgePool[i].style.display = 'none';
    this.usedLines = this.usedRects = this.usedBadges = 0;
    // html-хост
    this.htmlRoot.innerHTML = '';
    // монтируемый элемент
    if (this.mountEl && this.mountEl.parentElement === this.htmlRoot) {
      this.htmlRoot.removeChild(this.mountEl);
    }
    this.mountEl = null;
  }

  private ensureLine(): HTMLDivElement {
    const i = this.usedLines++;
    let el = this.linePool[i];
    if (!el) {
      el = this.container.ownerDocument.createElement('div');
      el.className = 'ly-o-line';
      Object.assign(el.style, {
        position: 'absolute',
        left: '0', top: '0',
      } as CSSStyleDeclaration);
      this.poolRoot.appendChild(el);
      this.linePool[i] = el;
    }
    el.style.display = 'block';
    return el;
  }

  private ensureRect(): HTMLDivElement {
    const i = this.usedRects++;
    let el = this.rectPool[i];
    if (!el) {
      el = this.container.ownerDocument.createElement('div');
      el.className = 'ly-o-rect';
      Object.assign(el.style, {
        position: 'absolute',
        left: '0', top: '0',
      } as CSSStyleDeclaration);
      this.poolRoot.appendChild(el);
      this.rectPool[i] = el;
    }
    el.style.display = 'block';
    return el;
  }

  private ensureBadge(): HTMLDivElement {
    const i = this.usedBadges++;
    let el = this.badgePool[i];
    if (!el) {
      el = this.container.ownerDocument.createElement('div');
      el.className = 'ly-o-badge';
      Object.assign(el.style, {
        position: 'absolute',
        left: '0', top: '0',
        whiteSpace: 'nowrap',
      } as CSSStyleDeclaration);
      this.poolRoot.appendChild(el);
      this.badgePool[i] = el;
    }
    el.style.display = 'block';
    return el;
  }

  drawLine(x: number, y: number, w: number, h: number, cls?: string) {
    const el = this.ensureLine();
    el.className = `ly-o-line${cls ? ' ' + cls : ''}`;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }

  drawRect(r: ViewportRect, cls?: string) {
    const el = this.ensureRect();
    el.className = `ly-o-rect${cls ? ' ' + cls : ''}`;
    el.style.transform = `translate(${r.x}px, ${r.y}px)`;
    el.style.width = `${r.w}px`;
    el.style.height = `${r.h}px`;
  }

  drawBadge(x: number, y: number, text: string, cls?: string) {
    const el = this.ensureBadge();
    el.className = `ly-o-badge${cls ? ' ' + cls : ''}`;
    el.textContent = text;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  setHTML(html: string) {
    this.htmlRoot.innerHTML = html;
  }

  mount(el: HTMLElement | null) {
    if (this.mountEl && this.mountEl.parentElement === this.htmlRoot) {
      this.htmlRoot.removeChild(this.mountEl);
    }
    this.mountEl = el;
    if (el) this.htmlRoot.appendChild(el);
  }

  _flushFrame() {
    // спрячем неиспользованные ноды (если кто-то вызывал draw* меньше раз в этом кадре)
    for (let i = this.usedLines; i < this.linePool.length; i++) this.linePool[i].style.display = 'none';
    for (let i = this.usedRects; i < this.rectPool.length; i++) this.rectPool[i].style.display = 'none';
    for (let i = this.usedBadges; i < this.badgePool.length; i++) this.badgePool[i].style.display = 'none';
    this.usedLines = this.usedRects = this.usedBadges = 0;
  }
}

class OverlayServiceImpl implements OverlayService {
  private options: Required<OverlayOptions>;
  private rootHost!: HTMLDivElement;      // узел в document.body
  private rootDoc!: Document | ShadowRoot; // место, куда добавляем стили/DOM слоёв
  private rootContainer!: HTMLDivElement; // контейнер слоёв (fixed 100%)
  private styleEl!: HTMLStyleElement;

  private layers = new Map<string, OverlayLayerImpl>();
  private visibleLayers = 0;
  private inFrame = 0;
  private rafId: number | null = null;

  constructor(opts?: OverlayOptions) {
    this.options = { ...DEFAULTS, ...(opts || {}) };
    this.initRoot();
    this.injectStyles();
  }

  private initRoot() {
    const doc = document;
    const host = doc.createElement('div');
    host.id = this.options.rootId;
    Object.assign(host.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      zIndex: String(this.options.zIndexBase),
    } as CSSStyleDeclaration);

    doc.body.appendChild(host);

    let mount: Document | ShadowRoot = doc;
    if (this.options.shadowRoot && host.attachShadow) {
      mount = host.attachShadow({ mode: 'open' });
    }

    const container = doc.createElement('div');
    container.className = `${this.options.classPrefix}-root`;
    Object.assign(container.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      pointerEvents: 'none', // слои сами включают интерактивность при необходимости
    } as CSSStyleDeclaration);

    mount.appendChild(container);

    this.rootHost = host;
    this.rootDoc = mount;
    this.rootContainer = container;
  }

  private injectStyles() {
    const css = `
      .${this.options.classPrefix}-root { contain: layout style size; }
      .${this.options.classPrefix}-layer { contain: layout style size; }
      .ly-o-line { background: rgba(80,180,255,0.9); box-shadow: 0 0 0 1px rgba(0,0,0,0.25); border-radius: 2px; }
      .ly-o-rect { outline: 2px solid rgba(95,240,190,0.55); background: rgba(95,240,190,0.08); border-radius: 4px; }
      .ly-o-badge { font: 12px/18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.75); color: white; }
      /* модификаторы под DnD */
      .ly-o-line.inside { background: rgba(95,240,190,0.95); height: 4px !important; }
      .ly-o-line.before, .ly-o-line.after { height: 3px !important; }
    `;

    const styleEl = this.rootHost.ownerDocument.createElement('style');
    styleEl.textContent = css;

    this.rootDoc.appendChild(styleEl);
    this.styleEl = styleEl;
  }

  getLayer(id: string, zIndex: number = 0): OverlayLayer {
    let layer = this.layers.get(id);
    if (!layer) {
      layer = new OverlayLayerImpl(this.rootContainer, zIndex, this.options.classPrefix, (v) => this.onLayerVisibilityChange(v));
      this.layers.set(id, layer);
    }
    return layer;
  }

  beginFrame(): void {
    this.inFrame++;
  }

  commitFrame(): void {
    // Если уже запланирован RAF — ничего не делаем
    if (this.rafId != null) return;
    // Если батч открыт — дождёмся его окончания (вызовут commit снова)
    if (this.inFrame > 0) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.flushAllLayers();
    });
  }

  private flushAllLayers() {
    // Спрячем неиспользуемые ноды в слоях
    for (const layer of this.layers.values()) layer._flushFrame();
    // Автоскрытие root-а, если ничего не видно
    if (this.options.autoHideRoot) this.updateRootVisibility();
  }

  private onLayerVisibilityChange(v: boolean) {
    this.visibleLayers += v ? 1 : -1;
    if (this.options.autoHideRoot) this.updateRootVisibility();
  }

  private updateRootVisibility() {
    const visible = this.visibleLayers > 0;
    this.rootHost.style.display = visible ? 'block' : 'none';
  }

  destroy(): void {
    // Удаляем весь overlay
    this.layers.clear();
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    if (this.rootHost && this.rootHost.parentElement) {
      this.rootHost.parentElement.removeChild(this.rootHost);
    }
  }
}

export function createOverlayService(options?: OverlayOptions): OverlayService {
  return new OverlayServiceImpl(options);
}

/* =====================
 *  DnD-friendly helpers
 *  (необязательные утилиты; можно вызывать drawLine/drawRect напрямую)
 * ===================== */

export type DropOrder = 'before' | 'after' | 'inside';

export function dndDrawDropIndicator(layer: OverlayLayer, order: DropOrder, rect: ViewportRect) {
  if (order === 'inside') {
    const y = rect.y + Math.round(rect.h / 2) - 2;
    layer.drawLine(rect.x, y, rect.w, 4, 'inside');
  } else if (order === 'before') {
    layer.drawLine(rect.x, rect.y, rect.w, 3, 'before');
  } else {
    layer.drawLine(rect.x, rect.y + rect.h - 3, rect.w, 3, 'after');
  }
}

export function dndDrawHighlight(layer: OverlayLayer, rect: ViewportRect) {
  layer.drawRect(rect, 'dnd-highlight');
}
