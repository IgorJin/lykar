import { DndConfig, DndController, OverlayState } from '@/core/drag-and-drop';

export class DomOverlay {
  root: HTMLDivElement;
  line: HTMLDivElement;
  highlight: HTMLDivElement;
  unsubscribe: (() => void) | null = null;

  constructor(controller: DndController, cfg: Required<DndConfig>) {
    this.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'dnd-overlay-root';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.pointerEvents = 'none';
    this.root.style.zIndex = '2147483646';

    this.line = document.createElement('div');
    this.line.className = 'dnd-drop-line';

    this.highlight = document.createElement('div');
    this.highlight.className = 'dnd-highlight';

    this.root.appendChild(this.highlight);
    this.root.appendChild(this.line);
    document.body.appendChild(this.root);

    console.log('DomOverlay');

    this.unsubscribe = controller.subscribe((s) => this.render(s, cfg));
  }

  render(s: OverlayState, cfg: Required<DndConfig>) {
    // line
    if (s.lineVisible) {
      this.line.style.display = 'block';
      this.line.style.position = 'absolute';
      this.line.style.left = `${s.lineLeft}px`;
      this.line.style.top = `${s.lineTop}px`;
      this.line.style.width = `${s.lineWidth}px`;
      this.line.style.height = s.lineInside ? '4px' : '3px';
      this.line.classList.toggle('inside', !!s.lineInside);
    } else {
      this.line.style.display = 'none';
    }

    // highlight
    if (cfg.highlightTarget && s.highlightVisible) {
      this.highlight.style.display = 'block';
      this.highlight.style.position = 'absolute';
      this.highlight.style.left = `${s.highlightLeft}px`;
      this.highlight.style.top = `${s.highlightTop}px`;
      this.highlight.style.width = `${s.highlightWidth}px`;
      this.highlight.style.height = `${s.highlightHeight}px`;
    } else {
      this.highlight.style.display = 'none';
    }
  }

  destroy() {
    this.unsubscribe?.();
    this.root.remove();
  }

  private injectStyles() {
    if (document.getElementById('dnd-overlay-styles')) return;
    const style = document.createElement('style');
    style.id = 'dnd-overlay-styles';
    style.textContent = `
      .dnd-overlay-root { pointer-events: none; position: absolute; inset: 0; z-index: 2147483646; }
      .dnd-drop-line { background: rgba(80,180,255,0.9); box-shadow: 0 0 0 1px rgba(0,0,0,0.25); border-radius: 2px; }
      .dnd-drop-line.inside { background: rgba(95,240,190,0.95); }
      .dnd-highlight { outline: 2px solid rgba(95,240,190,0.55); background: rgba(95,240,190,0.08); border-radius: 4px; }
      body.dnd-dragging * { cursor: grabbing !important; }
    `;
    document.head.appendChild(style);
  }
}