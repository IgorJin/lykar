import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useEditor, ACTIONS } from '../store/editor-сontext';
import ActivasionButton from './start-button/start-button';
import EditorPanel from './editor-panel';
import { ToolbarPanel } from '@/widgets/toolbar-panel';

export function ClickListener() {
  const { state, dispatch } = useEditor();

  const { isEditorModeActivated, initializedFromStorage } = state;

  const toolbarRef = useRef<HTMLDivElement>(null);

  // TODO ПОТОМ ЗАМЕНИТЬ АПИШКОЙ
  useEffect(() => {
    if (!initializedFromStorage) {
      Object.entries(localStorage).forEach(([className, selector]) => {
        const el = document.querySelector<HTMLElement>(selector as string);
        if (el) {
          el.classList.add(className);
        }
      });
      dispatch({ type: 'MARK_STORAGE_LOADED' });
    }
  }, [initializedFromStorage, dispatch]);

  if (!isEditorModeActivated) {
    return <ActivasionButton handleClick={() => dispatch({ type: ACTIONS.ACTIVATE_EDITOR })} />;
  }

  return (
    <>
      <EditorPanel />
      <ToolbarPanel ref={toolbarRef} />
    </>
  );
}