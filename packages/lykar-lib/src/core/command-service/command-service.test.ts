import { beforeEach, describe, expect, it } from 'vitest';

import { NodeWrapper, NodeWrapperStorage } from '../node-wrapper';
import {
  CommandService,
  UpdateStyleCommand,
  UpdateTextCommand,
} from './command-service';
import { COMMAND_TYPES } from './command-types';

function createTarget() {
  document.body.innerHTML = '<p id="target">Before</p>';
  const element = document.querySelector<HTMLElement>('#target');

  if (!element) {
    throw new Error('Test target was not created');
  }

  return element;
}

describe('CommandService persistence baseline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps text and style changes separate and compacts repeated values', () => {
    const element = createTarget();
    const wrapper = new NodeWrapper(element);
    wrapper.selectors = { css: '#target', xpath: '//*[@id="target"]' };

    const storage = new NodeWrapperStorage();
    storage.push(wrapper);
    const service = new CommandService(storage);

    service.executeCommand(new UpdateTextCommand(wrapper, 'Before', 'Middle'));
    service.executeCommand(new UpdateStyleCommand(wrapper, 'color', '', 'red'));
    service.executeCommand(new UpdateTextCommand(wrapper, 'Middle', 'After'));
    service.executeCommand(new UpdateStyleCommand(wrapper, 'color', 'red', 'blue'));

    const serialized = service.serializeHistory();
    const text = serialized.find(command => command.type === COMMAND_TYPES.UPDATE_TEXT);
    const style = serialized.find(command => command.type === COMMAND_TYPES.UPDATE_STYLE);

    expect(serialized).toHaveLength(2);
    expect(text?.innerText).toEqual({ previousValue: 'Before', nextValue: 'After' });
    expect(style?.values?.color).toEqual({ previousValue: '', nextValue: 'blue' });
  });

  it('replays serialized text and style changes on a fresh wrapper storage', () => {
    const element = createTarget();
    const storage = new NodeWrapperStorage();
    const service = new CommandService(storage);

    service.deserializeHistory([
      {
        id: 'text-command',
        type: COMMAND_TYPES.UPDATE_TEXT,
        meta: { timestamp: 1, operatorId: null },
        selectors: { css: '#target', xpath: '//*[@id="target"]' },
        innerText: { previousValue: 'Before', nextValue: 'After' },
      },
      {
        id: 'style-command',
        type: COMMAND_TYPES.UPDATE_STYLE,
        meta: { timestamp: 2, operatorId: null },
        selectors: { css: '#target', xpath: '//*[@id="target"]' },
        values: {
          color: { previousValue: '', nextValue: 'blue' },
        },
      },
    ]);

    expect(element.textContent).toBe('After');
    expect(element.style.color).toBe('blue');
    expect(service.getHistory()).toHaveLength(2);
  });

  it('supports undo and redo for an executed text command', () => {
    const element = createTarget();
    const wrapper = new NodeWrapper(element);
    const service = new CommandService(new NodeWrapperStorage());

    service.executeCommand(new UpdateTextCommand(wrapper, 'Before', 'After'));
    expect(element.textContent).toBe('After');

    service.undo();
    expect(element.textContent).toBe('Before');

    service.redo();
    expect(element.textContent).toBe('After');
  });
});
