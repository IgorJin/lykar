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

type StylesActionUpdateAll = {
  type: "update-all";
  payload: StylesState;
};

const StylesSection: () => JSX.Element = () => {
  const { services: { commandService }, refs: { editedElementRef }, state: { isElementEditing} } = useEditor();

  function stylesReducer(state: StylesState, action: StylesAction | StylesActionUpdateAll): StylesState {
    console.log(action)
    switch (action.type) {
      case "update":
        return { ...state, [action.payload.key]: action.payload.value };
      case "update-all":
        return action.payload;
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

  // TODO MutationObserver логика
  // useEffect(() => {
  //   if (isElementEditing && editingElementRef.current) {
  //     const observer = new MutationObserver(() => {
  //       if (!document.body.contains(editingElementRef.current!.element)) {
  //         // элемент удалили из DOM
  //         // => выходим из режима редактирования
  //         dispatch({ type: 'FINISH_EDITING_ELEMENT' });
  //         editingElementRef.current = null;
  //       }
  //     });
  //     observer.observe(document.body, { childList: true, subtree: true });
  //     return () => observer.disconnect();
  //   }
  // }, [isElementEditing]);

  useEffect(() => {
    if (!isElementEditing) return;

    const nodeWrapper = editedElementRef.current;

    if (!nodeWrapper) return;

    const elementStyles: StylesState = window.getComputedStyle(nodeWrapper.element, null)
    console.log("🚀 ~ useEffect ~ elementStyles:", elementStyles)

    dispatch({ type: "update-all", payload: elementStyles });

    console.log(styleState)
  }, [isElementEditing]);

  const changeElementStyle = (styleKey: StyleType, value?: string) => () => {
    const currentValue = value ?? styleState[styleKey];
    const wrapper = editedElementRef.current;

    if (!wrapper?.element) return;

    const previousValue = wrapper.element.style[styleKey];

    if (previousValue === currentValue) return;

    const command = new UpdateStyleCommand(wrapper, styleKey, previousValue, currentValue);

    commandService.executeCommand(command);

    dispatch({ type: "update", payload: { key: styleKey, value: currentValue } });
  };


  const onStyleChange = useCallback((styleKey: StyleType) => (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => {
    const value = e.currentTarget.value;

    changeElementStyle(styleKey, value)();
  }, [changeElementStyle]);

  const onStatefullStyleChange = useCallback(
    (styleKey: StyleType) => (value: string) => {
      changeElementStyle(styleKey, value)();
    },
    [changeElementStyle]
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
