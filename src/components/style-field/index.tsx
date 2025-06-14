import { h, JSX } from "preact";
import { memo } from "preact/compat";
import { Input, Select, SelectInput, ColorPicker } from '@/components'
import { BaseStyleProperty, SectionsStylesType } from '@/core/styles-service/styles-config'

interface StyleFieldProps {
  property: BaseStyleProperty & { key: SectionsStylesType };
  value: string;
  onChange: (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => void;
  onStatefullChange?: (value: string) => void;
}

const StyleField = ({ property: { key: styleKey, options, units }, value, onChange, onStatefullChange  }: StyleFieldProps) => {
  const isColor = styleKey.toLowerCase().includes("color");

  if (options) {
    return (
      <Select
        label={styleKey}
        name={styleKey}
        value={value}
        options={options}
        handleChange={onChange}
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
      />
    );
  }

  return isColor ? (
    <ColorPicker
      label={styleKey}
      name={styleKey}
      value={value}
      onInput={onStatefullChange}
    />
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
