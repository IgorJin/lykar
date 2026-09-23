export type JournalState = Record<string, string | number | boolean | null>;

export type CompensationDiagnostic = {
  operationId: string;
  status: 'restored' | 'preserved' | 'failed';
  code: 'COMPENSATED' | 'HOST_MUTATION_PRESERVED' | 'COMPENSATION_FAILED';
  message: string;
  reloadRecommended: boolean;
};

export type JournalEntrySnapshot = {
  operationId: string;
  mutation: string;
  before: JournalState;
  after: JournalState;
};

type JournalEntry = JournalEntrySnapshot & {
  compensate: () => CompensationDiagnostic;
};

/** In-memory only. Closures and DOM references are never exposed to protocol/storage. */
export class MutationJournal {
  private readonly entries: JournalEntry[] = [];

  constructor(private readonly onDiagnostic?: (diagnostic: CompensationDiagnostic) => void) {}

  checkpoint(): number {
    return this.entries.length;
  }

  record(entry: JournalEntry): void {
    this.entries.push(entry);
  }

  snapshots(): JournalEntrySnapshot[] {
    return this.entries.map(({operationId, mutation, before, after}) => ({operationId, mutation, before, after}));
  }

  compensateFrom(checkpoint: number): CompensationDiagnostic[] {
    const start = Math.max(0, Math.min(checkpoint, this.entries.length));
    const selected = this.entries.splice(start);
    return this.compensate(selected);
  }

  compensateAll(): CompensationDiagnostic[] {
    return this.compensate(this.entries.splice(0));
  }

  get size(): number {
    return this.entries.length;
  }

  private compensate(entries: JournalEntry[]): CompensationDiagnostic[] {
    const diagnostics: CompensationDiagnostic[] = [];
    for (const entry of entries.reverse()) {
      let diagnostic: CompensationDiagnostic;
      try {
        diagnostic = entry.compensate();
      } catch (error) {
        diagnostic = {
          operationId: entry.operationId,
          status: 'failed',
          code: 'COMPENSATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          reloadRecommended: true,
        };
      }
      diagnostics.push(diagnostic);
      try { this.onDiagnostic?.(diagnostic); } catch { /* Diagnostics cannot interrupt cleanup. */ }
    }
    return diagnostics;
  }
}

export function restored(operationId: string, message: string): CompensationDiagnostic {
  return {
    operationId,
    status: 'restored',
    code: 'COMPENSATED',
    message,
    reloadRecommended: false,
  };
}

export function preserveHostMutation(operationId: string, message: string): CompensationDiagnostic {
  return {
    operationId,
    status: 'preserved',
    code: 'HOST_MUTATION_PRESERVED',
    message,
    reloadRecommended: true,
  };
}
