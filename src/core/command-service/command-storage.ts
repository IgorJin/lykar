import { CommandInterface } from './command-types'

export class CommandStorage {
  private commands: CommandInterface[] = [];

  addCommand(command: CommandInterface) {
    this.commands = [...this.commands, command];
  }

  getCommand() {
    const lastCommand = this.commands[this.commands.length - 1];

    this.commands = this.commands.slice(0, -1);

    return lastCommand
  }

  getAll(): readonly CommandInterface[] {
    return this.commands
  }

  clearAll() {
    this.commands = [];
  }

  set(commands: CommandInterface[]) {
    this.commands = commands;
  }
}