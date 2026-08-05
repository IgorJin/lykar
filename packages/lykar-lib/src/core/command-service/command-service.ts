import { NodeWrapperInterface, NodeWrapper, NodeWrapperStorage } from '../node-wrapper'
import { StylesKeysType } from '@/core/styles-service/styles-config'
import { CommandStorage } from './command-storage'
import { CommandInterface, COMMAND_TYPES, COMMAND_TYPES_LIST, COMMAND_TYPES_LIST_TYPES, CommandMeta, UpdateTextCommandItem, UpdateStyleCommandItem, MoveCommandItem, CommandJson } from './command-types'
import { getElementSelectors, getOrCreateWrapper, findElementBySelectors } from '@/core/utils'
import { DropOrder } from '../drag-and-drop/dnd'

export class CommandService {
  private history: CommandStorage = new CommandStorage();
  private trash: CommandStorage = new CommandStorage();
  nodeWrapperStorage: NodeWrapperStorage
  listeners: Set<() => void> = new Set();

  constructor(nodeWrapperStorage: NodeWrapperStorage) {
    this.nodeWrapperStorage = nodeWrapperStorage
  }

  executeCommand(command: CommandInterface) {
    command.execute();

    this.history.addCommand(command)
    this.trash.clearAll()

    this.notify()
  }
  undo() {
    const prevCommand = this.history.getCommand()

    if (!prevCommand) {
      return
    }

    prevCommand.cancel()
    this.trash.addCommand(prevCommand)

    this.notify()
  }
  redo() {
    const nextCommand = this.trash.getCommand()

    if (!nextCommand) {
      return
    }

    nextCommand?.execute()
    this.history.addCommand(nextCommand!)

    this.notify()
  }

  serializeHistory(): any[] {
    // объединяем записи по элементу и типу изменения, если один параметр менялся несколько раз, то оставляем только итоговый
    const commands = this.history.getAll() as Array<UpdateTextCommand | UpdateStyleCommand>;

    function isUpdateStyle(command: any): command is UpdateStyleCommand {
      return command.type === COMMAND_TYPES.UPDATE_STYLE && command.property
    }
    function isUpdateText(command: any): command is UpdateTextCommand {
      return command.type === COMMAND_TYPES.UPDATE_TEXT
    }

    const groupedCommands = commands.reduce((acc: Record<string, CommandJson>, command) => {
      const { type, nodeWrapper, meta, ...values } = command;

      const nodeId = nodeWrapper.id

      if (!acc[nodeId]) {
        acc[nodeId] = {
          id: nodeId,
          type,
          values: {},
          meta: {
            timestamp: meta?.timestamp || Date.now(),
            operatorId: meta?.operatorId || null
          },
          selectors: nodeWrapper.selectors
        };
      }

      if (meta) {
        acc[nodeId].meta = meta;
      }

      if (isUpdateStyle(command)) {
        acc[nodeId].values = {
          ...acc[nodeId].values,
          [command.property]: { previousValue: values.previousValue, nextValue: values.nextValue },
        };
      }
      if (isUpdateText(command)) {
        acc[nodeId].innerText = { previousValue: values.previousValue, nextValue: values.nextValue };
      }

      return acc
    }, {});

    return Object.values(groupedCommands);
  }

  getInstance(type: COMMAND_TYPES_LIST_TYPES) {
    const config = {
      [COMMAND_TYPES.UPDATE_TEXT]: UpdateTextCommand,
      [COMMAND_TYPES.UPDATE_STYLE]: UpdateStyleCommand,
      [COMMAND_TYPES.ADD_ELEMENT]: UpdateStyleCommand,
      [COMMAND_TYPES.DELETE_ELEMENT]: UpdateStyleCommand,
      [COMMAND_TYPES.MOVE_ELEMENT]: MoveCommand,
    }

    return config[type]
  }

  deserializeHistory(jsonArr: CommandJson[]) {
    const commands = jsonArr.map(raw => {
      const type = raw.type;

      if (!COMMAND_TYPES_LIST.includes(type)) {
        throw new Error(`Command type "${type}" is not registered`);
      }
      const commandInstance = this.getInstance(type);

      return commandInstance.fromJSON(raw, this.nodeWrapperStorage);
    }).flat();

    this.history.set(commands)
    this.trash.clearAll();
    this.replayHistory();
  }

  replayHistory() {
    this.history.getAll().forEach(cmd => cmd.execute());

    this.notify()
  }

  clear() {
    this.history.clearAll();
    this.trash.clearAll();

    this.notify()
  }

  getHistory() {
    return this.history.getAll()
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);

    return () => this.unsubscribe(cb);
  }

  unsubscribe(cb: () => void) {
    this.listeners.delete(cb)
  }

  notify() {
    this.listeners.forEach(cb => cb());
  }
}

export class UpdateTextCommand implements UpdateTextCommandItem {
  type = COMMAND_TYPES.UPDATE_TEXT
  nodeWrapper: NodeWrapper
  previousValue: string;
  nextValue: string;
  meta: CommandMeta

  constructor(nodeWrapper: NodeWrapper, previousValue = '', nextValue: string, meta?: CommandMeta) {
    this.nodeWrapper = nodeWrapper
    this.previousValue = previousValue
    this.nextValue = nextValue
    this.meta = {
      timestamp: meta?.timestamp || Date.now(),
      operatorId: meta?.operatorId || null
    }
  }

  execute() {
    this.nodeWrapper.applyTextPatch(this.nextValue)
  }

  cancel() {
    this.nodeWrapper.applyTextPatch(this.previousValue)
  }

  toJSON() { return { type: this.type, id: this.nodeWrapper.id, previousValue: this.previousValue, nextValue: this.nextValue }; }

