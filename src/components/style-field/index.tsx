import { h, JSX } from "preact";
import { memo } from "preact/compat";
import { Input, Select, SelectInput, ColorPicker } from '@/components'
import { BaseStyleProperty, SectionsStylesType } from '@/core/styles-service/styles-config'
import {
  typeNumber,
  typeColor,
  typeRadio,
  typeSelect,
  typeFile,
  typeSlider,
  typeComposite,
  typeStack,
} from '@/core/styles-service/styles-config'

interface StyleFieldProps {
  property: BaseStyleProperty & { key: SectionsStylesType };
  value: string;
  onChange: (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => void;
  onStatefullChange: (value: string) => void;
  handleSave: (value?: string) => void
}

const StyleField = (props: StyleFieldProps) => {
  const { property, onStatefullChange, handleSave } = props;

  type ComponentGenerator = (props: StyleFieldProps) => JSX.Element

  const handleBlur = (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => {
    handleSave(e.currentTarget.value);
  };

  const handleColorChange = (value: string) => {
    onStatefullChange(value);
    handleSave(value);
  };

  const ComponentByType: Record<string, ComponentGenerator> = {
    [typeNumber]: ({ property: { key: styleKey, units }, value, onStatefullChange, handleSave }: StyleFieldProps) => (
      <SelectInput
        label={styleKey}
        name={styleKey}
        value={value}
        options={units!}
        onCompleteChange={onStatefullChange}
        handleSave={handleSave}
      />
    ),
    [typeColor]: ({ property: { key: styleKey }, value }: StyleFieldProps) => (
      <ColorPicker
        label={styleKey}
        name={styleKey}
        value={value}
        onInput={handleColorChange} />
    ),
    [typeSelect]: ({ property: { key: styleKey, options }, value, onChange }: StyleFieldProps) => (
      <Select
        label={styleKey}
        name={styleKey}
        value={value}
        options={options!}
        handleChange={onChange}
        onBlur={handleBlur}
      />
    ),
    // [typeRadio]: Input,
    // [typeFile]: Input,
    // [typeSlider]: Input,
    // [typeComposite]: Input,
    // [typeStack]: Input,
  };

  const Component = ComponentByType[property.type] || ((props: StyleFieldProps) => (
    <Input
      label={props.property.key}
      name={props.property.key}
      value={props.value}
      handleChange={props.onChange}
      onBlur={e => props.handleSave(e.currentTarget.value)}
    />
  ));

  return <Component {...props} />
};

export default memo(StyleField);
