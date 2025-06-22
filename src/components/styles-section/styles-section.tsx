import { h, JSX } from "preact";
import { useEffect, useContext, useReducer, useCallback, useMemo } from "preact/hooks";
import { useEditor } from "@/store/editor-сontext";
import { StyleField } from "@/components";
import { sectionsConfigResolved } from "@/core/styles-service";
import { SectionsStylesType, STYLE_KEYS } from "@/core/styles-service/styles-config";
import { UpdateStyleCommand } from "@/core/command-service/command-service";

type StylesState = Record<SectionsStylesType, string>;

type StylesAction = {
  type: "update";
  payload: { key: SectionsStylesType; value: string };
};

type StylesActionUpdateAll = {
  type: "update-all";
  payload: StylesState;
};

const StylesSection: () => JSX.Element = () => {
  const { services: { commandService }, refs: { editedElementRef }, state: { isElementEditing } } = useEditor();

  function stylesReducer(state: StylesState, action: StylesAction | StylesActionUpdateAll): StylesState {
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

  useEffect(() => {
    console.log("🚀UPDATE STYLE ~ useEffect ~ styleState:", styleState)
  }, [styleState])


  type stylesReduceType = {
    [Property in SectionsStylesType]: string;
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

    // TODO собирать только необходимые стили
    const elementStyles: StylesState = window.getComputedStyle(nodeWrapper.element, null)

    dispatch({ type: "update-all", payload: elementStyles });

  }, [isElementEditing]);

  const changeElementStyle = useCallback((styleKey: SectionsStylesType) => (value?: string) => {
    const currentValue = value ?? styleState[styleKey];
    const wrapper = editedElementRef.current;

    if (!wrapper?.element) return;

    const previousValue = (wrapper.element.style as Record<string, any>)[styleKey];

    if (previousValue === currentValue) return;

    const command = new UpdateStyleCommand(wrapper, styleKey, previousValue, currentValue);

    commandService.executeCommand(command);
  }, [styleState]);


  const onStyleChange = useCallback((styleKey: SectionsStylesType) => (e: JSX.TargetedEvent<HTMLSelectElement | HTMLInputElement, Event>) => {
    const value = e.currentTarget.value;

    dispatch({ type: "update", payload: { key: styleKey, value } });
  }, []);

  const onStatefullStyleChange = useCallback(
    (styleKey: SectionsStylesType) => (value: string) => {

      dispatch({ type: "update", payload: { key: styleKey, value } });
    },
    []
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
                value={styleState[property.key] || ""}
                onStatefullChange={onStatefullStyleChange(property.key)}
                onChange={onStyleChange(property.key)}
                handleSave={changeElementStyle(property.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
};

export default StylesSection;
