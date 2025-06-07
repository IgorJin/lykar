import { createContext } from "preact";
import { h, RefObject } from "preact";
import {
  useReducer,
  useContext,
  useRef,
  Dispatch,
} from "preact/hooks";
import { NodeWrapper } from "@/core/node-wrapper";
import { NodeWrapperStorage } from "@/core/node-wrapper";
import { CommandService } from "@/core/command-service";

export type EditorState = {
  isEditorModeActivated: boolean;
  initializedFromStorage: boolean;
};

type Action =
  | { type: "ACTIVATE_EDITOR" }
  | { type: "DEACTIVATE_EDITOR" }
  | { type: "MARK_STORAGE_LOADED" };

const initialState: EditorState = {
  isEditorModeActivated: false,
  initializedFromStorage: false,
};

function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "ACTIVATE_EDITOR":
      return { ...state, isEditorModeActivated: true };
    case "DEACTIVATE_EDITOR":
      return { ...state, isEditorModeActivated: false };
    case "MARK_STORAGE_LOADED":
      return { ...state, initializedFromStorage: true };
    default:
      return state;
  }
}

export type EditorContextType = {
  state: EditorState;
  dispatch: Dispatch<Action>;
  editedElementRef: RefObject<NodeWrapper | null>;
  nodeWrapperStorage: NodeWrapperStorage;
  commandService: CommandService;
};

export const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: h.JSX.Element }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const editedElementRef = useRef<NodeWrapper | null>(null);

  // const commandStorage = new CommandStorage();
  const nodeWrapperStorage = new NodeWrapperStorage();
  const commandService = new CommandService(nodeWrapperStorage);

  return (
    <EditorContext.Provider value={{ state, dispatch, editedElementRef, nodeWrapperStorage, commandService }}>
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