import { NodeWrapperInterface, NodeWrapper, NodeWrapperStorage } from '../node-wrapper'
import { StyleType } from '@/components/styles-section/styles-config'
import { CommandStorage } from './command-storage'
import { CommandInterface, COMMAND_TYPES, COMMAND_TYPES_LIST, COMMAND_TYPES_LIST_TYPES } from './command-types'


export class CommandService {
  private history: CommandStorage = new CommandStorage();
  private trash: CommandStorage = new CommandStorage();
  nodeWrapperStorage: NodeWrapperStorage

  constructor(nodeWrapperStorage: NodeWrapperStorage) {
    this.nodeWrapperStorage = nodeWrapperStorage
  }

  executeCommand(command: CommandInterface) {
    command.execute();

    this.history.addCommand(command)
    this.trash.clearAll()
  }
  undo() {
    const prevCommand = this.history.getCommand()

    if (!prevCommand) {
      return
    }

    prevCommand.cancel()
    this.trash.addCommand(prevCommand)
  }
  redo() {
    const nextCommand = this.trash.getCommand()

    if (!nextCommand) {
      return
    }

    nextCommand?.execute()
    this.history.addCommand(nextCommand!)
  }

  serializeHistory(): any[] {
    return this.history.getAll().map(cmd => cmd.toJSON());
  }

  getInstance(type: COMMAND_TYPES_LIST_TYPES) {
    const config = {
      [COMMAND_TYPES.UPDATE_TEXT]: UpdateTextCommand,
      [COMMAND_TYPES.UPDATE_STYLE]: UpdateStyleCommand,
      [COMMAND_TYPES.ADD_ELEMENT]: UpdateStyleCommand,
      [COMMAND_TYPES.DELETE_ELEMENT]: UpdateStyleCommand,
      [COMMAND_TYPES.EDIT_LOCATION]: UpdateStyleCommand
    }

    return config[type]
  }

  deserializeHistory(jsonArr: any[]) {
    const commands = jsonArr.map(raw => {
      const type = raw.type;

      if (!COMMAND_TYPES_LIST.includes(type)) {
        throw new Error(`Command type "${type}" is not registered`);
      }
      const commandInstance = this.getInstance(type);

      return commandInstance.fromJSON(raw, this.nodeWrapperStorage);
    });

    this.history.set(commands)
    this.trash.clearAll();
  }

  replayHistory() {
    this.history.getAll().forEach(cmd => cmd.execute());
  }

  clear() {
    this.history.clearAll();
    this.trash.clearAll();
  }
}

export class UpdateTextCommand implements CommandInterface {
  type = COMMAND_TYPES.UPDATE_TEXT
  nodeWrapper: NodeWrapper
  previousValue: string;
  nextValue: string;

  constructor(nodeWrapper: NodeWrapper, previousValue = '', nextValue: string) {
    this.nodeWrapper = nodeWrapper
    this.previousValue = previousValue
    this.nextValue = nextValue
  }

  execute() {
    this.nodeWrapper.applyTextPatch(this.nextValue)
  }

  cancel() {
    this.nodeWrapper.applyTextPatch(this.previousValue)
  }

  toJSON() { return { type: this.type, id: this.nodeWrapper.id, previousValue: this.previousValue, nextValue: this.nextValue }; }

  static fromJSON(rawCommand: any, nodeWrapperStorage: NodeWrapperStorage): UpdateTextCommand {
    const { id, previousValue, nextValue } = rawCommand;
    const nodeWrapper = nodeWrapperStorage.getById(id)!;

    return new UpdateTextCommand(nodeWrapper, previousValue, nextValue);
  }
}

export class UpdateStyleCommand implements CommandInterface {
  type = COMMAND_TYPES.UPDATE_STYLE
  nodeWrapper: NodeWrapper
  previousValue: string;
  nextValue: string;
  property: string;

  constructor(nodeWrapper: NodeWrapper, property: string, previousValue = '', nextValue: string) {
    this.nodeWrapper = nodeWrapper
    this.previousValue = previousValue
    this.nextValue = nextValue
    this.property = property
  }

  execute() {
    this.nodeWrapper.applyStylePatch(this.property, this.nextValue)
  }

  cancel() {
    this.nodeWrapper.applyStylePatch(this.property, this.previousValue)
  }

  toJSON() { return { type: this.type, id: this.nodeWrapper.id, previousValue: this.previousValue, nextValue: this.nextValue }; }

  static fromJSON(rawCommand: any, nodeWrapperStorage: NodeWrapperStorage): UpdateStyleCommand {
    const { id, previousValue, nextValue, property } = rawCommand;
    const nodeWrapper = nodeWrapperStorage.getById(id)!;

    return new UpdateStyleCommand(nodeWrapper, property, previousValue, nextValue);
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