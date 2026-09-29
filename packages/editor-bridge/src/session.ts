import type { ConditionalOperationV2, Operation, SerializedNode, SourceSnapshotV1, TargetDescriptor } from '@lykar/protocol';
import { isSourceSnapshotV1, validateOperation } from '@lykar/protocol';
import { applyOperation, assertOperationPayloadSafe, captureSourceSnapshot, ReplayLedger, resolveTarget, sha256Text, ConditionalRuntime, compileConditionalGroups, resolveConditionalTarget, frameworkRootFor, isFrameworkTargetReady, subscribeFrameworkRoots } from '@lykar/runtime';
import type { OperationApplyResult } from '@lykar/runtime';

import {styleSnapshot, styleMutation, restoreStyle, type StyleMutation} from './style-history.js';

import { createOperationId } from './operation-id.js';
import { buildTargetDescriptor, buildConditionalTargetDescriptor, serializeEditableElement } from './target-builder.js';

export type EditorPageRef = { origin: string; pathname: string; url: string };
export type EditorPageDraft = { page: EditorPageRef; operations: Operation[] };
export type EditorApplyBatch = { id?: string; operations: Operation[] };
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
  operation: Operation;
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
  onConditionalDiagnostic?: (diagnostic: {groupId: string; code: string; message: string}) => void;
};
export type PendingSaveBatch = {
  idempotencyKey: string;
  expectedRevision: number;
  operations: Operation[];
  sourceSnapshot: SourceSnapshotV1;
};

