import { h, JSX } from "preact";
import "./input.css";

interface InputProps {
  label: string;
  name: string;
  value: string;
  handleChange: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
  onBlur?: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
}

const Input = ({ label, name, value, handleChange, onBlur }: InputProps) => {
  return (
    <div className="lykar-input__wrapper">
      <label htmlFor={name} className="lykar-input__label">
        {label}
      </label>
      <input
        type="text"
        id={name}
        name={name}
        className="lykar-input__field"
        value={value || ""}
        onInput={handleChange}
        onBlur={onBlur}
        autoComplete="off"
      />
    </div>
  );
};

export default Input;