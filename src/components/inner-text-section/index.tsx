import { h, JSX } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useEditor } from "@/store/editor-сontext";
import { Input } from "@/components";

import { SectionsStylesType, STYLE_KEYS } from "@/core/styles-service/styles-config";
import { UpdateTextCommand } from "@/core/command-service/command-service";

const InnerTextSection = () => {
  const { services: { commandService }, state, refs: { editedElementRef } } = useEditor();
  const { isElementEditing } = state;
  const [innerText, setInnerText] = useState<string>("");

  useEffect(() => {
    if (!isElementEditing) return;

    const nodeWrapper = editedElementRef.current;

    if (!nodeWrapper) return;

    setInnerText(nodeWrapper.element.innerText);
  }, [isElementEditing]);

  const changeElementText = () => {
    if (!isElementEditing || !editedElementRef.current) return;

    const previousValue = editedElementRef.current?.element.innerText || '';

    const nextValue = innerText;

    commandService.executeCommand(new UpdateTextCommand(editedElementRef.current, previousValue, nextValue));
  };


  const updateInnerText = (e: JSX.TargetedEvent<HTMLInputElement>) => {
    setInnerText(e.currentTarget.value);
  }

  return (
    <Input 
      label="Текст"
      name="innerText"
      value={innerText}
      handleChange={updateInnerText}
      onBlur={changeElementText}
    />
  )
}

export default InnerTextSection