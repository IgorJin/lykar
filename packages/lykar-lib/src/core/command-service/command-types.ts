import type { DropOrder } from "@/core/drag-and-drop/dnd";
import type { NodeWrapperInterface } from "../node-wrapper";

export const COMMAND_TYPES = {
  UPDATE_TEXT: 'UPDATE_TEXT',
  UPDATE_STYLE: 'UPDATE_STYLE',
  ADD_ELEMENT: 'add-element',
  DELETE_ELEMENT: 'delete-element',
  MOVE_ELEMENT: 'move-element',
} as const

export const COMMAND_TYPES_LIST = Object.values(COMMAND_TYPES)

export type COMMAND_TYPES_LIST_TYPES = typeof COMMAND_TYPES_LIST[number]

export interface CommandInterface {
  execute(): void;
  cancel(): void;
  toJSON(): CommandItem;
  nodeWrapper: NodeWrapperInterface;
}

export type CommandMeta = {
  timestamp: number,
  operatorId: number | null,
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

export type UpdateTextCommandItem = CommandInterface & {
  type: typeof COMMAND_TYPES.UPDATE_TEXT;
  previousValue: string;
  nextValue: string;
}

export type UpdateStyleCommandItem = CommandInterface & {
  type: typeof COMMAND_TYPES.UPDATE_STYLE;
  property: string;
  previousValue: string;
  nextValue: string;
}

export type MoveCommandItem = CommandInterface & {
  type: typeof COMMAND_TYPES.MOVE_ELEMENT;
  source: NodeWrapperInterface;
  target: NodeWrapperInterface;
  order: DropOrder;
}

export type UpdatedValue = { previousValue: string, nextValue: string }

export type CommandJson = {
  id: string;
  type: COMMAND_TYPES_LIST_TYPES
  meta: CommandMeta
  values?: Record<string, UpdatedValue>
  innerText?: UpdatedValue
  selectors: { css: string, xpath: string }
}
