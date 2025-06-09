import { h, JSX } from "preact";
import { memo } from "preact/compat";
import { Input, Select, SelectInput, ColorPicker } from '@/components'
import { StyleType } from '@/components/styles-section/styles-config'

interface StyleFieldProps {
  styleKey: StyleType;
  value: string;
  onChange: (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => void;
  styleParams: {
    options?: string[];
    units?: string[];
  };
  onStatefullChange?: (value: string) => void;
}

const StyleField = ({ styleKey, value, onChange, styleParams, onStatefullChange  }: StyleFieldProps) => {
  const isColor = styleKey.toLowerCase().includes("color");

  if (styleParams.options) {
    return (
      <Select
        label={styleKey}
        name={styleKey}
        value={value}
        options={styleParams.options}
        handleChange={onChange}
      />
    );
  }

  if (styleParams.units) {
    return (
      <SelectInput
        label={styleKey}
        name={styleKey}
        value={value}
        options={styleParams.units}
        onSelectChange={onStatefullChange}
        onInputChange={onStatefullChange}
      />
    );
  }

  return isColor ? (
    // <ColorPicker
    //   label={styleKey}
    //   name={styleKey}
    //   value={value}
    //   onInput={onStatefullChange}
    //   onBlur={onChange}
    // />
    <span></span>
  ) : (
    <Input
      label={styleKey}
      name={styleKey}
      value={value}
      handleChange={onChange}
    />
  );
};

export default memo(StyleField);
