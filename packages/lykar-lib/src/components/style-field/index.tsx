import { h, JSX } from "preact";
import { memo, useMemo, useCallback, useState } from "preact/compat";
import ColorPicker from '@/components/color-picker';
import Dropdown from '@/components/dropdown';
import Input from '@/components/input';
import Select from '@/components/select';
import SelectInput from '@/components/select-input';
import { BaseStyleProperty, StylesKeysType, StylesObject } from '@/core/styles-service/styles-config'
import {
  typeNumber,
  typeColor,
  typeSelect,
  typeFile,
  typeComposite,
  typeGrouped,
  typeInput,
} from '@/core/styles-service/styles-config'

interface StyleFieldProps {
  property: BaseStyleProperty & { key: StylesKeysType };
  state: StylesObject;
  onChange: (styleKey: StylesKeysType) => (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => void;
  onStatefullChange: (styleKey: StylesKeysType) => (value: string) => void;
  handleSave: (styleKey: StylesKeysType) => (value?: string) => void
}

const getKeyValue = (state: StylesObject, styleKey: StylesKeysType) => {
  return state[styleKey] || '';
};

type ComponentGenerator = (props: StyleFieldProps) => JSX.Element;

const DefaultField: ComponentGenerator = ({ property: { key: styleKey, label }, state, onChange, handleSave }) => {
  const onInputChange = useCallback(onChange(styleKey), [onChange, styleKey]);
  const onBlur = useCallback((e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    handleSave(styleKey)(e.currentTarget.value);
  }, [handleSave, styleKey]);

  return (
    <Input
      label={label}
      name={styleKey}
      value={getKeyValue(state, styleKey)}
      handleChange={onInputChange}
      onBlur={onBlur}
    />
  );
};

const ComponentByType: Record<string, ComponentGenerator> = {
  [typeNumber]: ({ property: { key: styleKey, units, label }, state, onStatefullChange, handleSave }) => {
    const handleComplete = useCallback(onStatefullChange(styleKey), [onStatefullChange, styleKey]);
    const handleSaveFn = useCallback(handleSave(styleKey), [handleSave, styleKey]);

    console.log(styleKey, getKeyValue(state, styleKey))


    return (
      <SelectInput
        label={label}
        name={styleKey}
        value={getKeyValue(state, styleKey)}
        options={units!}
        onCompleteChange={handleComplete}
        handleSave={handleSaveFn}
      />
    );
  },
  [typeColor]: ({ property: { key: styleKey, label }, state, onStatefullChange, handleSave }) => {
    const handleColor = useCallback((v: string) => {
      onStatefullChange(styleKey)(v);
      handleSave(styleKey)(v);
    }, [onStatefullChange, handleSave, styleKey]);

    return (
      <ColorPicker
        label={label}
        name={styleKey}
        value={getKeyValue(state, styleKey)}
        onInput={handleColor}
      />
    );
  },
  [typeSelect]: ({ property: { key: styleKey, label, options }, state, onChange, handleSave }) => {
    const onChangeFn = useCallback(onChange(styleKey), [onChange, styleKey]);
    const onBlur = useCallback((e: JSX.TargetedEvent<HTMLSelectElement, Event>) => {
      handleSave(styleKey)(e.currentTarget.value);
    }, [handleSave, styleKey]);

    return (
      <Select
        label={label}
        name={styleKey}
        value={getKeyValue(state, styleKey)}
        options={options!}
        handleChange={onChangeFn}
        onBlur={onBlur}
      />
    );
  },
  [typeComposite]: ({ property, state, onChange, handleSave, onStatefullChange }) => (
    <Dropdown trigger={<span>{property.label}</span>}>
      {() =>
        <>
          {property.properties!.map(childProperty => {
            const styleKey = childProperty.key;

            const ChildComponent = ComponentByType[childProperty.type] || DefaultField;

            return (
              <ChildComponent
                key={styleKey}
                property={childProperty}
                state={state}
                onChange={onChange}
                onStatefullChange={onStatefullChange}
                handleSave={handleSave}
              />
            );
          })}
        </>
      }
    </Dropdown>
  ),
  // [typeInput]: Input,
  // Собираются в один стиль
  [typeGrouped]: ({ property: { key: parentStyleKey, label, grouppedHandler, properties }, state, onChange, handleSave, onStatefullChange }: StyleFieldProps) => (
    <Dropdown trigger={<span>{label}</span>}>
      {() => {
        if (!properties) return <>Нет полей!</>;

        const initialState = properties.reduce((acc, childProperty) => ({ ...acc, [childProperty.key]: getKeyValue(state, childProperty.key)}), {});
        const [localState, setLocalState] = useState(initialState)
        console.log("🚀 ~ localState:", localState)

        
        // handleSave, onStatefullChange
        // буду вызывать их при изменении локального стейта
        return (
          <>
            {properties.map(childProperty => {
              const styleKey = childProperty.key;

              const ChildComponent = ComponentByType[childProperty.type] || DefaultField;

              return (
                <ChildComponent
                  key={styleKey}
                  property={childProperty}
                  state={state}
                  onChange={onChange}
                  onStatefullChange={onStatefullChange}
                  handleSave={handleSave}
                />
              );
            })}
          </>
        )
      }
      }
    </Dropdown>
  ),
};

const StyleField = memo((props: StyleFieldProps) => {
  const { property } = props;

  const Component = ComponentByType[property.type] || DefaultField;

  return <Component {...props} />;
});

export default StyleField;