type AppliedRecord = EditorChange & {
  key?: string;
  undo: () => boolean;
  inverse?: () => Operation | Operation[] | null | Promise<Operation | Operation[] | null>;
  styleMutation?: StyleMutation;
  beforeStyle?: {value: string; priority: '' | 'important'};
  afterStyle?: {value: string; priority: '' | 'important'};
};
type AppliedBatch = { id: string; records: AppliedRecord[] };
type UndoAction = { styleMutation?: StyleMutation; undo: () => boolean; inverse?: () => Operation | Operation[] | null | Promise<Operation | Operation[] | null>; afterStyle?: AppliedRecord['afterStyle'] };
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
  private readonly conditional: ConditionalRuntime;
  private readonly stopFrameworkSubscription: () => void;
  private readonly selectionConditions = new WeakMap<Element, {id: string; text: string; target: TargetDescriptor}>();
  private disposed = false;

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
    this.conditional = new ConditionalRuntime({
      document, root: this.root, groups: [],
      resolveTargetSync: target => resolveConditionalTarget(document, target, {root: this.root}),
      isTargetReady: isFrameworkTargetReady,
      isCurrent: () => !this.disposed,
      onDiagnostic: options.onConditionalDiagnostic,
    });
    this.stopFrameworkSubscription = subscribeFrameworkRoots(document, () => this.conditional.sync());
    this.conditional.start();
  }

  get conditionalState() { return {groups: this.conditional.groupStates, stats: this.conditional.stats}; }

  captureSelection(element: Element | null): void {
    if (!element || !isFrameworkTargetReady(element)) return;
    const source = this.conditional.readSource(element);
    if (!source) return;
    const target = buildConditionalTargetDescriptor(element);
    const previous = this.history.flatMap(batch => batch.records).find(record =>
      record.operation.schemaVersion === 2 && record.operation.condition.text === source.text
      && JSON.stringify(record.operation.target) === JSON.stringify(target));
    this.selectionConditions.set(element, {
      id: previous?.operation.schemaVersion === 2 ? previous.operation.condition.id : createOperationId('state'),
      text: source.text, target,
    });
  }

  destroy(): void {
    if (this.disposed) return;
    this.conditional.dispose();
    this.disposed = true;
    this.stopFrameworkSubscription();
    this.listeners.clear();
    this.changeListeners.clear();
  }

  private prepareConditional(operation: Operation, selected?: Element | null): Operation {
    if (operation.schemaVersion === 2) return operation;
    const element = selected ?? resolveConditionalTarget(this.document, operation.target, {root: this.root});
    if (!element || !frameworkRootFor(element)) return operation;
    if (!isFrameworkTargetReady(element)) throw new Error('Приложение ещё не завершило mount/hydration.');
    if (operation.kind !== 'setText' && operation.kind !== 'setStyle') {
      throw new Error('В React/Vue сейчас поддерживаются условные изменения текста и стилей.');
    }
    if (!this.selectionConditions.has(element)) this.captureSelection(element);
    const captured = this.selectionConditions.get(element);
    const currentSource = this.conditional.readSource(element);
    if (!captured || !currentSource) {
      throw new Error('Для этой структуры нет безопасного текстового узла; изменение не создано.');
    }
    if (currentSource.text !== captured.text) throw new Error('Состояние элемента изменилось. Выберите его заново перед редактированием.');
    if (operation.kind === 'setStyle' && (element as HTMLElement).style.getPropertyPriority(normalizeStyleProperty(operation.property)) === 'important') {
      throw new Error('Стиль приложения задан как inline !important; безопасное наложение недоступно.');
    }
    if (resolveConditionalTarget(this.document, captured.target, {root: this.root}) !== element) {
      throw new Error('Элемент нельзя однозначно отличить от похожих элементов; изменение не создано.');
    }
    const {precondition: _precondition, dependsOn: _dependencies, ...base} = operation;
    return {...base, schemaVersion: 2, target: captured.target as ConditionalOperationV2['target'],
      condition: {id: captured.id, text: captured.text}};
  }

  private async previewConditionalGroup(
    operations: Operation[], options: {id?: string; key?: string; signal?: AbortSignal},
  ): Promise<EditorGroupedPreviewReport> {
    const id = options.id ?? createOperationId('state-group');
    options.signal?.throwIfAborted();
    if (!operations.length || operations.some(operation => operation.schemaVersion !== 2)) {
      throw new Error('Группа не может смешивать обычные и условные изменения.');
    }
    for (const operation of operations) {
      const validation = validateOperation(operation);
      if (!validation.ok) throw new Error(validation.errors.join('; '));
      assertOperationPayloadSafe(this.document, operation);
    }
    compileConditionalGroups([...this.exportDraft().operations, ...operations]);
    const previousHistory = [...this.history];
    if (options.key && !this.removeReplaceableChange(options.key)) throw new Error('Предыдущая правка конфликтует со страницей.');
    const members = operations.map(operation => ({...operation, meta: {...(operation.meta ?? humanMeta()), transactionId: id}}));
    const batch = await this.runBatch(id, members, options.key, undefined, options.signal);
    this.history.push(batch);
    this.redoStack.length = 0;
    this.changed();
    this.rejectUnsafeConditionalPreview(members, previousHistory);
    return groupedPreviewReport(id, this.page, 'applied', batch.records.map(record => ({
      result: resultFrom(record), rollback: 'not-needed',
    })), members.length, 0);
  }

  private rejectUnsafeConditionalPreview(operations: Operation[], previousHistory: AppliedBatch[]): void {
    const ids = new Set(operations.flatMap(operation => operation.schemaVersion === 2 ? [operation.condition.id] : []));
    const rejected = this.conditional.groupStates.find(state => ids.has(state.id) && state.status === 'unsafe');
    if (!rejected) return;
    this.history.splice(0, this.history.length, ...previousHistory);
    this.changed();
    throw new Error(`Условная правка не применена: ${rejected.reason ?? rejected.status}.`);
  }

  private undoneConditionalIds(): Set<string> {
    return new Set(this.exportDraft().operations.flatMap(operation =>
      operation.schemaVersion === 2 && operation.revision?.reason === 'undo' ? [operation.revision.previousOperationId] : []));
  }

  async resetConditionalStyle(element: Element, property: string): Promise<EditorApplyReport | null> {
    if (!frameworkRootFor(element)) return null;
    const source = this.conditional.readSource(element);
    const target = buildConditionalTargetDescriptor(element);
    const undone = this.undoneConditionalIds();
    const operations = this.exportDraft().operations.filter((operation): operation is ConditionalOperationV2 =>
      operation.schemaVersion === 2 && operation.kind === 'setStyle'
      && normalizeStyleProperty(operation.property) === normalizeStyleProperty(property)
      && operation.condition.text === source?.text && !operation.revision
      && !undone.has(operation.id) && JSON.stringify(operation.target) === JSON.stringify(target));
    if (!operations.length) return reportFor('no-op-state-reset', this.page, []);
    return this.apply({operations: [...operations].reverse().map(operation => ({...structuredClone(operation),
      id: createOperationId('reset-state-style'), meta: humanMeta(),
      revision: {previousOperationId: operation.id, reason: 'undo' as const},
    }))});
  }

  sourceSnapshot(): Promise<SourceSnapshotV1> {
    return this.sourceSnapshotPromise;
  }

  async restore(committedOperations: Operation[] = [], signal?: AbortSignal): Promise<EditorApplyReport | null> {
    // Read pending edits before remote replay can update their storage key.
    let pending: Operation[] = [];
    try {
      const raw = this.storage?.getItem(this.storageKey);
      const value = raw ? JSON.parse(raw) as { operations?: unknown; inFlight?: unknown } : null;
      if (Array.isArray(value?.operations)) {
        const committedIds = new Set(committedOperations.map(operation => operation.id));
        pending = value.operations.filter(operation => validateOperation(operation).ok && !committedIds.has(operation.id));
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
    this.history.push(...restoreHistoryBatches(`${batchId}:remote`, remote.records));
    const local = await this.runBatch(batchId, pending, undefined, undefined, signal);
    const records = [...remote.records, ...local.records];
    this.history.push(...restoreHistoryBatches(`${batchId}:local`, local.records));
    if (records.length > 0) this.redoStack.length = 0;
    this.changed();
    return records.length ? reportFor(batchId, this.page, records.map(record => resultFrom(record))) : null;
  }

  async preview(operation: Operation, key?: string, nodeElement?: Element | null): Promise<EditorApplyReport> {
    operation = this.prepareConditional(operation, nodeElement);
    const previousHistory = [...this.history];
    if (key && !this.removeReplaceableChange(key)) throw new Error('Предыдущий preview изменён страницей; заменять его небезопасно.');
    const batchId = createOperationId('change');
    const appliedBatch = await this.runBatch(batchId, [operation], key, nodeElement);
    this.history.push(appliedBatch);
    this.redoStack.length = 0;
    this.changed();
    this.rejectUnsafeConditionalPreview([operation], previousHistory);
    return reportFor(batchId, this.page, appliedBatch.records.map(record => resultFrom(record)));
  }

  /**
   * Preview a related set of style operations as one history unit. Any rejected
   * member stops the group and triggers reverse-order compare-and-restore for
   * all members that may have changed the DOM. A failed restore is reported;
   * the group is never added to history or pending-save state on failure.
   */
  async previewGroup(
    operations: Operation[],
    options: {id?: string; key?: string; signal?: AbortSignal} = {},
  ): Promise<EditorGroupedPreviewReport> {
    operations = operations.map(operation => this.prepareConditional(operation));
    if (operations.some(operation => operation.schemaVersion === 2)) {
      return this.previewConditionalGroup(operations, options);
    }
    const batchId = options.id ?? createOperationId('preview-group');
    const members = operations.map(operation => ({...operation, meta: {...(operation.meta ?? humanMeta()), transactionId: batchId}}));
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
    if (options.key && !this.removeReplaceableChange(options.key)) {
      return groupedPreviewReport(batchId, this.page, 'rejected', results, 0, 0, {
        code: 'OWNERSHIP_CONFLICT', message: 'The previous preview changed outside the editor.',
      });
    }

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

      const validation = validateOperation(operation);
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
          ...(action.styleMutation ? {styleMutation: action.styleMutation} : {}),
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
          ...(action.styleMutation ? {styleMutation: action.styleMutation} : {}),
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
    if (!this.preflightStyleUndo(batch.records)) return false;
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
    const undone = this.undoneConditionalIds();
    const batch = [...this.history].reverse().find(candidate => candidate.records.some(record => record.committed && record.status === 'applied' && record.inverse && !undone.has(record.id)));
    if (!batch) return null;
    const records = batch.records.filter(record => record.committed && record.status === 'applied' && !undone.has(record.id));
    if (records.some(record => !record.inverse) || !this.preflightStyleUndo(records)) return null;
    const operations: Operation[] = [];
    for (const record of [...records].reverse()) {
      const inverse = await record.inverse!();
      if (!inverse) return null;
      operations.push(...(Array.isArray(inverse) ? inverse : [inverse]));
    }
    if (!operations.length) return null;
    if (operations.every(operation => operation.kind === 'setStyle')) {
      const result = await this.previewGroup(operations, {id: createOperationId('undo-saved')});
      return reportFor(result.batchId, this.page, result.operations.map(member => member.result));
    }
    return this.apply({id: createOperationId('undo-saved'), operations});
  }

  async repair(operationId: string, element: Element): Promise<EditorApplyReport> {
    const changes = this.history.flatMap(batch => batch.records);
    const originalIndex = changes.findIndex(change => change.operation.id === operationId);
    if (originalIndex < 0) throw new Error(`Изменение ${operationId} не найдено.`);
    const original = changes[originalIndex];
    if (original.status === 'applied') throw new Error('Repair доступен только для неприменённого изменения.');

    const replacementIds = new Map<string, string>();
    replacementIds.set(original.operation.id, createOperationId('repair'));
    const operations: Operation[] = [];
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
    if (batch.records.length > 1 && batch.records.every(record => record.operation.kind === 'setStyle')) {
      const remaining = [...this.redoStack];
      const result = await this.previewGroup(batch.records.map(record => record.operation), {id: batch.id});
      this.redoStack.length = 0;
      this.redoStack.push(...remaining);
      if (result.outcome !== 'applied') this.redoStack.push(batch);
      this.changed();
      return reportFor(result.batchId, this.page, result.operations.map(member => member.result));
    }
    const replayed = await this.runBatch(batch.id, batch.records.map(record => record.operation));
    if (replayed.records.length > 0) this.history.push(replayed);
    this.changed();
    return reportFor(batch.id, this.page, replayed.records.map(record => resultFrom(record)));
  }

  exportDraft(): EditorPageDraft {
    return { page: this.page, operations: this.history.flatMap(batch => batch.records.map(record => record.operation)) };
  }

  pendingOperations(): Operation[] {
    return this.history.flatMap(batch => batch.records.filter(record => !record.committed).map(record => record.operation));
  }

  styleView(element: Element): CSSStyleDeclaration | undefined {
    const native = (element as HTMLElement).style;
    if (!native || !frameworkRootFor(element)) return native;
    this.conditional.sync();
    const active = new Set(this.conditional.groupStates.filter(state => state.status === 'active').map(state => state.id));
    const view = this.document.createElement('span').style;
    view.cssText = native.cssText;
    for (const group of compileConditionalGroups(this.exportDraft().operations)) {
      if (!active.has(group.id) || resolveConditionalTarget(this.document, group.target, {root: this.root}) !== element) continue;
      for (const effect of group.operations) if (effect.kind === 'setStyle') view.setProperty(normalizeStyleProperty(effect.property), effect.value, effect.priority ?? '');
    }
    return view;
  }

  styleBaseline(element: Element, property: string): {value: string; priority: '' | 'important'} | null {
    const normalized = normalizeStyleProperty(property);
    if (frameworkRootFor(element)) {
      const value = this.conditional.readSource(element)?.styles[normalized];
      return value ? {value: value.value, priority: value.priority === 'important' ? 'important' : ''} : null;
    }
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
    if (frameworkRootFor(element)) {
      const source = this.conditional.readSource(element);
      return compileConditionalGroups(this.exportDraft().operations).some(group =>
        group.when.value === source?.text
        && resolveConditionalTarget(this.document, group.target, {root: this.root}) === element
        && group.operations.some(effect => effect.kind === 'setStyle' && normalizeStyleProperty(effect.property) === normalizeStyleProperty(property)));
    }
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

  resolveSaveConflict(committedOperations: Operation[]): void {
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
      styleMutation: _styleMutation,
      key: _key,
      ...change
    }) => change));
  }

  getState(): EditorSessionState {
    const changes = this.getChanges();
    const undone = this.undoneConditionalIds();
    return {
      canUndo: this.history.some(batch => batch.records.some(record => !record.committed))
        || this.history.some(batch => batch.records.some(record => record.committed && record.status === 'applied' && record.inverse && !undone.has(record.id))),
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
    this.conditional.replaceGroups([]);
    this.notify();
  }

  private preflightStyleUndo(records: AppliedRecord[]): boolean {
    const copies = new Map<Element, CSSStyleDeclaration>();
    for (const record of [...records].reverse()) {
      if (record.status !== 'applied' || !record.styleMutation || !record.nodeElement) continue;
      let copy = copies.get(record.nodeElement);
      if (!copy) {
        copy = this.document.createElement('div').style;
        copy.cssText = (record.nodeElement as HTMLElement).style.cssText;
        copies.set(record.nodeElement, copy);
      }
      if (!restoreStyle(copy, record.styleMutation)) return false;
    }
    return true;
  }

  private removeReplaceableChange(key: string): boolean {
    for (let batchIndex = this.history.length - 1; batchIndex >= 0; batchIndex--) {
      const batch = this.history[batchIndex];
      const replaceable = batch.records.filter(record => record.key === key && !record.committed);
      if (replaceable.length === 0) continue;
      if (!this.preflightStyleUndo(replaceable)) return false;
      for (const record of replaceable.reverse()) {
        if (record.status === 'applied' && !record.undo()) return false;
      }
      batch.records = batch.records.filter(record => record.key !== key || record.committed);
      if (batch.records.length === 0) this.history.splice(batchIndex, 1);
      return true;
    }
    return true;
  }

  private async runBatch(
    id: string,
    operations: Operation[],
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
      const validation = validateOperation(operation);
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
      if (operation.schemaVersion === 2) {
        assertOperationPayloadSafe(this.document, operation);
        const element = resolveConditionalTarget(this.document, operation.target, {root: this.root});
        records.push({
          id: operation.id, operation, nodeElement: element, status: 'applied',
          code: 'CONDITIONAL_REGISTERED', message: 'Изменение привязано к исходному состоянию элемента.',
          committed: false, key, undo: () => true,
          ...(operation.revision?.reason !== 'undo' ? {inverse: () => ({
            ...structuredClone(operation), id: createOperationId('undo-state'),
            revision: {previousOperationId: operation.id, reason: 'undo' as const},
            meta: humanMeta(),
          })} : {}),
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
          ...(action.styleMutation ? {styleMutation: action.styleMutation} : {}),
      };
      records.push(record);
      outcomes.set(operation.id, record);
    }
    return { id, records };
  }

  private changed(): void {
    this.conditional.replaceGroups(compileConditionalGroups(this.history.flatMap(batch =>
      batch.records.filter(record => record.status !== 'error').map(record => record.operation))));
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
    || !batch.operations.every(operation => validateOperation(operation).ok)
    || !isSourceSnapshotV1(batch.sourceSnapshot)
  ) return null;
  return batch as PendingSaveBatch;
}

async function captureUndo(
  document: Document,
  operation: Operation,
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
      const beforeDeclarations = styleSnapshot(styled.style);
      const previous = styled.style?.getPropertyValue(property) ?? '';
      const priority = styled.style?.getPropertyPriority(property) ?? '';
      return {
        element: styled,
        beforeStyle: {value: previous, priority: priority === 'important' ? 'important' : ''},
        finalize: () => {
          const mutation = styleMutation(beforeDeclarations, styleSnapshot(styled.style));
          const applied = styled.style?.getPropertyValue(property) ?? '';
          const appliedPriority = styled.style?.getPropertyPriority(property) ?? '';
          return {
            afterStyle: {value: applied, priority: appliedPriority === 'important' ? 'important' : ''},
            styleMutation: mutation,
            undo: () => restoreStyle(styled.style, mutation),
            inverse: () => {
              // Clear affected declarations before restoring them in authored order.
              const removals = mutation.touched.map(property => ({property, value: '', priority: ''}));
              const declarations = mutation.before.filter(item => mutation.touched.includes(item.property));
              return [...removals, ...declarations].map(item => ({
                schemaVersion: 1 as const, id: createOperationId('undo'), kind: 'setStyle' as const,
                target: operation.target, property: item.property, value: item.value,
                priority: item.priority === 'important' ? 'important' as const : '' as const,
                revision: {previousOperationId: operation.id, reason: 'undo' as const}, meta: humanMeta(),
              }));
            },
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

function restoreHistoryBatches(prefix: string, records: AppliedRecord[]): AppliedBatch[] {
  const batches: AppliedBatch[] = [];
  for (const record of records) {
    const id = record.operation.meta?.transactionId;
    const previous = batches.at(-1);
    if (id && previous?.id === id) previous.records.push(record);
    else batches.push({id: id ?? `${prefix}:${record.id}`, records: [record]});
  }
  return batches;
}

function humanMeta(): NonNullable<Operation['meta']> {
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

function operationReferencesAny(operation: Operation, replacements: Map<string, string>): boolean {
  return (operation.dependsOn ?? []).some(id => replacements.has(id))
    || operationDescriptors(operation).some(descriptor =>
      descriptor.nodeRef ? replacements.has(descriptor.nodeRef.operationId) : false);
}

function reviseOperationForRepair(
  operation: Operation,
  id: string,
  replacements: Map<string, string>,
  selectedTarget?: TargetDescriptor,
  failureCode?: string,
): Operation {
  const revised = structuredClone(operation) as Operation;
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

function operationDescriptors(operation: Operation): TargetDescriptor[] {
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
