import { h, JSX } from "preact";
import { memo } from "preact/compat";
import { Input, Select, SelectInput, ColorPicker } from '@/components'
import { BaseStyleProperty, SectionsStylesType } from '@/core/styles-service/styles-config'

interface StyleFieldProps {
  property: BaseStyleProperty & { key: SectionsStylesType };
  value: string;
  onChange: (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => void;
  onStatefullChange: (value: string) => void;
  handleSave: (value?: string) => void
}

const StyleField = ({ property: { key: styleKey, options, units }, value, onChange, onStatefullChange, handleSave  }: StyleFieldProps) => {
  const isColor = styleKey.toLowerCase().includes("color");

  const handleBlur = (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => {
    handleSave(e.currentTarget.value);
  };

  const handleColorChange = (value: string) => {
    onStatefullChange(value);
    handleSave(value);
  };

  if (options) {
    return (
      <Select
        label={styleKey}
        name={styleKey}
        value={value}
        options={options}
        handleChange={onChange}
        onBlur={handleBlur}
      />
    );
  }

  if (units) {
    return (
      <SelectInput
        label={styleKey}
        name={styleKey}
        value={value}
        options={units}
        onCompleteChange={onStatefullChange}
        handleSave={handleSave}
      />
    );
  }

  return isColor ? (
    <ColorPicker
      label={styleKey}
      name={styleKey}
      value={value}
      onInput={handleColorChange}
    />
  ) : (
    <Input
      label={styleKey}
      name={styleKey}
      value={value}
      handleChange={onChange}
      onBlur={handleBlur}
    />
  );
};

export default memo(StyleField);
