import { h, JSX } from "preact";
import { useRef, useState, useLayoutEffect } from "preact/hooks";
import { createPortal } from "preact/compat";
import "./index.css";

type DropDownProps = {
  trigger: JSX.Element;
  children: JSX.Element | ((opts: { close: () => void }) => JSX.Element);
};

export default function Dropdown({ trigger, children }: DropDownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Позиционирование панели относительно триггера
  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelStyle({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      });
    }
  }, [open]);

  // Закрытие по esc
  useLayoutEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open]);

  // Закрытие по клику вне панели
  useLayoutEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handler, true);
    return () => window.removeEventListener("mousedown", handler, true);
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className="lykar-dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        tabIndex={0}
      >
        {trigger}
      </span>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="lykar-dropdown-panel"
            style={{
              top: `${panelStyle.top}px`,
              left: `${panelStyle.left}px`,
              minWidth: triggerRef.current?.offsetWidth || 120,
            }}
          >
            <button
              className="lykar-dropdown-close"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
              type="button"
              tabIndex={0}
            >
              ×
            </button>
            <div className="lykar-dropdown-content">
              {typeof children === "function"
                ? children({ close: () => setOpen(false) })
                : children}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
