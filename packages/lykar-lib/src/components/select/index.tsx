import { h, JSX } from "preact";
import { Option } from "@/core/styles-service/styles-config";
import "./select.css";

interface SelectProps {
  label: string;
  name: string;
  value: string;
  options: string[] | Option[];
  handleChange: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) => void;
  onBlur?: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) => void;
}

/**
 * Универсальный селект с меткой.
 * Использует стандартный <select> элемент.
 */
const Select = ({ label, name, value, options, handleChange, onBlur }: SelectProps) => {
  const resolvedOptions: Option[] = options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt
  );

  return (
    <div className="lykar-select__wrapper">
      <label htmlFor={name} className="lykar-select__label">
        {label}
      </label>
      <select
        id={name}
        name={name}
        className="lykar-select__field"
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
      >
        {resolvedOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default Select;
