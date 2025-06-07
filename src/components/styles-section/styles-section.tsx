import { h, JSX } from "preact";
import { useEffect, useContext, useReducer } from "preact/hooks";
import { useEditor } from "@/store/editor-сontext";
import { Input, ColorPicker } from "@/components";
import { SECTORS_CONFIG, StyleType } from "./styles-config";
import { UpdateStyleCommand } from "@/core/command-service/command-service";

type StylesState = Record<StyleType, string>;

type StylesAction = {
  type: "update";
  payload: { key: StyleType; value: string };
};

const StylesSection: () => JSX.Element = () => {
  const { editedElementRef, commandService } = useEditor();

  function stylesReducer(state: StylesState, action: StylesAction): StylesState {
    console.log(action)
    switch (action.type) {
      case "update":
        return { ...state, [action.payload.key]: action.payload.value };
      default:
        return state;
    }
  }

  const [styleState, dispatch] = useReducer(
    stylesReducer,
    {} as StylesState
  );
  

  type stylesReduceType = {
    [Property in StyleType]: string;
  };

  useEffect(() => {
    const nodeWrapper = editedElementRef.current;

    if (!nodeWrapper) return;

    const elementStyles: StylesState = window.getComputedStyle(nodeWrapper.element, null)

    if (!elementStyles || !Object.keys(elementStyles).length)

    // Однако выше только для одного ключа. 
    // Лучше сделать отдельный диспатч, который заменяет весь state:
    // dispatch({ type: "replaceAll", payload: el.styles })
    // Но тогда нужно добавить кейс в редьюсер. Ниже — упрощённый вариант:
    Object.entries(elementStyles).forEach(([key, val]) => {
      dispatch({
        type: "update",
        payload: { key: key as StyleType, value: val },
      });
    });
  }, [editedElementRef.current]);

  const onStyleChange = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const target = e.currentTarget;
    const name = target.name as StyleType;
    const value = target.value;

    dispatch({ type: "update", payload: { key: name, value } });
  };

   const changeElementStyle = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const name = e.currentTarget.name as StyleType;
    const currentValue = styleState[name];
    const wrapper = editedElementRef.current;

    if (!wrapper?.element) return;

    const previousValue = wrapper.element.style[name];
  
    if (previousValue === currentValue) return;

    const command = new UpdateStyleCommand(wrapper, name, previousValue, currentValue);
    commandService.executeCommand(command);
  };

  return (
    <>
      {SECTORS_CONFIG.map(({ name: sectorName, properties }) => (
        <div key={sectorName} style={{ marginBottom: "1rem" }}>
          <h3>{sectorName}</h3>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {properties.map((styleKey) => {
              const isColor = styleKey.toLowerCase().includes("color");
              const value = styleState[styleKey] || "";

              return isColor ? (
                <ColorPicker
                  key={styleKey}
                  label={styleKey}
                  name={styleKey}
                  value={value}
                  onInput={(val: string) =>
                    dispatch({
                      type: "update",
                      payload: { key: styleKey, value: val },
                    })
                  }
                  onBlur={() =>
                    changeElementStyle({
                      currentTarget: { name: styleKey } as any,
                    } as any)
                  }
                />
              ) : (
                <Input
                  key={styleKey}
                  label={styleKey}
                  name={styleKey}
                  value={value}
                  handleChange={onStyleChange}
                  onBlur={changeElementStyle}
                />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
};

export default StylesSection;
