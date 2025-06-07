import { CommandInterface } from './command-types'

export class CommandStorage {
  private commands: CommandInterface[] = [];

  addCommand(command: CommandInterface) {
    this.commands.push(command);
  }

  getCommand() {
    return this.commands.pop()
  }

  getAll() {
    return this.commands
  }

  clearAll() {
    this.commands = [];
  }

  set(commands: CommandInterface[]) {
    this.commands = commands;
  }
}