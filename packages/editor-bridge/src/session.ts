import type { OperationV1, SerializedNode, SourceSnapshotV1, TargetDescriptor } from '@lykar/protocol';
import { isSourceSnapshotV1, validateOperationV1 } from '@lykar/protocol';
import { applyOperation, captureSourceSnapshot, ReplayLedger, resolveTarget, sha256Text } from '@lykar/runtime';
import type { OperationApplyResult } from '@lykar/runtime';

import { createOperationId } from './operation-id.js';
import { buildTargetDescriptor, serializeEditableElement } from './target-builder.js';

export type EditorPageRef = { origin: string; pathname: string; url: string };
export type EditorPageDraft = { page: EditorPageRef; operations: OperationV1[] };
export type EditorApplyBatch = { id?: string; operations: OperationV1[] };
export type EditorApplyReport = {
  batchId: string;
  page: EditorPageRef;
  applied: number;
  skipped: number;
  errors: number;
  operations: OperationApplyResult[];
};
export type GroupedPreviewOperationReport = {
  result: OperationApplyResult;
  rollback: 'not-needed' | 'not-applied' | 'restored' | 'failed';
  rollbackMessage?: string;
};
export type EditorGroupedPreviewReport = {
  batchId: string;
  page: EditorPageRef;
  outcome: 'applied' | 'rolled-back' | 'rollback-incomplete' | 'rejected';
  /** Number of operations accepted as a whole group; always zero when outcome is not `applied`. */
  applied: number;
  skipped: number;
  errors: number;
  rolledBack: number;
  unrestored: number;
  failure?: {operationId?: string; code: string; message: string};
  rollbackFailures: Array<{operationId: string; message: string}>;
  operations: GroupedPreviewOperationReport[];
};
export type EditorChange = {
  id: string;
  operation: OperationV1;
  nodeElement: Element | null;
  status: OperationApplyResult['status'];
  code?: string;
  message?: string;
  targetResolution?: OperationApplyResult['targetResolution'];
  resolutionEvidence?: OperationApplyResult['resolutionEvidence'];
  committed: boolean;
};
export type EditorSessionState = {
  canUndo: boolean;
  canRedo: boolean;
  appliedBatches: number;
  operationCount: number;
  pendingOperationCount: number;
};
export type EditorSessionOptions = {
  storage?: Storage | null;
  storageKey?: string;
  sourceSnapshot?: SourceSnapshotV1;
  root?: Document | Element;
};
export type PendingSaveBatch = {
  idempotencyKey: string;
  expectedRevision: number;
  operations: OperationV1[];
  sourceSnapshot: SourceSnapshotV1;
};

type AppliedRecord = EditorChange & {
  key?: string;
  undo: () => boolean;
  inverse?: () => OperationV1 | null | Promise<OperationV1 | null>;
  beforeStyle?: {value: string; priority: '' | 'important'};
  afterStyle?: {value: string; priority: '' | 'important'};
};
type AppliedBatch = { id: string; records: AppliedRecord[] };
type UndoAction = { undo: () => boolean; inverse?: () => OperationV1 | null | Promise<OperationV1 | null>; afterStyle?: AppliedRecord['afterStyle'] };
type UndoCapture = { element: Element | null; finalize: () => UndoAction; beforeStyle?: AppliedRecord['beforeStyle'] };

export class EditorSession {
  readonly page: EditorPageRef;

  private readonly document: Document;
  private readonly root: Document | Element;
  private readonly history: AppliedBatch[] = [];
  private readonly redoStack: AppliedBatch[] = [];
  private readonly listeners = new Set<(state: EditorSessionState) => void>();
  private readonly changeListeners = new Set<(changes: EditorChange[]) => void>();
  private readonly storage: Storage | null;
  private readonly storageKey: string;
  private readonly sourceSnapshotPromise: Promise<SourceSnapshotV1>;
  private readonly ledger: ReplayLedger;
  private inFlightSave: PendingSaveBatch | null = null;
  private recoveryWarningMessage?: string;

  constructor(document: Document, options: EditorSessionOptions = {}) {
    this.document = document;
    this.root = options.root ?? document;
    const location = document.defaultView?.location;
    const origin = location?.origin ?? 'null';
    const pathname = location?.pathname || '/';
    this.page = { origin, pathname, url: `${origin}${pathname}` };
    this.sourceSnapshotPromise = options.sourceSnapshot
      ? Promise.resolve(options.sourceSnapshot)
      : captureSourceSnapshot(document, this.root);
    this.storage = options.storage ?? null;
    this.storageKey = options.storageKey ?? `lykar:draft:${this.page.url}`;
    this.ledger = new ReplayLedger(document, this.root, {
      projectId: 'editor',
      pageId: this.page.url,
      releaseId: this.storageKey,
    });
  }

  sourceSnapshot(): Promise<SourceSnapshotV1> {
    return this.sourceSnapshotPromise;
  }

