import type { OperationV1 } from '@lykar/protocol';

import { createOperationId } from './operation-id.js';
import { buildTargetDescriptor } from './target-builder.js';

export type EditorProposal = {
  id: string;
  source: 'dummy' | 'agent';
  title: string;
  description: string;
  operations: OperationV1[];
};

export interface ProposalProvider {
  propose(element: Element): Promise<EditorProposal>;
}

export class DummyProposalProvider implements ProposalProvider {
  async propose(element: Element): Promise<EditorProposal> {
    return {
      id: createOperationId('proposal'),
      source: 'dummy',
      title: 'Выделить выбранный блок',
      description: 'Демонстрационное предложение: добавить фиолетовый outline. Внешний AI API не вызывается.',
      operations: [{
        schemaVersion: 1,
        id: createOperationId('proposal-style'),
        kind: 'setStyle',
        target: buildTargetDescriptor(element),
        property: 'outline',
        value: '2px solid #8b5cf6',
        meta: {
          createdAt: new Date().toISOString(),
          actor: { type: 'agent', id: 'dummy' },
        },
      }],
    };
  }
}
