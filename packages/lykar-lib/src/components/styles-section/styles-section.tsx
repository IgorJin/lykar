import { h, JSX } from "preact";
import { useEffect, useContext, useReducer, useCallback, useMemo } from "preact/hooks";
import { useEditor } from "@/store/editor-сontext";
import { StyleField } from "@/components";
import { sectionsConfigResolved } from "@/core/styles-service";
import { StylesKeysType, StylesObject, ALL_STYLE_KEYS } from "@/core/styles-service/styles-config";
import { UpdateStyleCommand } from "@/core/command-service/command-service";
import { getElementStylesMap } from "@/core/utils";

type StylesAction = {
  type: "update";
  payload: { key: StylesKeysType; value: string };
};

type StylesActionUpdateAll = {
  type: "update-all";
  payload: StylesObject;
};

const StylesSection: () => JSX.Element = () => {
  const { services: { commandService }, refs: { editedElementRef }, state: { isElementEditing } } = useEditor();

  function stylesReducer(state: StylesObject, action: StylesAction | StylesActionUpdateAll): StylesObject {
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
    {} as StylesObject
  );

  useEffect(() => {
    console.log("🚀UPDATE STYLE ~ useEffect ~ styleState:", styleState)
  }, [styleState])


  type stylesReduceType = {
    [Property in StylesKeysType]: string;
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

    const allowedStyles = getElementStylesMap(nodeWrapper.element);

    console.log("🚀 ~ useEffect ~ allowedStyles:", allowedStyles)
    dispatch({ type: "update-all", payload: allowedStyles });
  }, [isElementEditing]);

  const changeElementStyle = useCallback((styleKey: StylesKeysType) => (value?: string) => {
    const currentValue = value ?? styleState[styleKey];
    const wrapper = editedElementRef.current;

    if (!wrapper?.element) return;

    const previousValue = (wrapper.element.style as Record<string, any>)[styleKey];

    if (previousValue === currentValue) return;

    const command = new UpdateStyleCommand(wrapper, styleKey, previousValue, currentValue || '');

    commandService.executeCommand(command);
  }, [editedElementRef.current]);


  const onStyleChange = useCallback((styleKey: StylesKeysType) => (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => {
    const value = e.currentTarget.value;

    dispatch({ type: "update", payload: { key: styleKey, value } });
  }, [editedElementRef.current]);

  const onStatefullStyleChange = useCallback(
    (styleKey: StylesKeysType) => (value: string) => {

      dispatch({ type: "update", payload: { key: styleKey, value } });
    },
    [editedElementRef.current]
  );

  return (
    <>
      {sectionsConfigResolved.map(({ name: sectorName, properties: properties }) => (
        <div key={sectorName} style={{ marginBottom: "1rem" }}>
          <h3>{sectorName}</h3>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {properties.map(property => (
              <StyleField
                property={property}
                state={styleState}
                onStatefullChange={onStatefullStyleChange}
                onChange={onStyleChange}
                handleSave={changeElementStyle}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
};

export default StylesSection;