  async restore(committedOperations: OperationV1[] = [], signal?: AbortSignal): Promise<EditorApplyReport | null> {
    // Read pending edits before remote replay can update their storage key.
    let pending: OperationV1[] = [];
    try {
      const raw = this.storage?.getItem(this.storageKey);
      const value = raw ? JSON.parse(raw) as { operations?: unknown; inFlight?: unknown } : null;
      if (Array.isArray(value?.operations)) {
        const committedIds = new Set(committedOperations.map(operation => operation.id));
        pending = value.operations.filter(operation => validateOperationV1(operation).ok && !committedIds.has(operation.id));
        if (value.inFlight !== undefined) {
          const recovered = parsePendingSaveBatch(value.inFlight);
          if (recovered) {
            const savedIds = new Set(committedOperations.map(operation => operation.id));
            const recoveredIds = recovered.operations.map(operation => operation.id);
            if (recoveredIds.every(id => savedIds.has(id))) this.inFlightSave = null;
            else {
              this.inFlightSave = recovered;
              if (recoveredIds.some(id => savedIds.has(id))) {
                this.recoveryWarningMessage = 'Сохранение восстановлено частично; требуется ручная проверка конфликта.';
              }
            }
          } else {
            this.recoveryWarningMessage = 'Локальное состояние сохранения повреждено; автоматический retry отключён.';
          }
        }
      }
    } catch {
      this.recoveryWarningMessage = 'Локальное состояние восстановления недоступно или повреждено.';
      try { this.storage?.removeItem(this.storageKey); } catch { /* Keep the warning. */ }
    }

    const batchId = createOperationId('restore');
    const remote = await this.runBatch(batchId, committedOperations, undefined, undefined, signal);
    for (const record of remote.records) record.committed = true;
    if (remote.records.length > 0) this.history.push({id: `${batchId}:remote`, records: remote.records});
    const local = await this.runBatch(batchId, pending, undefined, undefined, signal);
    const records = [...remote.records, ...local.records];
    if (local.records.length > 0) this.history.push({id: `${batchId}:local`, records: local.records});
    if (records.length > 0) this.redoStack.length = 0;
    this.changed();
    return records.length ? reportFor(batchId, this.page, records.map(record => resultFrom(record))) : null;
  }

  async preview(operation: OperationV1, key?: string, nodeElement?: Element | null): Promise<EditorApplyReport> {
    if (key) this.removeReplaceableChange(key);
    const batchId = createOperationId('change');
    const appliedBatch = await this.runBatch(batchId, [operation], key, nodeElement);
    this.history.push(appliedBatch);
    this.redoStack.length = 0;
    this.changed();
    return reportFor(batchId, this.page, appliedBatch.records.map(record => resultFrom(record)));
  }

