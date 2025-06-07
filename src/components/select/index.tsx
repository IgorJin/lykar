import { h, JSX } from "preact";

interface SelectOption {
  /** Отображаемый текст опции */
  label: string;
  /** Значение опции */
  value: string;
}

interface SelectProps {
  /** Текст метки для селекта */
  label: string;
  /** Название и идентификатор селекта */
  name: string;
  /** Текущий выбранный value */
  value: string;
  /** Список опций */
  options: SelectOption[];
  /** Коллбэк при изменении выбранного значения */
  handleChange: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) => void;
  /** Коллбэк при потере фокуса */
  onBlur: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) => void;
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
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default Select;
