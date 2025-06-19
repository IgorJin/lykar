import { createContext } from "preact";
import { h, RefObject } from "preact";
import {
  useReducer,
  useContext,
  useRef,
  Dispatch,
  useEffect,
} from "preact/hooks";
import { NodeWrapper, NodeWrapperStorage } from "@/core/node-wrapper";
import { CommandService } from "@/core/command-service";
import { CommandJson } from "@/core/command-service/command-types";

const initialState: EditorState = {
  isEditorModeActivated: false,
  initializedFromStorage: false,
  isElementEditing: false,
  patches: [],
};

export type EditorState = {
  isEditorModeActivated: boolean;
  initializedFromStorage: boolean;
  isElementEditing: boolean;
  patches: CommandJson[]
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
  START_EDITING_ELEMENT: "START_EDITING_ELEMENT",
  FINISH_EDITING_ELEMENT: "FINISH_EDITING_ELEMENT",
  PATCHES_LOADED: "PATCHES_LOADED",
} as const;

type ActionMap = {
  [ACTIONS.ACTIVATE_EDITOR]: undefined;
  [ACTIONS.DEACTIVATE_EDITOR]: undefined;
  [ACTIONS.PATCHES_LOADED]: CommandJson[];
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
    case ACTIONS.PATCHES_LOADED:
      return { ...state, patches: action.payload };
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

export function EditorProvider({ children, initialPatches }: { children: h.JSX.Element, initialPatches?: CommandJson[] }) {
  const nodeWrapperStorage = new NodeWrapperStorage();
  const commandService = new CommandService(nodeWrapperStorage);

  const services: EditorServices = { nodeWrapperStorage, commandService };

  const [state, dispatch] = useReducer(editorReducer, initialState);

  useEffect(() => {
    if (initialPatches) {
      commandService.deserializeHistory(initialPatches);
    }
  }, [initialPatches]);

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