  /**
   * Preview a related set of style operations as one history unit. Any rejected
   * member stops the group and triggers reverse-order compare-and-restore for
   * all members that may have changed the DOM. A failed restore is reported;
   * the group is never added to history or pending-save state on failure.
   */
  async previewGroup(
    operations: OperationV1[],
    options: {id?: string; key?: string; signal?: AbortSignal} = {},
  ): Promise<EditorGroupedPreviewReport> {
    const batchId = options.id ?? createOperationId('preview-group');
    const members = [...operations];
    const results: GroupedPreviewOperationReport[] = [];
    const attempted: Array<{
      record: AppliedRecord;
      report: GroupedPreviewOperationReport;
      rollbackReady: boolean;
      rollbackSetupError?: string;
    }> = [];
    const outcomes = new Map(
      this.history.flatMap(batch => batch.records).map(record => [record.operation.id, record] as const),
    );
    let failure: EditorGroupedPreviewReport['failure'];

    if (members.length === 0) {
      return groupedPreviewReport(batchId, this.page, 'rejected', results, 0, 0, {
        code: 'EMPTY_GROUP',
        message: 'A grouped preview requires at least one style operation.',
      });
    }
    if (options.key) this.removeReplaceableChange(options.key);

    const appendNotAttempted = (start: number, code: string, message: string): void => {
      for (let index = start; index < members.length; index += 1) {
        const operation = members[index];
        results.push({
          result: {
            operationId: operation.id || 'invalid',
            kind: operation.kind,
            target: operation.target,
            status: 'skipped',
            code,
            message,
          },
          rollback: 'not-applied',
        });
      }
    };

    for (let index = 0; index < members.length; index += 1) {
      const operation = members[index];
      if (options.signal?.aborted) {
        failure = {operationId: operation.id, code: 'ABORTED', message: 'Grouped preview was aborted before this member was applied.'};
        appendNotAttempted(index, 'GROUP_ABORTED', failure.message);
        break;
      }

      const validation = validateOperationV1(operation);
      if (!validation.ok) {
        failure = {operationId: operation.id, code: 'INVALID_OPERATION', message: validation.errors.join('; ')};
        results.push({
          result: {operationId: operation.id || 'invalid', kind: operation.kind, target: operation.target, status: 'error', code: failure.code, message: failure.message},
          rollback: 'not-applied',
        });
        appendNotAttempted(index + 1, 'GROUP_ABORTED', 'Not applied because an earlier group member failed.');
        break;
      }
      if (operation.kind !== 'setStyle') {
        failure = {operationId: operation.id, code: 'GROUP_ONLY_SET_STYLE', message: 'Grouped preview accepts setStyle operations only.'};
        results.push({
          result: {operationId: operation.id, kind: operation.kind, target: operation.target, status: 'error', code: failure.code, message: failure.message},
          rollback: 'not-applied',
        });
        appendNotAttempted(index + 1, 'GROUP_ABORTED', 'Not applied because an earlier group member failed.');
        break;
      }

      const unavailable = (operation.dependsOn ?? []).find(dependency => {
        const outcome = outcomes.get(dependency);
        return !outcome || (outcome.status !== 'applied' && outcome.code !== 'OPERATION_ALREADY_APPLIED');
      });
      if (unavailable) {
        failure = {
          operationId: operation.id,
          code: 'DEPENDENCY_UNAVAILABLE',
          message: `Dependency ${unavailable} did not complete successfully.`,
        };
        results.push({
          result: {operationId: operation.id, kind: operation.kind, target: operation.target, status: 'skipped', code: failure.code, message: failure.message},
          rollback: 'not-applied',
        });
        appendNotAttempted(index + 1, 'GROUP_ABORTED', 'Not applied because an earlier group member failed.');
        break;
      }

      let capture: UndoCapture | undefined;
      let applyStarted = false;
      try {
        capture = await captureUndo(this.document, operation, this.root, this.ledger);
        options.signal?.throwIfAborted();
        applyStarted = true;
        const result = await applyOperation(this.document, operation, {root: this.root, signal: options.signal, ledger: this.ledger});
        const action = result.status === 'applied' ? capture.finalize() : {undo: () => false};
        const record: AppliedRecord = {
          id: operation.id,
          operation,
          nodeElement: capture.element,
          status: result.status,
          code: result.code,
          message: result.message,
          targetResolution: result.targetResolution,
          resolutionEvidence: result.resolutionEvidence,
          committed: false,
          key: options.key,
          undo: action.undo,
          ...(action.inverse ? {inverse: action.inverse} : {}),
          ...(capture.beforeStyle ? {beforeStyle: capture.beforeStyle} : {}),
          ...(action.afterStyle ? {afterStyle: action.afterStyle} : {}),
        };
        const operationReport: GroupedPreviewOperationReport = {
          result: resultFrom(record),
          rollback: result.status === 'applied' ? 'not-needed' : 'not-applied',
        };
        results.push(operationReport);
        outcomes.set(operation.id, record);
        if (result.status === 'applied') attempted.push({record, report: operationReport, rollbackReady: true});
        else {
          failure = {
            operationId: operation.id,
            code: result.code ?? (result.status === 'skipped' ? 'GROUP_MEMBER_SKIPPED' : 'GROUP_MEMBER_FAILED'),
            message: result.message ?? `Group member returned ${result.status}.`,
          };
          appendNotAttempted(index + 1, 'GROUP_ABORTED', 'Not applied because an earlier group member failed.');
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        let action: UndoAction = {undo: () => false};
        let rollbackSetupError: string | undefined;
        if (applyStarted && capture) {
          try { action = capture.finalize(); }
          catch (captureError) {
            rollbackSetupError = captureError instanceof Error ? captureError.message : String(captureError);
          }
        }
        const code = options.signal?.aborted ? 'ABORTED' : rollbackSetupError ? 'ROLLBACK_CAPTURE_FAILED' : 'GROUP_MEMBER_THROWN';
        const record: AppliedRecord = {
          id: operation.id,
          operation,
          nodeElement: capture?.element ?? null,
          status: 'error',
          code,
          message,
          committed: false,
          undo: action.undo,
          ...(action.inverse ? {inverse: action.inverse} : {}),
          ...(capture?.beforeStyle ? {beforeStyle: capture.beforeStyle} : {}),
          ...(action.afterStyle ? {afterStyle: action.afterStyle} : {}),
        };
        const operationReport: GroupedPreviewOperationReport = {
          result: resultFrom(record),
          rollback: applyStarted ? 'failed' : 'not-applied',
          ...(rollbackSetupError ? {rollbackMessage: `Could not prepare compare-and-restore: ${rollbackSetupError}`} : {}),
        };
        results.push(operationReport);
        if (applyStarted) attempted.push({
          record,
          report: operationReport,
          rollbackReady: !rollbackSetupError,
          ...(rollbackSetupError ? {rollbackSetupError} : {}),
        });
        outcomes.set(operation.id, record);
        failure = {operationId: operation.id, code, message};
        appendNotAttempted(index + 1, 'GROUP_ABORTED', 'Not applied because an earlier group member failed.');
        break;
      }
    }

    if (!failure) {
      const batch: AppliedBatch = {id: batchId, records: attempted.map(member => member.record)};
      this.history.push(batch);
      this.redoStack.length = 0;
      this.changed();
      return groupedPreviewReport(batchId, this.page, 'applied', results, members.length, 0);
    }

    let rolledBack = 0;
    const rollbackFailures: Array<{operationId: string; message: string}> = [];
    for (const member of [...attempted].reverse()) {
      const operationId = member.record.operation.id;
      const report = member.report;
      if (!member.rollbackReady) {
        const message = `Could not prepare compare-and-restore: ${member.rollbackSetupError ?? 'rollback action unavailable.'}`;
        if (report) {
          report.rollback = 'failed';
          report.rollbackMessage = message;
        }
        rollbackFailures.push({operationId, message});
        continue;
      }
      try {
        if (member.record.undo()) {
          rolledBack += 1;
          if (report) report.rollback = 'restored';
        } else {
          const message = 'The current style no longer matches the previewed value; compare-and-restore left it untouched.';
          if (report) {
            report.rollback = 'failed';
            report.rollbackMessage = message;
          }
          rollbackFailures.push({operationId, message});
        }
      } catch (error) {
        const message = `Compare-and-restore threw: ${error instanceof Error ? error.message : String(error)}`;
        if (report) {
          report.rollback = 'failed';
          report.rollbackMessage = message;
        }
        rollbackFailures.push({operationId, message});
      }
    }

    // A failed group is never added to history/pending-save state. The report
    // exposes any host-mutation conflict that prevented a complete rollback.
    this.changed();
    const outcome = rollbackFailures.length > 0 ? 'rollback-incomplete' : 'rolled-back';
    return groupedPreviewReport(batchId, this.page, outcome, results, 0, rolledBack, failure, rollbackFailures);
  }

  async apply(batch: EditorApplyBatch): Promise<EditorApplyReport> {
    const batchId = batch.id ?? createOperationId('batch');
    const appliedBatch = await this.runBatch(batchId, batch.operations);
    if (appliedBatch.records.length > 0) {
      this.history.push(appliedBatch);
      this.redoStack.length = 0;
    }
    this.changed();
    return reportFor(batchId, this.page, appliedBatch.records.map(record => resultFrom(record)));
  }

  undo(): boolean {
    const batch = this.history.at(-1);
    if (!batch || batch.records.every(record => record.committed)) return false;
    if (batch.records.length > 1 && batch.records.every(record => record.operation.kind === 'setStyle')) {
      for (const record of batch.records) {
        if (record.status !== 'applied') continue;
        if (record.operation.kind !== 'setStyle') return false;
        const style = (record.nodeElement as (Element & {style?: CSSStyleDeclaration}) | null)?.style;
        const property = normalizeStyleProperty(record.operation.property);
        if (!style || !record.afterStyle
          || style.getPropertyValue(property) !== record.afterStyle.value
          || style.getPropertyPriority(property) !== record.afterStyle.priority) return false;
      }
    }
    this.history.pop();
    for (const record of [...batch.records].reverse()) {
      if (!record.committed && record.status === 'applied') record.undo();
    }
    const committed = batch.records.filter(record => record.committed);
    if (committed.length) this.history.push({ id: batch.id, records: committed });
    this.redoStack.push({ id: batch.id, records: batch.records.filter(record => !record.committed) });
    this.changed();
    return true;
  }

  async undoCommitted(): Promise<EditorApplyReport | null> {
    const records = this.history.flatMap(batch => batch.records);
    let record: AppliedRecord | undefined;
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const candidate = records[index];
      if (candidate.committed && candidate.status === 'applied' && candidate.inverse) {
        record = candidate;
        break;
      }
    }
    if (!record?.inverse) return null;
    const inverse = await record.inverse();
    if (!inverse) return null;
    return this.apply({id: createOperationId('undo-saved'), operations: [inverse]});
  }

