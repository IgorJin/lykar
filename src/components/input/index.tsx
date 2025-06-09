import { h, JSX } from "preact";

interface InputProps {
  label: string;
  name: string;
  value: string;
  handleChange: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
  onBlur?: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
}

const Input = ({ label, name, value, handleChange, onBlur }: InputProps) => {
  return (
    <div className="flex flex-col mb-2">
      <label htmlFor={name} className="text-sm text-gray-700 mb-1">
        {label}
      </label>
      <input
        type="text"
        id={name}
        name={name}
        className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={value || ""}
        onInput={handleChange}
        onBlur={onBlur}
      />
    </div>
  );
};

export default Input;
