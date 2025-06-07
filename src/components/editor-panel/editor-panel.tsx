import StylesSection from '@/components/styles-section'
import "./index.css";
import { useEditor } from '@/store/editor-сontext';


const EditorPanel = () => {
  const { dispatch } = useEditor();

  return (
    <div className="editor-container">
      <div className="control-panel">
        <span>&#8617;</span>
        <span>&#8618;</span>
        <span onClick={() => dispatch({ type: 'DEACTIVATE_EDITOR' })}>&#10005;</span>
      </div>

      <div className="views-panel">
        <StylesSection />
      </div>
    </div>
  );
};

export default EditorPanel;
