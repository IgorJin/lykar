import { h, JSX } from "preact";

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label: string;
  name: string;
  value: string;
  options: string[];
  handleChange: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) => void;
  onBlur?: (e: JSX.TargetedEvent<HTMLElement, Event>) => void;
}

/**
 * Универсальный селект с меткой.
 * Использует стандартный <select> элемент.
 */
const Select = ({ label, name, value, options, handleChange, onBlur }: SelectProps) => {
  return (
    <div className="flex flex-col mb-2">
      <label htmlFor={name} className="text-sm text-gray-700 mb-1">
        {label}
      </label>
      <select
        id={name}
        name={name}
        className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
};

export default Select;