  async repair(operationId: string, element: Element): Promise<EditorApplyReport> {
    const changes = this.history.flatMap(batch => batch.records);
    const originalIndex = changes.findIndex(change => change.operation.id === operationId);
    if (originalIndex < 0) throw new Error(`Изменение ${operationId} не найдено.`);
    const original = changes[originalIndex];
    if (original.status === 'applied') throw new Error('Repair доступен только для неприменённого изменения.');

    const replacementIds = new Map<string, string>();
    replacementIds.set(original.operation.id, createOperationId('repair'));
    const operations: OperationV1[] = [];
    for (const record of changes.slice(originalIndex)) {
      const isOriginal = record.operation.id === original.operation.id;
      const dependsOnRepair = isOriginal || operationReferencesAny(record.operation, replacementIds);
      if (!dependsOnRepair) continue;
      const id = replacementIds.get(record.operation.id) ?? createOperationId('repair-chain');
      replacementIds.set(record.operation.id, id);
      operations.push(reviseOperationForRepair(
        record.operation,
        id,
        replacementIds,
        isOriginal ? buildTargetDescriptor(element) : undefined,
        isOriginal ? record.code : undefined,
      ));
    }
    return this.apply({id: createOperationId('repair-preview'), operations});
  }

  async redo(): Promise<EditorApplyReport | null> {
    const batch = this.redoStack.pop();
    if (!batch) return null;
    const replayed = await this.runBatch(batch.id, batch.records.map(record => record.operation));
    if (replayed.records.length > 0) this.history.push(replayed);
    this.changed();
    return reportFor(batch.id, this.page, replayed.records.map(record => resultFrom(record)));
  }

  exportDraft(): EditorPageDraft {
    return { page: this.page, operations: this.history.flatMap(batch => batch.records.map(record => record.operation)) };
  }

