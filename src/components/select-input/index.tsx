import { h, FunctionalComponent } from 'preact';
import { useState } from 'preact/hooks';
import { useMemo } from 'preact/hooks';
import './index.css';

interface SelectInput {
  label: string;
  options: string[];
  value: string;
  onSelectChange?: (newValue: string) => void;
  onInputChange?: (newText: string) => void;
  onCompleteChange?: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  handleSave?: (value?: string) => void;
}

function parseSelectInput(value: string, options: string[]): { inputValue: string, selected: string | null } {
  for (const option of options) {
    if (value.endsWith(option)) {
      return {
        inputValue: value.slice(0, -option.length),
        selected: option
      };
    }
  }

  return {
    inputValue: value,
    selected: null
  };
}

const SelectInput: FunctionalComponent<SelectInput> = ({
  options,
  label,
  value,
  onSelectChange,
  onInputChange,
  onCompleteChange,
  placeholder = '',
  className = '',
  name = '',
  defaultValue = '',
  disabled,
  handleSave,
}) => {
  const { selected, inputValue } = useMemo(() => parseSelectInput(value, options), [value, options]);
  const [currentSelect, setCurrentSelect] = useState<string>(selected || defaultValue || '');
  const [currentInput, setCurrentInput] = useState<string>(inputValue || '');

  const handleSelect = (e: h.JSX.TargetedEvent<HTMLSelectElement, Event>) => {
    const val = e.currentTarget.value;
    const concatenatedValue = currentInput + val;

    setCurrentSelect(val);
    onSelectChange?.(val);
    onCompleteChange?.(concatenatedValue);
    handleSave?.(concatenatedValue);
  };

  const handleInput = (e: h.JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const txt = e.currentTarget.value;

    setCurrentInput(txt);
    onInputChange?.(txt);
    onCompleteChange?.(txt + currentSelect);
  };

  const handleBlur = () => {
    handleSave?.(currentInput + currentSelect);
  }

  const selectId = `lykar-selectinput-${name}`;

  return (
    <div className={`lykar-selectinput__wrapper ${className}`}>
    <label htmlFor={selectId} className="lykar-selectinput__label">{label}</label>
    <div className="lykar-selectinput__inner">
      <input
        disabled={disabled}
        name={name}
        type="text"
        value={currentInput}
        onInput={handleInput}
        placeholder={placeholder}
        className="lykar-selectinput__input"
        onBlur={handleBlur}
        autoComplete="off"
      />
      <select
        id={selectId}
        disabled={disabled}
        value={currentSelect}
        onChange={handleSelect}
        className="lykar-selectinput__select"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  </div>
  );
};

export default SelectInput;