import { h } from 'preact';
import { useRef, useState, useCallback } from 'preact/hooks';
import { useEditor, ACTIONS } from '@/store/editor-сontext';
import { useEventListener } from '@/core/hooks';
import './index.css';
import { isEditorUiElement, getToolbarPosition, getOrCreateWrapper } from '@/core/utils';

interface ToolbarPanelProps {
  ref?: preact.Ref<HTMLDivElement>;
}

interface ToolbarState {
  x: number;
  y: number;
  visible: boolean;
}


// const getTooltipCoordinates = (rect: DOMRect) => {
//   const TOOLBAR_HEIGHT = 21;
//   const TOOLBAR_WIDTH = 150;
//   const INNER_WIDTH = window.innerWidth
//   // 1
//   if (rect.height > window.innerHeight && rect.y < TOOLBAR_HEIGHT) {
//     if (rect.right > INNER_WIDTH) return { x: rect.x + TOOLBAR_WIDTH + window.screenX, y: window.scrollY ? window.scrollY : rect.y };
//     else return { x: rect.right, y: window.scrollY ? window.scrollY : rect.y }
//   }
//   // 2
//   if (rect.right > INNER_WIDTH) return { x: rect.x + TOOLBAR_WIDTH + window.screenX, y: rect.top + window.scrollY - TOOLBAR_HEIGHT };
//   // 3
//   if (rect.y < TOOLBAR_HEIGHT && rect.bottom + TOOLBAR_HEIGHT <= window.innerHeight) {
//     return {
//       x: rect.left + rect.width - window.scrollX,
//       y: rect.bottom + window.scrollY,
//     };
//   }
//   // 4
//   return {
//     x: rect.left + rect.width + window.scrollX,
//     y: rect.top + window.scrollY - TOOLBAR_HEIGHT,
//   };
// }

export default function ToolbarPanel(props: ToolbarPanelProps) {
  const {
    state: { isEditorModeActivated, isElementEditing },
    refs: {
      editedElementRef,
      hoveredElementRef,
      clearEditedElement,
      chooseEditedElement,
    },
    dispatch,
    services: { nodeWrapperStorage },
  } = useEditor();

  const moveBtnRef = useRef<HTMLButtonElement>(null);
  const [toolbar, setToolbar] = useState<ToolbarState>({ x: 0, y: 0, visible: false });
  const [dragActive, setDragActive] = useState(false);

  const handleHover = useCallback((e: MouseEvent) => {
    if (!isEditorModeActivated) return;

    const target = e.target as HTMLElement;

    if (isEditorUiElement(target)) return;

    // console.log("🚀 ~ handleHover ~ target:", target)

    if (!target || target.closest('.toolbar-wrapper') || target.closest('.editor-container')) return;

    editedElementRef.current?.element.classList.remove('hovered');
    hoveredElementRef.current?.classList.remove('hovered');

    hoveredElementRef.current = target;

    const rect = target.getBoundingClientRect();
    target.classList.add('hovered');

    setToolbar({ ...getToolbarPosition(rect), visible: true });
  }, [isEditorModeActivated]);

  const handleScroll = () => {
    const focusElement = hoveredElementRef.current || editedElementRef.current?.element

    if (isEditorUiElement(focusElement!)) return;

    if (focusElement) {
      if (focusElement.classList.contains("hovered")) {
        window.requestAnimationFrame(() => {
          const rect = focusElement!.getBoundingClientRect();

          setToolbar({
            visible: true,
            ...getToolbarPosition(rect),
          });
        });
      }
    }
  }

  // Drag & Drop
  const handleDragStart = useCallback((e: DragEvent) => {
    setDragActive(true);
    e.dataTransfer?.setData('text/plain', 'dragging');
  }, []);
  const handleDragEnd = useCallback(() => setDragActive(false), []);

  // Дублировать элемент
  const handleCopy = useCallback(() => {
    const el = editedElementRef.current?.element;

    if (!el) return;

    el.after(el.cloneNode(true));
  }, []);

  // Удалить элемент
  const handleDelete = useCallback(() => {
    const el = editedElementRef.current?.element;

    if (!el) return;

    el.remove();
    setToolbar(t => ({ ...t, visible: false }));
  }, []);

  const handleEditClick = () => {
    if (!hoveredElementRef.current) return;

    const wrapper = getOrCreateWrapper(nodeWrapperStorage, hoveredElementRef.current);

    if (editedElementRef.current) {
      clearEditedElement();
      dispatch({ type: ACTIONS.FINISH_EDITING_ELEMENT });
    } else {
      chooseEditedElement(wrapper);
      dispatch({ type: ACTIONS.START_EDITING_ELEMENT });
    }
  };

  // Навешиваем события только когда надо
  // TODO проблема, что моузовер не работает при самом первом запуске на общий элемент
  useEventListener('mouseover', handleHover, null, !isElementEditing);
  useEventListener('scroll', handleScroll);
  useEventListener('dragstart', handleDragStart, moveBtnRef);
  useEventListener('dragend', handleDragEnd, moveBtnRef);

  return (
    <div
      className="toolbar-wrapper lykar-disable-tooltip"
      data-lykar-ui-part="toolbar"
      ref={props.ref}
      style={{
        left: toolbar.x,
        top: toolbar.y,
        visibility: toolbar.visible ? 'visible' : 'hidden',
        position: 'fixed',
        zIndex: 9999,
        transform: 'translateY(-100%)',
      }}
    >
      <button title="Редактировать" onClick={handleEditClick}>
        {isElementEditing ? '⏹️' : '✏️'}
      </button>
      <button ref={moveBtnRef} draggable title="Переместить">
        ☰
      </button>
      <button onClick={handleCopy} title="Дублировать">
        📄
      </button>
      <button onClick={handleDelete} title="Удалить">
        🗑️
      </button>
    </div>
  );
}
