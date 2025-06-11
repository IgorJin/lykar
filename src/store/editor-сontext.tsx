import { createContext } from "preact";
import { h, RefObject } from "preact";
import {
  useReducer,
  useContext,
  useRef,
  Dispatch,
} from "preact/hooks";
import { NodeWrapper, NodeWrapperStorage } from "@/core/node-wrapper";
import { CommandService } from "@/core/command-service";

const initialState: EditorState = {
  isEditorModeActivated: false,
  initializedFromStorage: false,
  isElementEditing: false,
};

export type EditorState = {
  isEditorModeActivated: boolean;
  initializedFromStorage: boolean;
  isElementEditing: boolean;
};

export type EditorServices = {
  nodeWrapperStorage: NodeWrapperStorage;
  commandService: CommandService;
};


export type EditorRefs = {
  hoveredElementRef: RefObject<HTMLElement | null>;
  editedElementRef: RefObject<NodeWrapper | null>;
  clearEditedElement: () => void;
  chooseEditedElement: (element: NodeWrapper) => void;
};

export const ACTIONS = {
  ACTIVATE_EDITOR: "ACTIVATE_EDITOR",
  DEACTIVATE_EDITOR: "DEACTIVATE_EDITOR",
  MARK_STORAGE_LOADED: "MARK_STORAGE_LOADED",
  START_EDITING_ELEMENT: "START_EDITING_ELEMENT",
  FINISH_EDITING_ELEMENT: "FINISH_EDITING_ELEMENT",
} as const;

type ActionMap = {
  [ACTIONS.ACTIVATE_EDITOR]: undefined;
  [ACTIONS.DEACTIVATE_EDITOR]: undefined;
  [ACTIONS.MARK_STORAGE_LOADED]: undefined;
  [ACTIONS.START_EDITING_ELEMENT]: undefined;
  [ACTIONS.FINISH_EDITING_ELEMENT]: undefined;
};
type Action = {
  [K in keyof ActionMap]: ActionMap[K] extends undefined ? { type: K } : { type: K; payload: ActionMap[K] }
}[keyof ActionMap];


function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case ACTIONS.ACTIVATE_EDITOR:
      return { ...state, isEditorModeActivated: true };
    case ACTIONS.DEACTIVATE_EDITOR:
      return { ...state, isEditorModeActivated: false };
    case ACTIONS.MARK_STORAGE_LOADED:
      return { ...state, initializedFromStorage: true };
    case ACTIONS.START_EDITING_ELEMENT:
      return { ...state, isElementEditing: true };
    case ACTIONS.FINISH_EDITING_ELEMENT:
      return { ...state, isElementEditing: false };
    default:
      return state;
  }
}

export type EditorContextType = {
  state: EditorState;
  dispatch: Dispatch<Action>;
  refs: EditorRefs;
  services: EditorServices;
};

export const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: h.JSX.Element }) {
  const nodeWrapperStorage = new NodeWrapperStorage();
  const commandService = new CommandService(nodeWrapperStorage);

  const services: EditorServices = { nodeWrapperStorage, commandService };

  const [state, dispatch] = useReducer(editorReducer, initialState);

  const clearEditedElement = () => {
    refs.editedElementRef.current = null;
  };
  const chooseEditedElement = (element: NodeWrapper) => {
    refs.editedElementRef.current = element;
  };

  const refs: EditorRefs = {
    hoveredElementRef: useRef<HTMLElement | null>(null),
    editedElementRef: useRef<NodeWrapper | null>(null),
    clearEditedElement,
    chooseEditedElement,
  };


  return (
    <EditorContext.Provider value={{ state, dispatch, refs, services }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextType {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("useEditor должен использоваться внутри EditorProvider");
  }
  return ctx;
}