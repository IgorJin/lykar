import StylesSection from '@/components/styles-section'
import "./index.css";
import { useEditor } from '@/store/editor-сontext';
import { h } from 'preact'
import { useState } from 'preact/hooks'

const EditorPanel = () => {
  const { dispatch, services: { commandService } } = useEditor();

  const [position, setPosition] = useState('right') 

  const handleUndoCommand = () => {
    commandService.undo()
  }

  const handleRedoCommand = () => {
    commandService.redo()
  }

  return (
    <div className={`lykar-disable-tooltip editor-container ${position}`} data-lykar-ui-part="sidebar">
      <div className="control-panel">
        <span onClick={() => setPosition('left')}>L</span>
        <span onClick={() => setPosition('right')}>R</span>
        <span onClick={handleUndoCommand}>&#8617;</span>
        <span onClick={handleRedoCommand}>&#8618;</span>
        <span onClick={() => dispatch({ type: 'DEACTIVATE_EDITOR' })}>&#10005;</span>
        <span onClick={() => dispatch({ type: 'DEACTIVATE_EDITOR' })}>S</span>
      </div>

      <div className="views-panel">
        <StylesSection />
      </div>
    </div>
  );
};

export default EditorPanel;