  pendingOperations(): OperationV1[] {
    return this.history.flatMap(batch => batch.records.filter(record => !record.committed).map(record => record.operation));
  }

  styleBaseline(element: Element, property: string): {value: string; priority: '' | 'important'} | null {
    const normalized = normalizeStyleProperty(property);
    const records = this.history.flatMap(batch => batch.records).filter(record =>
      record.status === 'applied'
      && record.nodeElement === element
      && record.operation.kind === 'setStyle'
      && normalizeStyleProperty(record.operation.property) === normalized,
    );
    const first = records[0];
    const last = records.at(-1);
    const style = (element as HTMLElement).style;
    if (!first?.beforeStyle || !last?.afterStyle || !style) return null;
    if (style.getPropertyValue(normalized) !== last.afterStyle.value
      || style.getPropertyPriority(normalized) !== last.afterStyle.priority) return null;
    return first.beforeStyle;
  }

  isStyleDirty(element: Element, property: string): boolean {
    const baseline = this.styleBaseline(element, property);
    const style = (element as HTMLElement).style;
    return Boolean(baseline && style && (
      style.getPropertyValue(property) !== baseline.value
      || style.getPropertyPriority(property) !== baseline.priority
    ));
  }

  pendingSaveBatch(): PendingSaveBatch | null {
    return this.inFlightSave;
  }

  beginSave(batch: PendingSaveBatch): void {
    if (!this.storage) {
      throw new Error('Нельзя безопасно сохранить: sessionStorage для recovery недоступен.');
    }
    this.inFlightSave = batch;
    this.persistRecovery(true);
  }

  completeSave(operationIds: Iterable<string>): void {
    const ids = new Set(operationIds);
    for (const batch of this.history) {
      for (const record of batch.records) {
        if (ids.has(record.operation.id)) record.committed = true;
      }
    }
    this.inFlightSave = null;
    this.changed();
  }

  resolveSaveConflict(committedOperations: OperationV1[]): void {
    const committedIds = new Set(committedOperations.map(operation => operation.id));
    for (const batch of this.history) {
      for (const record of batch.records) {
        if (committedIds.has(record.operation.id)) record.committed = true;
      }
    }
    this.inFlightSave = null;
    this.changed();
  }

  recoveryWarning(): string | undefined {
    return this.recoveryWarningMessage;
  }

  markCommitted(operationIds: Iterable<string>): void {
    const ids = new Set(operationIds);
    for (const batch of this.history) {
      for (const record of batch.records) {
        if (ids.has(record.operation.id)) record.committed = true;
      }
    }
    this.changed();
  }

  getChanges(): EditorChange[] {
    return this.history.flatMap(batch => batch.records.map(({
      undo: _undo,
      inverse: _inverse,
      key: _key,
      ...change
    }) => change));
  }

  getState(): EditorSessionState {
    const changes = this.getChanges();
    return {
      canUndo: this.history.some(batch => batch.records.some(record => !record.committed))
        || this.history.some(batch => batch.records.some(record => record.committed && record.status === 'applied' && record.inverse)),
      canRedo: this.redoStack.length > 0,
      appliedBatches: this.history.length,
      operationCount: changes.length,
      pendingOperationCount: changes.filter(change => !change.committed).length,
    };
  }

