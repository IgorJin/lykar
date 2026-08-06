export type OverlayLayerName = 'hover' | 'selection' | 'destination' | 'proposal';

type LayerStyle = {
  color: string;
  background: string;
  zIndex: number;
};

const LAYER_STYLES: Record<OverlayLayerName, LayerStyle> = {
  hover: { color: '#60a5fa', background: 'rgba(96, 165, 250, .10)', zIndex: 1 },
  selection: { color: '#8b5cf6', background: 'rgba(139, 92, 246, .12)', zIndex: 2 },
  destination: { color: '#10b981', background: 'rgba(16, 185, 129, .14)', zIndex: 3 },
  proposal: { color: '#f59e0b', background: 'rgba(245, 158, 11, .12)', zIndex: 4 },
};

type LayerState = {
  element: Element | null;
  label: string;
  box: HTMLDivElement;
  badge: HTMLDivElement;
};

export class OverlayService {
  readonly host: HTMLDivElement;

  private readonly document: Document;
  private readonly layers = new Map<OverlayLayerName, LayerState>();
  private frame: number | null = null;

  constructor(document: Document) {
    this.document = document;
    this.host = document.createElement('div');
    this.host.setAttribute('data-lykar-editor-root', 'overlay');
    Object.assign(this.host.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483600',
      pointerEvents: 'none',
    });

    const root = this.host.attachShadow?.({ mode: 'open' }) ?? this.host;
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .box { position: fixed; display: none; box-sizing: border-box; pointer-events: none; border: 2px solid; border-radius: 4px; }
      .badge { position: fixed; display: none; padding: 3px 7px; border-radius: 4px; color: white; font: 600 11px/16px ui-sans-serif, system-ui, sans-serif; pointer-events: none; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;
    root.appendChild(style);

    for (const name of Object.keys(LAYER_STYLES) as OverlayLayerName[]) {
      const layerStyle = LAYER_STYLES[name];
      const box = document.createElement('div');
      box.className = 'box';
      box.dataset.layer = name;
      box.style.borderColor = layerStyle.color;
      box.style.background = layerStyle.background;
      box.style.zIndex = String(layerStyle.zIndex);

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.dataset.layer = name;
      badge.style.background = layerStyle.color;
      badge.style.zIndex = String(layerStyle.zIndex + 10);
      root.append(box, badge);
      this.layers.set(name, { element: null, label: '', box, badge });
    }

    document.body.appendChild(this.host);
  }

  show(name: OverlayLayerName, element: Element, label = element.tagName.toLowerCase()): void {
    const layer = this.layers.get(name)!;
    layer.element = element;
    layer.label = label;
    this.scheduleRender();
  }

  hide(name: OverlayLayerName): void {
    const layer = this.layers.get(name)!;
    layer.element = null;
    layer.box.style.display = 'none';
    layer.badge.style.display = 'none';
  }

  refresh(): void {
    this.scheduleRender();
  }

  destroy(): void {
    if (this.frame !== null) this.document.defaultView?.cancelAnimationFrame?.(this.frame);
    this.host.remove();
    this.layers.clear();
  }

  private scheduleRender(): void {
    if (this.frame !== null) return;
    const view = this.document.defaultView;
    const render = () => {
      this.frame = null;
      this.render();
    };
    this.frame = view?.requestAnimationFrame
      ? view.requestAnimationFrame(render)
      : (view?.setTimeout(render, 0) ?? 0);
  }

  private render(): void {
    for (const layer of this.layers.values()) {
      const element = layer.element;
      if (!element?.isConnected) {
        layer.box.style.display = 'none';
        layer.badge.style.display = 'none';
        continue;
      }

      const rect = element.getBoundingClientRect();
      Object.assign(layer.box.style, {
        display: 'block',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      layer.badge.textContent = layer.label;
      Object.assign(layer.badge.style, {
        display: 'block',
        left: `${Math.max(0, rect.left)}px`,
        top: `${Math.max(0, rect.top - 22)}px`,
      });
    }
  }
}
