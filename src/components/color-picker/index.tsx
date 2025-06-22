import { h, JSX } from "preact";
import { useRef } from "preact/hooks";
import "./index.css";

interface ColorPickerProps {
  label: string;
  name: string;
  value: string;
  onInput?: (value: string) => void;
  onBlur?: (value: string) => void;
}

const ColorPicker = ({ label, name, value, onInput, onBlur }: ColorPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSwatchClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const newColor = e.currentTarget.value;
    onInput?.(newColor);
  };

  const handleBlur = () => {
    onBlur?.(value);
  };

  return (
    <div className="lykar-colorpicker__wrapper">
      <label className="lykar-colorpicker__label" htmlFor={name}>
        {label}
      </label>
      <div className="lykar-colorpicker__row">
        <div
          className="lykar-colorpicker__swatch"
          style={{ background: value }}
          onClick={handleSwatchClick}
          tabIndex={0}
        />
        <input
          ref={inputRef}
          type="color"
          id={name}
          name={name}
          value={value}
          className="lykar-colorpicker__native"
          onInput={handleChange}
          onBlur={handleBlur}
          aria-label={label}
        />
        <span className="lykar-colorpicker__value">{value}</span>
      </div>
    </div>
  );
};

export default ColorPicker;
