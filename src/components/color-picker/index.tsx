import { h, JSX } from "preact";
import { useState, useEffect } from "preact/hooks";

interface ColorPickerProps {
  /** Текст метки для поля */
  label: string;
  /** Название и идентификатор поля */
  name: string;
  /** Текущее цветовое значение в формате "#rrggbb" */
  value: string;
  /** Коллбэк, вызываемый при выборе нового цвета. В качестве аргумента возвращает строку-цвет. */
  onInput: (color: string) => void;
  /** Коллбэк при потере фокуса полем */
  onBlur: () => void;
}

/**
 * Комппонент цветового селектора на основе <input type="color" />.
 * Хранит внутри себя локальный стейт, чтобы обеспечить корректную работу контролируемого компонента.
 */
const ColorPicker = ({ label, name, value, onInput, onBlur }: ColorPickerProps) => {
  const [internalColor, setInternalColor] = useState<string>(value || "#000000");

  // При изменении пропса value обновляем локальный стейт
  useEffect(() => {
    if (value && value !== internalColor) {
      setInternalColor(value);
    }
  }, [value]);

  const handleChange = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const newColor = e.currentTarget.value;
    setInternalColor(newColor);
    onInput(newColor);
  };

  return (
    <div className="flex flex-col mb-2">
      <label htmlFor={name} className="text-sm text-gray-700 mb-1">
        {label}
      </label>
      <input
        type="color"
        id={name}
        name={name}
        className="w-10 h-10 p-0 border-none"
        value={internalColor}
        onInput={handleChange}
        onBlur={onBlur}
      />
    </div>
  );
};

export default ColorPicker;
