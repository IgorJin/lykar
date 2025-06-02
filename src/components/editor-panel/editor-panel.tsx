// import StylesManager from './style-manager'
import "./index.css";
import { useEditorDispatch } from '@/store/editor-сontext';


const EditorPanel = () => {
  const dispatch = useEditorDispatch();

  return (
    <div className="editor-container">
      <div className="control-panel">
        <span>&#8617;</span>
        <span>&#8618;</span>
        <span onClick={() => dispatch({ type: 'DEACTIVATE_EDITOR' })}>&#10005;</span>
      </div>

      <div className="views-panel">
        {/* <StylesManager /> */} StylesManager
      </div>
    </div>
  );
};

export default EditorPanel;
