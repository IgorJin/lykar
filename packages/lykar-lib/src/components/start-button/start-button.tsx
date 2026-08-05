import { useEditor } from '@/store/editor-сontext';
import "./index.css";

interface ActivationButtonProps {
  handleClick: () => void;
}

const ActivasionButton = ({ handleClick }: ActivationButtonProps) => {
  const { state, dispatch } = useEditor();

  const { isEditorModeActivated, initializedFromStorage } = state;

  return (
    <div
      className="built-in-button"
      onClick={handleClick}
    >
      <div className="inner">
        <span>Изменить</span>
      </div>
    </div>
  );
};

export default ActivasionButton;
