import { h, JSX } from "preact";
import { useEffect, useContext, useReducer, useCallback, useMemo } from "preact/hooks";
import { useEditor } from "@/store/editor-сontext";
import { StyleField } from "@/components";
import { SECTORS_CONFIG, StyleType, STYLES_CONFIG } from "./styles-config";
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

   const changeElementStyle = (styleKey: StyleType) => () => {
    const currentValue = styleState[styleKey];
    const wrapper = editedElementRef.current;

    if (!wrapper?.element) return;

    const previousValue = wrapper.element.style[styleKey];
  
    if (previousValue === currentValue) return;

    const command = new UpdateStyleCommand(wrapper, styleKey, previousValue, currentValue);
    commandService.executeCommand(command);
  };


  const onStyleChange = useCallback((styleKey: StyleType) => (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => {
    const target = e.currentTarget;
    const value = target.value;
  
    dispatch({ type: "update", payload: { key: styleKey, value } });
  
    changeElementStyle(styleKey)();
  }, [dispatch, changeElementStyle]);

  const onStatefullStyleChange = useCallback(
    (styleKey: StyleType) => (value: string) => {
      dispatch({ type: "update", payload: { key: styleKey, value } });

      changeElementStyle(styleKey)();
    },
    [dispatch, changeElementStyle]
  );

  return (
    <>
      {SECTORS_CONFIG.map(({ name: sectorName, properties }) => (
        <div key={sectorName} style={{ marginBottom: "1rem" }}>
          <h3>{sectorName}</h3>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {properties.map((styleKey) => (
              <StyleField
                styleParams={STYLES_CONFIG[styleKey]}
                key={styleKey}
                styleKey={styleKey}
                value={styleState[styleKey] || ""}
                onStatefullChange={onStatefullStyleChange(styleKey)}
                onChange={onStyleChange(styleKey)}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
};

export default StylesSection;
