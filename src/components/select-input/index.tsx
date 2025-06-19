import { h, FunctionalComponent } from 'preact';
import { useState } from 'preact/hooks';
import { useMemo } from 'preact/hooks';

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

  return (
    <div className={`flex items-center border rounded overflow-hidden ${className}`}>
      <label>{label}
        <select
          disabled={disabled}
          value={currentSelect}
          onChange={handleSelect}
          className="px-2 py-1 bg-gray-100 text-gray-800 border-r focus:outline-none"
        >
          {options.map(opt => (
            <option value={opt}>{opt}</option>
          ))}
        </select>
        <input
          disabled={disabled}
          name={name}
          type="text"
          value={currentInput}
          onInput={handleInput}
          placeholder={placeholder}
          className="flex-1 px-2 py-1 focus:outline-none"
          onBlur={handleBlur}
        />
      </label>
    </div>
  );
};

export default SelectInput;