  subscribe(listener: (state: EditorSessionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  subscribeChanges(listener: (changes: EditorChange[]) => void): () => void {
    this.changeListeners.add(listener);
    listener(this.getChanges());
    return () => this.changeListeners.delete(listener);
  }

  clear(): void {
    this.history.length = 0;
    this.redoStack.length = 0;
    this.inFlightSave = null;
    this.storage?.removeItem(this.storageKey);
    this.notify();
  }

  private removeReplaceableChange(key: string): void {
    for (let batchIndex = this.history.length - 1; batchIndex >= 0; batchIndex--) {
      const batch = this.history[batchIndex];
      const replaceable = batch.records.filter(record => record.key === key && !record.committed);
      if (replaceable.length === 0) continue;
      for (const record of replaceable.reverse()) {
        if (record.status === 'applied') record.undo();
      }
      batch.records = batch.records.filter(record => record.key !== key || record.committed);
      if (batch.records.length === 0) this.history.splice(batchIndex, 1);
      return;
    }
  }

  private async runBatch(
    id: string,
    operations: OperationV1[],
    key?: string,
    nodeElement?: Element | null,
    signal?: AbortSignal,
  ): Promise<AppliedBatch> {
    const records: AppliedRecord[] = [];
    const outcomes = new Map(
      this.history.flatMap(batch => batch.records).map(record => [record.operation.id, record] as const),
    );
    for (const operation of operations) {
      signal?.throwIfAborted();
      const validation = validateOperationV1(operation);
      if (!validation.ok) {
        records.push({
          id: operation.id || 'invalid',
          operation,
          nodeElement: nodeElement ?? null,
          status: 'error',
          code: 'INVALID_OPERATION',
          message: validation.errors.join('; '),
          committed: false,
          key,
          undo: () => false,
        });
        outcomes.set(operation.id, records.at(-1)!);
        continue;
      }
      const unavailable = (operation.dependsOn ?? []).find(dependency => {
        const outcome = outcomes.get(dependency);
        return !outcome || (outcome.status !== 'applied' && outcome.code !== 'OPERATION_ALREADY_APPLIED');
      });
      if (unavailable) {
        records.push({
          id: operation.id,
          operation,
          nodeElement: nodeElement ?? null,
          status: 'skipped',
          code: 'DEPENDENCY_UNAVAILABLE',
          message: `Dependency ${unavailable} did not complete successfully`,
          committed: false,
          key,
          undo: () => false,
        });
        outcomes.set(operation.id, records.at(-1)!);
        continue;
      }
      const capture = await captureUndo(this.document, operation, this.root, this.ledger);
      signal?.throwIfAborted();
      const result = await applyOperation(this.document, operation, {root: this.root, signal, ledger: this.ledger});
      const action = result.status === 'applied' ? capture.finalize() : {undo: () => false};
      const record: AppliedRecord = {
        id: operation.id,
        operation,
        nodeElement: nodeElement ?? capture.element,
        status: result.status,
        code: result.code,
        message: result.message,
        targetResolution: result.targetResolution,
        resolutionEvidence: result.resolutionEvidence,
        committed: false,
        key,
        undo: action.undo,
        ...(action.inverse ? {inverse: action.inverse} : {}),
        ...(capture.beforeStyle ? {beforeStyle: capture.beforeStyle} : {}),
        ...(action.afterStyle ? {afterStyle: action.afterStyle} : {}),
      };
      records.push(record);
      outcomes.set(operation.id, record);
    }
    return { id, records };
  }

  private changed(): void {
    this.persistRecovery(false);
    this.notify();
  }

  private persistRecovery(strict: boolean): void {
    const operations = this.pendingOperations();
    try {
      if (operations.length > 0 || this.inFlightSave) {
        this.storage?.setItem(this.storageKey, JSON.stringify({
          version: 2,
          operations,
          ...(this.inFlightSave ? {inFlight: this.inFlightSave} : {}),
        }));
      } else this.storage?.removeItem(this.storageKey);
    } catch (error) {
      this.recoveryWarningMessage = 'sessionStorage недоступен; batch не был отправлен и остаётся несохранённым.';
      if (strict) {
        this.inFlightSave = null;
        throw new Error(this.recoveryWarningMessage, {cause: error});
      }
    }
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
    const changes = this.getChanges();
    for (const listener of this.changeListeners) listener(changes);
  }
}

function parsePendingSaveBatch(value: unknown): PendingSaveBatch | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const batch = value as Record<string, unknown>;
  if (
    typeof batch.idempotencyKey !== 'string'
    || batch.idempotencyKey.length < 16
    || !Number.isSafeInteger(batch.expectedRevision)
    || (batch.expectedRevision as number) < 0
    || !Array.isArray(batch.operations)
    || batch.operations.length === 0
    || !batch.operations.every(operation => validateOperationV1(operation).ok)
    || !isSourceSnapshotV1(batch.sourceSnapshot)
  ) return null;
  return batch as PendingSaveBatch;
}

async function captureUndo(
  document: Document,
  operation: OperationV1,
  root: Document | Element = document,
  ledger?: ReplayLedger,
): Promise<UndoCapture> {
  const target = operation.target.nodeRef
    ? ledger?.resolve(operation.target.nodeRef)?.node ?? null
    : (await resolveTarget(document, operation.target, {root})).element;
  if (!target) return noUndo();

  switch (operation.kind) {
    case 'setText': {
      const previous = target.textContent;
      return {
        element: target.nodeType === 1 ? target as Element : target.parentElement,
        finalize: () => {
          const applied = target.textContent;
          return {
            undo: () => {
              if (target.textContent !== applied) return false;
              target.textContent = previous;
              return true;
            },
            inverse: async () => ({
              schemaVersion: 1,
              id: createOperationId('undo'),
              kind: 'setText',
              target: operation.target,
              value: previous ?? '',
              precondition: {before: {textHash: await sha256Text(applied ?? '')}},
              revision: {previousOperationId: operation.id, reason: 'undo'},
              meta: humanMeta(),
            }),
          };
        },
      };
    }
    case 'setStyle': {
      if (target.nodeType !== 1) return noUndo();
      const styled = target as HTMLElement;
      const property = normalizeStyleProperty(operation.property);
      const previous = styled.style?.getPropertyValue(property) ?? '';
      const priority = styled.style?.getPropertyPriority(property) ?? '';
      return {
        element: styled,
        beforeStyle: {value: previous, priority: priority === 'important' ? 'important' : ''},
        finalize: () => {
          const applied = styled.style?.getPropertyValue(property) ?? '';
          const appliedPriority = styled.style?.getPropertyPriority(property) ?? '';
          return {
            afterStyle: {value: applied, priority: appliedPriority === 'important' ? 'important' : ''},
            undo: () => {
              if (!styled.style
                || styled.style.getPropertyValue(property) !== applied
                || styled.style.getPropertyPriority(property) !== appliedPriority) return false;
              if (previous) styled.style.setProperty(property, previous, priority);
              else styled.style.removeProperty(property);
              return true;
            },
            inverse: () => ({
              schemaVersion: 1,
              id: createOperationId('undo'),
              kind: 'setStyle',
              target: operation.target,
              property,
              value: previous,
              priority: priority === 'important' ? 'important' : '',
              precondition: {before: {styles: {[property]: applied}}},
              revision: {previousOperationId: operation.id, reason: 'undo'},
              meta: humanMeta(),
            }),
          };
        },
      };
    }
    case 'setAttribute':
    case 'removeAttribute': {
      if (target.nodeType !== 1) return noUndo();
      const element = target as Element;
      const existed = element.hasAttribute(operation.name);
      const previous = element.getAttribute(operation.name);
      return {
        element,
        finalize: () => {
          const appliedExists = element.hasAttribute(operation.name);
          const applied = element.getAttribute(operation.name);
          return {
            undo: () => {
              if (element.hasAttribute(operation.name) !== appliedExists
                || element.getAttribute(operation.name) !== applied) return false;
              if (existed) element.setAttribute(operation.name, previous ?? '');
              else element.removeAttribute(operation.name);
              return true;
            },
            inverse: () => existed
              ? {
                  schemaVersion: 1,
                  id: createOperationId('undo'),
                  kind: 'setAttribute',
                  target: operation.target,
                  name: operation.name,
                  value: previous ?? '',
                  precondition: {before: {attributes: {[operation.name]: appliedExists ? applied : null}}},
                  revision: {previousOperationId: operation.id, reason: 'undo'},
                  meta: humanMeta(),
                }
              : {
                  schemaVersion: 1,
                  id: createOperationId('undo'),
                  kind: 'removeAttribute',
                  target: operation.target,
                  name: operation.name,
                  precondition: {before: {attributes: {[operation.name]: appliedExists ? applied : null}}},
                  revision: {previousOperationId: operation.id, reason: 'undo'},
                  meta: humanMeta(),
                },
          };
        },
      };
    }
    case 'insertNode': {
      const container = operation.position === 'before' || operation.position === 'after' ? target.parentNode : target;
      const before = new Set(container ? Array.from(container.childNodes) : []);
      let inserted: Node | null = null;
      return {
        element: target.nodeType === 1 ? target as Element : target.parentElement,
        finalize: () => {
          if (container) inserted = Array.from(container.childNodes).find(node => !before.has(node)) ?? null;
          const appliedSignature = inserted ? nodeSignature(inserted) : null;
          return {
            undo: () => {
              if (!inserted?.parentNode || nodeSignature(inserted) !== appliedSignature) return false;
              inserted.parentNode.removeChild(inserted);
              return true;
            },
            inverse: async () => inserted ? ({
              schemaVersion: 1,
              id: createOperationId('undo'),
              kind: 'removeNode',
              target: {nodeRef: {operationId: operation.id}},
              dependsOn: [operation.id],
              precondition: {before: {textHash: await sha256Text(inserted.textContent ?? '')}},
              revision: {previousOperationId: operation.id, reason: 'undo'},
              meta: humanMeta(),
            }) : null,
          };
        },
      };
    }
    case 'removeNode': {
      const parent = target.parentNode;
      const next = target.nextSibling;
      const beforeSignature = nodeSignature(target);
      const serialized = serializeNode(target);
      const placement = placementFor(parent, next);
      return {
        element: target.nodeType === 1 ? target as Element : target.parentElement,
        finalize: () => ({
          undo: () => {
            if (!parent || target.isConnected || nodeSignature(target) !== beforeSignature) return false;
            parent.insertBefore(target, next?.parentNode === parent ? next : null);
            return true;
          },
          inverse: () => serialized && placement ? ({
            schemaVersion: 1,
            id: createOperationId('undo'),
            kind: 'insertNode',
            target: placement.target,
            position: placement.position,
            node: serialized,
            revision: {previousOperationId: operation.id, reason: 'undo'},
            meta: humanMeta(),
          }) : null,
        }),
      };
    }
    case 'moveNode': {
      const parent = target.parentNode;
      const next = target.nextSibling;
      const placement = placementFor(parent, next);
      return {
        element: target.nodeType === 1 ? target as Element : target.parentElement,
        finalize: () => {
          const appliedParent = target.parentNode;
          const appliedNext = target.nextSibling;
          return {
            undo: () => {
              if (!parent || target.parentNode !== appliedParent || target.nextSibling !== appliedNext) return false;
              parent.insertBefore(target, next?.parentNode === parent ? next : null);
              return true;
            },
            inverse: () => placement ? ({
              schemaVersion: 1,
              id: createOperationId('undo'),
              kind: 'moveNode',
              target: operation.target,
              destination: placement.target,
              position: placement.position,
              ...(appliedParent?.nodeType === 1
                ? {precondition: {parent: buildTargetDescriptor(appliedParent as Element)}}
                : {}),
              revision: {previousOperationId: operation.id, reason: 'undo'},
              meta: humanMeta(),
            }) : null,
          };
        },
      };
    }
  }
}

function noUndo(): UndoCapture {
  return { element: null, finalize: () => ({undo: () => false}) };
}

function humanMeta(): NonNullable<OperationV1['meta']> {
  return {createdAt: new Date().toISOString(), actor: {type: 'human'}};
}

function serializeNode(node: Node): SerializedNode | null {
  if (node.nodeType === 3) return {type: 'text', value: node.nodeValue ?? ''};
  if (node.nodeType !== 1) return null;
  try { return serializeEditableElement(node as Element); } catch { return null; }
}

function placementFor(parent: Node | null, next: Node | null): {target: TargetDescriptor; position: 'before' | 'append'} | null {
  if (next?.nodeType === 1) return {target: buildTargetDescriptor(next as Element), position: 'before'};
  if (parent?.nodeType === 1) return {target: buildTargetDescriptor(parent as Element), position: 'append'};
  return null;
}

function nodeSignature(node: Node): string {
  return node.nodeType === 1
    ? (node as Element).outerHTML
    : `${node.nodeType}:${node.nodeValue ?? node.textContent ?? ''}`;
}

function operationReferencesAny(operation: OperationV1, replacements: Map<string, string>): boolean {
  return (operation.dependsOn ?? []).some(id => replacements.has(id))
    || operationDescriptors(operation).some(descriptor =>
      descriptor.nodeRef ? replacements.has(descriptor.nodeRef.operationId) : false);
}

function reviseOperationForRepair(
  operation: OperationV1,
  id: string,
  replacements: Map<string, string>,
  selectedTarget?: TargetDescriptor,
  failureCode?: string,
): OperationV1 {
  const revised = structuredClone(operation) as OperationV1;
  revised.id = id;
  revised.revision = {previousOperationId: operation.id, reason: 'target-repair'};
  revised.meta = humanMeta();
  if (revised.dependsOn) revised.dependsOn = revised.dependsOn.map(dependency => replacements.get(dependency) ?? dependency);
  revised.target = rewriteNodeReference(revised.target, replacements);
  if (revised.kind === 'moveNode') revised.destination = rewriteNodeReference(revised.destination, replacements);
  if (revised.precondition?.parent) {
    revised.precondition.parent = rewriteNodeReference(revised.precondition.parent, replacements);
  }

  if (selectedTarget) {
    if (failureCode?.startsWith('DESTINATION_') && revised.kind === 'moveNode') revised.destination = selectedTarget;
    else if (failureCode?.startsWith('PARENT_PRECONDITION_') && revised.precondition?.parent) {
      revised.precondition.parent = selectedTarget;
    } else revised.target = selectedTarget;
  }
  return revised;
}

function rewriteNodeReference(descriptor: TargetDescriptor, replacements: Map<string, string>): TargetDescriptor {
  if (!descriptor.nodeRef) return descriptor;
  const operationId = replacements.get(descriptor.nodeRef.operationId);
  return operationId
    ? {nodeRef: {operationId, ...(descriptor.nodeRef.path ? {path: [...descriptor.nodeRef.path]} : {})}}
    : descriptor;
}

function operationDescriptors(operation: OperationV1): TargetDescriptor[] {
  const descriptors = [operation.target];
  if (operation.kind === 'moveNode') descriptors.push(operation.destination);
  if (operation.precondition?.parent) descriptors.push(operation.precondition.parent);
  return descriptors;
}

function normalizeStyleProperty(property: string): string {
  const trimmed = property.trim();
  return trimmed.startsWith('--') ? trimmed : trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function resultFrom(record: AppliedRecord): OperationApplyResult {
  return {
    operationId: record.operation.id,
    kind: record.operation.kind,
    target: record.operation.target,
    status: record.status,
    code: record.code,
    message: record.message,
    targetResolution: record.targetResolution,
    resolutionEvidence: record.resolutionEvidence,
  };
}

function reportFor(batchId: string, page: EditorPageRef, operations: OperationApplyResult[]): EditorApplyReport {
  return {
    batchId,
    page,
    applied: operations.filter(operation => operation.status === 'applied').length,
    skipped: operations.filter(operation => operation.status === 'skipped').length,
    errors: operations.filter(operation => operation.status === 'error').length,
    operations,
  };
}

function groupedPreviewReport(
  batchId: string,
  page: EditorPageRef,
  outcome: EditorGroupedPreviewReport['outcome'],
  operations: GroupedPreviewOperationReport[],
  applied: number,
  rolledBack: number,
  failure?: EditorGroupedPreviewReport['failure'],
  rollbackFailures: EditorGroupedPreviewReport['rollbackFailures'] = [],
): EditorGroupedPreviewReport {
  return {
    batchId,
    page,
    outcome,
    applied: outcome === 'applied' ? applied : 0,
    skipped: operations.filter(operation => operation.result.status === 'skipped').length,
    errors: operations.filter(operation => operation.result.status === 'error').length + (outcome === 'rejected' ? 1 : 0),
    rolledBack,
    unrestored: rollbackFailures.length,
    ...(failure ? {failure} : {}),
    rollbackFailures,
    operations,
  };
}
