import React, { useEffect, useContext, useState } from "react";
// import StylesOptions from "./options";
import { EditorContext } from "../../../../store/editor-context";
import { Input, ColorPicker } from "../../components";
import { SECTORS_CONFIG, StyleType } from './stylesConfig'
import { commandManager, EditStyleCommand } from "../../lib/command-service";

const ViewsManager = () => {
  const { editedElementRef } = useContext(EditorContext);
  
  const [styleState, styleStateSetter] = useState({} as stylesReduceType);
  

  type stylesReduceType = {
    [Property in StyleType]: string;
  };

  useEffect(() => {
    if (!(editedElementRef.current && Object.keys(editedElementRef.current.styles).length)) return;

    const initialGeneralState = editedElementRef.current.styles

    // @ts-ignore TODO need global styles fix
    styleStateSetter({ ...initialGeneralState });

  }, [editedElementRef.current]);

  const onStyleChange = (e: any) => {
    const { name, value } = e.target;

    styleStateSetter((state) => ({ ...state, [name]: value }));
  }

  const changeElementStyle = (e: any) => {
    const { name }: { name: StyleType } = e.target;

    if (!editedElementRef.current) return
    if (editedElementRef.current.styles[name] === styleState[name]) return

    const changedData = { parameter: name, value: styleState[name] }
    const command = new EditStyleCommand(editedElementRef.current, changedData)

    commandManager.executeCommand(command)
    // const tagPath = generatePath()

    // localStorage.setItem('#123', tagPath)

    // if (name in styleState) {
    //   elementRef.current.style[name] = styleState[name];

    //   console.log(elementRef.current.style.cssText)
    // }
  };

  return (
    <>
      ({ SECTORS_CONFIG.map(({ name, properties }) => (
        <div key={name}>
          <h3>{name}</h3>
          {properties.map(style => <Input
            label={style}
            id={style}
            handleChange={onStyleChange}
            onBlur={changeElementStyle}
            value={styleState[style]}
            key={style}
          />)}
        </div>
      )) })
    </>
  );
};

export default ViewsManager;
