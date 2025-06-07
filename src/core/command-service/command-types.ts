import { NodeWrapperInterface } from "../node-wrapper";

export const COMMAND_TYPES = {
  UPDATE_TEXT: 'UPDATE_TEXT',
  UPDATE_STYLE: 'UPDATE_STYLE',
  ADD_ELEMENT: 'add-element',
  DELETE_ELEMENT: 'delete-element',
  EDIT_LOCATION: 'edit-location',
} as const

export const COMMAND_TYPES_LIST = Object.values(COMMAND_TYPES)

export type COMMAND_TYPES_LIST_TYPES = typeof COMMAND_TYPES_LIST[number]

export interface CommandInterface {
  execute(): void;
  cancel(): void;
  toJSON(): CommandItem;
  nodeWrapper: NodeWrapperInterface;
}

// TODO разобраться
type CommandItem = {
  id: string;
  type: typeof COMMAND_TYPES_LIST[number];
  // previousValue?: string;
  // nextValue?: string;
  // property?: string;

  //TODO 
  // сохранять тут paths: разные пути к элементу
}

type UpdateTextCommandItem = CommandItem & {
  type: typeof COMMAND_TYPES.UPDATE_TEXT;
  previousValue: string;
  nextValue: string;
}

type EditStyleCommandItem = CommandItem & {
  type: typeof COMMAND_TYPES.UPDATE_STYLE;
  property: string;
  previousValue: string;
  nextValue: string;
}