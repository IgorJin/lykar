import { h } from 'preact';
import { useRef, useState, useCallback } from 'preact/hooks';
import { useEditor, ACTIONS } from '@/store/editor-сontext';
import { useEventListener } from '@/core/hooks';
import './index.css';
import { NodeWrapper } from '@/core/node-wrapper';

interface ToolbarPanelProps {
  ref?: preact.Ref<HTMLDivElement>;
}

interface ToolbarState {
  x: number;
  y: number;
  visible: boolean;
}

const TOOLBAR_HEIGHT = 32;
const TOOLBAR_WIDTH = 180;
const EDITOR_WIDTH = 270;

// Вынеси в utils для тестирования
function getToolbarPosition(rect: DOMRect): { x: number; y: number } {
  const innerWidth = window.innerWidth - EDITOR_WIDTH;
  if (rect.right > innerWidth) {
    return { x: rect.x - TOOLBAR_WIDTH, y: rect.top - TOOLBAR_HEIGHT };
  }
  if (rect.top < TOOLBAR_HEIGHT) {
    return { x: rect.left, y: rect.bottom + 8 };
  }
  return { x: rect.left, y: rect.top - TOOLBAR_HEIGHT };
}

export default function ToolbarPanel(props: ToolbarPanelProps) {
  const { state: { isEditorModeActivated }, refs: { editedElementRef, hoveredElementRef, clearEditedElement, chooseEditedElement }, dispatch, services: { nodeWrapperStorage} } = useEditor();

  const moveBtnRef = useRef<HTMLButtonElement>(null);
  const [toolbar, setToolbar] = useState<ToolbarState>({ x: 0, y: 0, visible: false });
  const [dragActive, setDragActive] = useState(false);

  const handleHover = useCallback((e: MouseEvent) => {
    if (!isEditorModeActivated) return;

    const target = e.target as HTMLElement;
    console.log("🚀 ~ handleHover ~ target:", target)

    if (!target || target.closest('.toolbar-wrapper') || target.closest('.editor-container')) return;

    editedElementRef.current?.element.classList.remove('hovered');
    hoveredElementRef.current?.classList.remove('hovered');

    hoveredElementRef.current = target;

    const rect = target.getBoundingClientRect();
    target.classList.add('hovered');

    console.log(getToolbarPosition(rect))

    setToolbar({ ...getToolbarPosition(rect), visible: true });
  }, [isEditorModeActivated]);

  // Скрывать тулбар при скролле/потере элемента
  const handleScroll = useCallback(() => {
    if (!editedElementRef.current) return;

    if (!isEditorModeActivated) {
      setToolbar(t => ({ ...t, visible: false }));
      editedElementRef.current.element.classList.remove('hovered');
    } else {
      const rect = editedElementRef.current.element.getBoundingClientRect();
      setToolbar({ ...getToolbarPosition(rect), visible: true });
    }
  }, [isEditorModeActivated]);

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

  function getOrCreateWrapper(element: HTMLElement) {
    let wrapper = nodeWrapperStorage.getByElement(element);
    if (!wrapper) {
      wrapper = new NodeWrapper(element);
      wrapper.create()

      nodeWrapperStorage.push(wrapper);
    }
    return wrapper;
  }

  const handleEditClick = () => {
    if (!hoveredElementRef.current) return;

    const wrapper = getOrCreateWrapper(hoveredElementRef.current);

    if (editedElementRef.current) {
      clearEditedElement();
      dispatch({ type: ACTIONS.FINISH_EDITING_ELEMENT });
    } else {
      chooseEditedElement(wrapper);
      dispatch({ type: ACTIONS.START_EDITING_ELEMENT });
    }
  };

  // Навешиваем события только когда надо
  useEventListener('mouseover', handleHover);
  useEventListener('scroll', handleScroll);
  useEventListener('dragstart', handleDragStart, moveBtnRef);
  useEventListener('dragend', handleDragEnd, moveBtnRef);

  return (
    <div
      className="toolbar-wrapper"
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
        {editedElementRef.current ? '⏹️' : '✏️'}
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