  static fromJSON(rawCommand: CommandJson, nodeWrapperStorage: NodeWrapperStorage): UpdateTextCommandItem {
    const { id, innerText, meta, selectors } = rawCommand;

    const commandElement = findElementBySelectors(selectors)

    if (!commandElement) {
      throw new Error(`Command id: "${id}" has no element with selectors: ${JSON.stringify(selectors)}`);
    }

    const nodeWrapper = getOrCreateWrapper(nodeWrapperStorage, commandElement);

    if (!innerText) {
      throw new Error(`Command id: "${id}" has no innerText`);
    }

    return new UpdateTextCommand(nodeWrapper, innerText.previousValue, innerText.nextValue, meta);
  }
}

export class UpdateStyleCommand implements UpdateStyleCommandItem {
  type = COMMAND_TYPES.UPDATE_STYLE
  nodeWrapper: NodeWrapper
  previousValue: string;
  nextValue: string;
  property: StylesKeysType;
  meta: CommandMeta

  constructor(nodeWrapper: NodeWrapper, property: StylesKeysType, previousValue = '', nextValue: string, meta?: CommandMeta) {
    this.nodeWrapper = nodeWrapper
    this.previousValue = previousValue
    this.nextValue = nextValue
    this.property = property
    this.meta = {
      timestamp: meta?.timestamp || Date.now(),
      operatorId: meta?.operatorId || null
    }
  }

  execute() {
    this.nodeWrapper.applyStylePatch(this.property, this.nextValue)
  }

  cancel() {
    this.nodeWrapper.applyStylePatch(this.property, this.previousValue)
  }

  toJSON() { return { type: this.type, property: this.property, id: this.nodeWrapper.id, previousValue: this.previousValue, nextValue: this.nextValue }; }

  static fromJSON(rawCommand: CommandJson, nodeWrapperStorage: NodeWrapperStorage): UpdateStyleCommandItem[] {
    const { id, values, meta, selectors } = rawCommand;

    const commandElement = findElementBySelectors(selectors)

    if (!commandElement) {
      throw new Error(`Command id: "${id}" has no element with selectors: ${JSON.stringify(selectors)}`);
    }

    const nodeWrapper = getOrCreateWrapper(nodeWrapperStorage, commandElement);

    if (!values) {
      throw new Error(`Command id: "${id}" has no values`);
    }

    const commands = Object.entries(values).map(([property, value]) => new UpdateStyleCommand(nodeWrapper, property as StylesKeysType, value.previousValue, value.nextValue, meta));

    return commands
  }
}

export class MoveCommand implements MoveCommandItem {
  type = COMMAND_TYPES.MOVE_ELEMENT
  nodeWrapper: NodeWrapper
  source: NodeWrapperInterface
  target: NodeWrapperInterface
  order: DropOrder

  constructor(nodeWrapper: NodeWrapper, source: NodeWrapperInterface, target: NodeWrapperInterface, order: DropOrder) {
    this.nodeWrapper = nodeWrapper
    this.source = source
    this.target = target
    this.order = order
  }

  execute() {
    this.nodeWrapper.applyMovePatch({ source: this.source, target: this.target, order: this.order })
  }

  cancel() {
    this.nodeWrapper.applyMovePatch({ source: this.target, target: this.source, order: this.order })
  }

  toJSON() { return { type: this.type, id: this.nodeWrapper.id, source: this.source.id, target: this.target.id, order: this.order }; }

  static fromJSON(rawCommand: CommandJson, nodeWrapperStorage: NodeWrapperStorage): UpdateStyleCommandItem[] {
    const { id, values, meta, selectors } = rawCommand;

    const commandElement = findElementBySelectors(selectors)

    if (!commandElement) {
      throw new Error(`Command id: "${id}" has no element with selectors: ${JSON.stringify(selectors)}`);
    }

    const nodeWrapper = getOrCreateWrapper(nodeWrapperStorage, commandElement);

    if (!values) {
      throw new Error(`Command id: "${id}" has no values`);
    }

    const commands = Object.entries(values).map(([property, value]) => new UpdateStyleCommand(nodeWrapper, property as StylesKeysType, value.previousValue, value.nextValue, meta));

    return commands
  }
}

// export class AddElementCommand implements Command {
//   private selector: string;
//   private html: string;
//   private position: 'append' | 'before' | 'after';
//   private insertedNode: HTMLElement | null = null;

//   constructor(selector: string, html: string, position: 'append' | 'before' | 'after') {
//     this.selector = selector;
//     this.html = html;
//     this.position = position;
//   }

//   execute() {
//     const parent = document.querySelector<HTMLElement>(this.selector);
//     if (!parent) return;
//     const template = document.createElement('template');
//     template.innerHTML = this.html.trim();
//     const node = template.content.firstElementChild as HTMLElement;
//     if (!node) return;
//     switch (this.position) {
//       case 'append':
//         parent.appendChild(node);
//         break;
//       case 'before':
//         parent.parentElement?.insertBefore(node, parent);
//         break;
//       case 'after':
//         parent.parentElement?.insertBefore(node, parent.nextSibling);
//         break;
//     }
//     this.insertedNode = node;
//   }

//   undo() {
//     if (this.insertedNode && this.insertedNode.parentElement) {
//       this.insertedNode.parentElement.removeChild(this.insertedNode);
//       this.insertedNode = null;
//     }
//   }

//   toJSON(): AddElementData & { type: string } {
//     return {
//       type: 'AddElement',
//       selector: this.selector,
//       html: this.html,
//       position: this.position,
//     };
//   }

//   static fromJSON(raw: any): AddElementCommand {
//     const { selector, html, position } = raw as AddElementData;
//     return new AddElementCommand(selector, html, position);
//   }
// }