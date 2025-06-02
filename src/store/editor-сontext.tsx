import { createContext } from 'preact';
import { useReducer, useContext, Dispatch } from 'preact/hooks';

export type EditorState = {
  isEditorModeActivated: boolean;
  initializedFromStorage: boolean;
};

type Action =
  | { type: 'ACTIVATE_EDITOR' }
  | { type: 'DEACTIVATE_EDITOR' }
  | { type: 'MARK_STORAGE_LOADED' };

const initialState: EditorState = {
  isEditorModeActivated: false,
  initializedFromStorage: false,
};

function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'ACTIVATE_EDITOR':
      console.log('ACTIVATE')
      return { ...state, isEditorModeActivated: true };
    case 'DEACTIVATE_EDITOR':
      return { ...state, isEditorModeActivated: false };
    case 'MARK_STORAGE_LOADED':
      return { ...state, initializedFromStorage: true };
    default:
      return state;
  }
}

const EditorStateContext = createContext<EditorState | undefined>(undefined);
const EditorDispatchContext = createContext<Dispatch<Action> | undefined>(undefined);

export function EditorProvider({ children }: { children: preact.ComponentChildren }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  console.log("🚀 ~ EditorProvider ~ state, dispatch:", state, dispatch)

  return (
    <EditorStateContext.Provider value={state}>
      <EditorDispatchContext.Provider value={dispatch}>
        {children}
      </EditorDispatchContext.Provider>
    </EditorStateContext.Provider>
  );
}

export function useEditorState() {
  const context = useContext(EditorStateContext);
  if (!context) throw new Error('useEditorState must be used within EditorProvider');
  return context;
}

export function useEditorDispatch() {
  const context = useContext(EditorDispatchContext);
  if (!context) throw new Error('useEditorDispatch must be used within EditorProvider');
  return context;
}