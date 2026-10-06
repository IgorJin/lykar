import {PROTOCOL_LIMITS, resolveTargetRepairs} from '@lykar/protocol';
import type {Operation, TargetDescriptor} from '@lykar/protocol';

export type ConditionalEffect =
  | {kind: 'setText'; value: string}
  | {kind: 'setStyle'; property: string; value: string; priority?: '' | 'important'};

export type ConditionalGroup = {
  id: string;
  target: TargetDescriptor;
  when: {kind: 'textEquals'; value: string};
  operations: ConditionalEffect[];
};

export type ConditionalRuntimeOptions = {
  document: Document;
  root: Document | Element;
  groups: ConditionalGroup[];
  /** Returns only a unique candidate. Missing, ambiguous and invalid targets return null. */
  resolveTargetSync: (target: TargetDescriptor) => Element | null;
  isTargetReady?: (target: Element) => boolean;
  isCurrent?: () => boolean;
  onDiagnostic?: (diagnostic: {groupId: string; code: string; message: string}) => void;
  maxMutationRecords?: number;
};

export type ConditionalGroupState = {
  id: string;
  status: 'active' | 'inactive' | 'missing' | 'not-ready' | 'unsafe';
  reason?: string;
};

export type ConditionalRuntimeStats = {
  groups: number;
  active: number;
  observedRecords: number;
  ownRecords: number;
  syncPasses: number;
  suspended: boolean;
};

export type ConditionalSource = {
  text: string;
  styles: Record<string, {value: string; priority: string}>;
};

type StyleValue = {value: string; priority: string};
type Binding = {
  element: Element;
  textNode: Text;
  hostText: string;
  styles: Map<string, StyleValue>;
  activeGroupId?: string;
  overlay?: {sheet: HTMLStyleElement; attribute: string};
  blockedReason?: string;
};

const MAX_SYNC_PASSES = 4;
const OVERLAY_COUNTER_KEY = Symbol.for('@lykar/conditional-overlay-counter/v1');

/** Synchronous, source-state-based overlay for framework-owned plain text and a removable CSS overlay. */
export class ConditionalRuntime {
  private groups: ConditionalGroup[];
  private readonly bindings = new Map<string, Binding>();
  private readonly states = new Map<string, ConditionalGroupState>();
  private readonly observer?: MutationObserver;
  private readonly overlayObserver?: MutationObserver;
  private readonly maxMutationRecords: number;
  private started = false;
  private stopped = false;
  private reconciling = false;
  private pendingRecords: MutationRecord[] = [];
  private observedRecords = 0;
  private ownRecords = 0;
  private syncPasses = 0;
  private deferredGroups?: ConditionalGroup[];
  private readonly expectedColorCache = new Map<string, string>();

  constructor(private readonly options: ConditionalRuntimeOptions) {
    if (options.root.nodeType === 1 && options.root.ownerDocument !== options.document) {
      throw new Error('Conditional runtime root belongs to another document');
    }
    this.groups = validateGroups(options.groups, options.document);
    this.maxMutationRecords = options.maxMutationRecords ?? 1_024;
    if (!Number.isSafeInteger(this.maxMutationRecords) || this.maxMutationRecords < 1 || this.maxMutationRecords > 8_192) {
      throw new Error('maxMutationRecords must be an integer between 1 and 8192');
    }
    const Observer = options.document.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(records => this.process(records));
      this.overlayObserver = new Observer(records => {
        const activeSheets = new Set([...new Set(this.bindings.values())].flatMap(binding => binding.overlay ? [binding.overlay.sheet] : []));
        if (records.some(record => [...record.removedNodes].some(node => activeSheets.has(node as HTMLStyleElement)))) {
          this.suspend('STYLE_OVERLAY_LOST', 'Host removed an owned stylesheet');
          return;
        }
        if (activeSheets.size && records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && ['STYLE', 'LINK'].includes((node as Element).tagName)))) this.sync();
      });
    }
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    const root = this.options.root.nodeType === 9
      ? this.options.document.documentElement : this.options.root;
    if (root) this.observer?.observe(root, {
      subtree: true, childList: true, attributes: true, attributeOldValue: true,
      characterData: true, characterDataOldValue: true,
    });
    const styleContainer = this.options.document.head ?? this.options.document.documentElement;
    if (styleContainer) this.overlayObserver?.observe(styleContainer, {childList: true});
    this.sync();
  }

  sync(): void {
    if (this.stopped) return;
    this.process(this.observer?.takeRecords() ?? []);
  }

  replaceGroups(groups: ConditionalGroup[]): void {
    const validated = validateGroups(groups, this.options.document);
    if (this.stopped) return;
    if (this.reconciling) {
      this.deferredGroups = validated;
      return;
    }
    this.process(this.observer?.takeRecords() ?? []);
    if (this.stopped) return;
    for (const binding of new Set(this.bindings.values())) this.release(binding.activeGroupId, binding);
    this.bindings.clear();
    this.states.clear();
    this.groups = validated;
    this.sync();
  }

  readSource(element: Element): ConditionalSource | null {
    this.sync();
    const textNode = plainTextNode(element);
    if (!textNode) return null;
    const binding = [...this.bindings.values()].find(item => item.element === element);
    const styles: ConditionalSource['styles'] = {};
    if (binding) {
      for (const [property, value] of binding.styles) styles[property] = {...value};
    } else {
      const style = styleOf(element);
      if (style) for (let index = 0; index < Math.min(style.length, 32); index += 1) {
        const property = style.item(index);
        styles[property] = readStyle(style, property);
      }
    }
    return {text: binding?.hostText ?? textNode.data, styles};
  }

  get groupStates(): ConditionalGroupState[] {
    return this.groups.map(group => this.states.get(group.id) ?? {id: group.id, status: 'missing', reason: 'TARGET_MISSING_OR_AMBIGUOUS'});
  }

  get stats(): ConditionalRuntimeStats {
    return {
      groups: this.groups.length,
      active: [...new Set(this.bindings.values())].filter(binding => binding.activeGroupId !== undefined).length,
      observedRecords: this.observedRecords,
      ownRecords: this.ownRecords,
      syncPasses: this.syncPasses,
      suspended: this.stopped,
    };
  }

  dispose(): void {
    if (this.stopped) return;
    if (!this.reconciling) this.process(this.observer?.takeRecords() ?? []);
    this.observer?.disconnect();
    this.overlayObserver?.disconnect();
    for (const binding of new Set(this.bindings.values())) {
      try { this.release(binding.activeGroupId, binding); } catch { /* Continue freeing other overlays. */ }
    }
    this.bindings.clear();
    this.pendingRecords = [];
    this.expectedColorCache.clear();
    this.started = false;
    this.stopped = true;
    this.deferredGroups = undefined;
  }

  private process(records: MutationRecord[]): void {
    if (this.stopped) return;
    if (this.options.isCurrent?.() === false) {
      this.captureHostMutations([...this.pendingRecords, ...records]);
      this.suspend('STALE_SESSION', 'Conditional session is no longer current');
      return;
    }
    this.pendingRecords.push(...records);
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      for (let pass = 0; pass < MAX_SYNC_PASSES; pass += 1) {
        if (this.pendingRecords.length > this.maxMutationRecords) {
          this.suspend('MUTATION_LIMIT', 'Mutation batch exceeded the configured bound');
          return;
        }
        const batch = this.pendingRecords.splice(0);
        this.observedRecords += batch.length;
        this.captureHostMutations(batch);
        if (this.stopped || this.options.isCurrent?.() === false) {
          if (!this.stopped) this.suspend('STALE_SESSION', 'Conditional session is no longer current');
          return;
        }
        const before = new Map(this.states);
        this.reconcileGroups();
        if (this.stopped) return;
        for (const state of this.states.values()) {
          const previous = before.get(state.id);
          if (state.status !== 'active' && state.status !== 'inactive'
            && (previous?.status !== state.status || previous?.reason !== state.reason)) {
            try { this.options.onDiagnostic?.({groupId: state.id, code: state.reason ?? 'FRAMEWORK_NOT_READY', message: `Conditional group is ${state.status}`}); } catch { /* Diagnostic only. */ }
          }
        }
        this.syncPasses += 1;
        this.pendingRecords.push(...(this.observer?.takeRecords() ?? []));
        if (this.pendingRecords.length === 0) return;
      }
      this.suspend('SYNC_LIMIT', 'Synchronous reconciliation did not settle');
    } finally {
      this.reconciling = false;
      if (!this.stopped && this.deferredGroups) {
        const groups = this.deferredGroups;
        this.deferredGroups = undefined;
        this.replaceGroups(groups);
      }
    }
  }

  private captureHostMutations(records: MutationRecord[]): void {
    if (records.length === 0) return;
    // A host clone can copy our selector attribute. Scan each added subtree up
    // to the mutation budget; fail closed if the whole subtree cannot be checked.
    const overlays = [...new Set(this.bindings.values())]
      .flatMap(binding => binding.overlay ? [{element: binding.element, attribute: binding.overlay.attribute}] : []);
    if (overlays.length) {
      const pending: Node[] = [];
      for (const record of records) if (record.type === 'childList') pending.push(...record.addedNodes);
      let visited = 0;
      while (pending.length) {
        if (++visited > this.maxMutationRecords) {
          this.suspend('CLONE_SCAN_LIMIT', 'Inserted subtree exceeded the overlay safety scan bound');
          return;
        }
        const node = pending.pop()!;
        if (node.nodeType !== 1) continue;
        const added = node as Element;
        for (const overlay of overlays) if (added !== overlay.element && added.hasAttribute(overlay.attribute)) {
          this.ownWrite(() => added.removeAttribute(overlay.attribute),
            own => own.type === 'attributes' && own.target === added && own.attributeName === overlay.attribute);
        }
        pending.push(...added.childNodes);
      }
    }
    for (const binding of new Set(this.bindings.values())) {
      for (const record of records) {
        if (record.type === 'characterData' && record.target === binding.textNode) {
          binding.hostText = binding.textNode.data;
        } else if (record.type === 'childList' && record.target === binding.element) {
          const replacement = plainTextNode(binding.element);
          if (replacement && replacement !== binding.textNode) {
            binding.textNode = replacement;
            binding.hostText = replacement.data;
          }
        } else if (record.type === 'attributes' && record.target === binding.element && record.attributeName === 'style') {
          const style = styleOf(binding.element);
          if (!style) continue;
          for (const [property] of binding.styles) binding.styles.set(property, readStyle(style, property));
        }
      }
    }
  }

  private reconcileGroups(): void {
    const candidates = new Map<string, Element | null>();
    const claimed = new Map<Element, ConditionalGroup[]>();
    for (const group of this.groups) {
      if (this.stopped || this.options.isCurrent?.() === false) {
        if (!this.stopped) this.suspend('STALE_SESSION', 'Conditional session is no longer current');
        return;
      }
      let element: Element | null = null;
      try { element = this.options.resolveTargetSync(group.target); } catch { /* Fail closed. */ }
      if (element && (element.ownerDocument !== this.options.document || !withinRoot(this.options.root, element))) element = null;
      candidates.set(group.id, element);
      if (element) claimed.set(element, [...(claimed.get(element) ?? []), group]);
    }

    for (const group of this.groups) {
      const element = candidates.get(group.id) ?? null;
      const previous = this.bindings.get(group.id);
      if (previous && previous.element !== element) {
        if (previous.activeGroupId === group.id) this.release(group.id, previous);
        this.bindings.delete(group.id);
      }
      if (!element) {
        this.states.set(group.id, {id: group.id, status: 'missing', reason: 'TARGET_MISSING_OR_AMBIGUOUS'});
      }
    }

    for (const [element, groups] of claimed) {
      if (this.stopped || this.options.isCurrent?.() === false) {
        if (!this.stopped) this.suspend('STALE_SESSION', 'Conditional session is no longer current');
        return;
      }
      if (this.options.isTargetReady?.(element) === false) {
        const binding = this.bindings.get(groups[0].id);
        if (binding) this.release(binding.activeGroupId, binding);
        for (const group of groups) {
          this.bindings.delete(group.id);
          this.states.set(group.id, {id: group.id, status: 'not-ready'});
        }
        continue;
      }
      const textNode = plainTextNode(element);
      if (!textNode || !styleOf(element)) {
        const binding = this.bindings.get(groups[0].id);
        if (binding) this.release(binding.activeGroupId, binding);
        for (const group of groups) {
          this.bindings.delete(group.id);
          this.states.set(group.id, {id: group.id, status: 'unsafe', reason: 'UNSAFE_TARGET_STRUCTURE'});
        }
        continue;
      }
      let binding = groups.map(group => this.bindings.get(group.id)).find(Boolean);
      if (!binding) {
        binding = {element, textNode, hostText: textNode.data, styles: new Map()};
        for (const group of groups) for (const effect of group.operations) if (effect.kind === 'setStyle') {
          const property = normalizeProperty(effect.property)!;
          if (!binding.styles.has(property)) binding.styles.set(property, readStyle(styleOf(element)!, property));
        }
      } else if (binding.textNode !== textNode) {
        binding.textNode = textNode;
        binding.hostText = textNode.data;
      }
      for (const group of groups) this.bindings.set(group.id, binding);
      const matching = groups.filter(group => binding.hostText === group.when.value);
      if (matching.length > 1) {
        this.release(binding.activeGroupId, binding);
        for (const group of groups) this.states.set(group.id, {id: group.id, status: 'unsafe', reason: 'AMBIGUOUS_CONDITION'});
        continue;
      }
      const next = matching[0];
      if (binding.activeGroupId && binding.activeGroupId !== next?.id) this.release(binding.activeGroupId, binding);
      if (!next) binding.blockedReason = undefined;
      if (next && binding.blockedReason) {
        for (const group of groups) this.states.set(group.id, {
          id: group.id,
          status: group.id === next.id ? 'unsafe' : 'inactive',
          ...(group.id === next.id ? {reason: binding.blockedReason} : {}),
        });
        continue;
      }
      if (next) {
        try { this.apply(next, binding); }
        catch (error) {
          try { this.release(next.id, binding); } catch { /* Preserve failure diagnostics. */ }
          if (this.stopped || this.options.isCurrent?.() === false) {
            if (!this.stopped) this.suspend('STALE_SESSION', 'Conditional session is no longer current');
            return;
          }
          binding.blockedReason = error instanceof Error
            ? error.message.match(/^STYLE_OVERLAY_(?:LOST|OVERRIDDEN|UNVERIFIED)/)?.[0] ?? 'APPLY_FAILED'
            : 'APPLY_FAILED';
          for (const group of groups) this.states.set(group.id, {id: group.id, status: 'unsafe', reason: binding.blockedReason});
          continue;
        }
      }
      for (const group of groups) this.states.set(group.id, {id: group.id, status: next?.id === group.id ? 'active' : 'inactive'});
    }
  }

  private apply(group: ConditionalGroup, binding: Binding): void {
    if (this.stopped || this.options.isCurrent?.() === false) throw new Error('STALE_SESSION');
    binding.activeGroupId = group.id;
    const effects = group.operations.filter((effect): effect is Extract<ConditionalEffect, {kind: 'setStyle'}> => effect.kind === 'setStyle');
    // Keep host inline declarations untouched so equal-value host writes remain distinguishable.
    if (effects.some(effect => styleOf(binding.element)!.getPropertyPriority(normalizeProperty(effect.property)!) === 'important')) {
      throw new Error('HOST_IMPORTANT_STYLE: inline !important cannot be safely overlaid');
    }
    if (binding.overlay && (!binding.overlay.sheet.isConnected || !binding.element.hasAttribute(binding.overlay.attribute))) {
      throw new Error('STYLE_OVERLAY_LOST: host removed an owned stylesheet or selector');
    }
    if (effects.length && !binding.overlay) {
      const sheet = this.options.document.createElement('style');
      const attribute = nextOverlayAttribute(this.options.document);
      binding.overlay = {sheet, attribute};
      this.ownWrite(() => {
        binding.element.setAttribute(attribute, '');
        if (this.stopped || this.options.isCurrent?.() === false) throw new Error('STALE_SESSION');
        (this.options.document.head ?? this.options.document.documentElement).append(sheet);
      }, record => record.type === 'attributes' && record.target === binding.element && record.attributeName === attribute
        || record.type === 'childList' && [...record.addedNodes].includes(sheet));
      if (!sheet.sheet) throw new Error('STYLE_OVERLAY_BLOCKED: stylesheet unavailable (possibly CSP)');
      const index = sheet.sheet.insertRule(`[${attribute}] {}`, 0);
      const rule = sheet.sheet.cssRules[index] as CSSStyleRule;
      for (const effect of effects) rule.style.setProperty(normalizeProperty(effect.property)!, effect.value, 'important');
    }
    this.verifyComparableStyles(binding.element, effects);
    for (const effect of group.operations) if (effect.kind === 'setText' && binding.textNode.data !== effect.value) {
      if (this.stopped || this.options.isCurrent?.() === false) throw new Error('STALE_SESSION');
      this.ownWrite(() => { binding.textNode.data = effect.value; }, record => record.type === 'characterData' && record.target === binding.textNode);
    }
    binding.activeGroupId = group.id;
  }

  private release(id: string | undefined, binding: Binding): void {
    if (!id || binding.activeGroupId !== id) return;
    const group = this.groups.find(item => item.id === id);
    if (!group) return;
    this.removeOverlay(binding);
    for (const effect of group.operations) if (effect.kind === 'setText') {
      if (binding.textNode.data === effect.value) {
        this.ownWrite(() => { binding.textNode.data = binding.hostText; },
          record => record.type === 'characterData' && record.target === binding.textNode);
      } else binding.hostText = binding.textNode.data;
    }
    binding.activeGroupId = undefined;
  }

  private removeOverlay(binding: Binding): void {
    const overlay = binding.overlay;
    if (!overlay) return;
    try {
      this.ownWrite(() => binding.element.removeAttribute(overlay.attribute),
        record => record.type === 'attributes' && record.target === binding.element && record.attributeName === overlay.attribute);
    } finally {
      try {
        this.ownWrite(() => overlay.sheet.remove(),
          record => record.type === 'childList' && [...record.removedNodes].includes(overlay.sheet));
      } finally {
        binding.overlay = undefined;
      }
    }
  }

  private verifyComparableStyles(
    element: Element,
    effects: Array<Extract<ConditionalEffect, {kind: 'setStyle'}>>,
  ): void {
    const window = this.options.document.defaultView;
    if (!window) return;
    const comparable = effects.filter(effect => {
      const property = normalizeProperty(effect.property);
      return (property === 'color' || property === 'background-color')
        && !/\b(?:var|env|inherit|initial|unset|revert|currentcolor|light-dark|color-mix|from|Canvas|CanvasText|LinkText|VisitedText|ActiveText|ButtonText|ButtonFace|Field|FieldText|Mark|MarkText)\b/i.test(effect.value);
    });
    if (!comparable.length) return;
    const actual = window.getComputedStyle(element);
    for (const effect of comparable) {
      const property = normalizeProperty(effect.property)!;
      const expected = this.expectedConnectedColor(property, effect.value);
      const observed = actual.getPropertyValue(property);
      if (!expected || !observed) {
        throw new Error(`STYLE_OVERLAY_UNVERIFIED: ${property} has no comparable computed value`);
      }
      if (expected !== observed) {
        throw new Error(`STYLE_OVERLAY_OVERRIDDEN: ${property} resolves to ${observed} instead of ${expected}`);
      }
    }
  }

  private expectedConnectedColor(property: string, value: string): string {
    const key = `${property}\u0000${value}`;
    const cached = this.expectedColorCache.get(key);
    if (cached !== undefined) return cached;
    const document = this.options.document;
    const container = document.head ?? document.documentElement;
    if (!container) throw new Error('STYLE_OVERLAY_UNVERIFIED: document has no probe container');
    const probe = document.createElement('span');
    probe.style.setProperty(property, value, 'important');
    this.ownWrite(() => container.append(probe),
      record => record.type === 'childList' && record.target === container && [...record.addedNodes].includes(probe));
    let expected: string;
    try {
      expected = document.defaultView?.getComputedStyle(probe).getPropertyValue(property) ?? '';
    } finally {
      this.ownWrite(() => probe.remove(),
        record => record.type === 'childList' && record.target === container && [...record.removedNodes].includes(probe));
    }
    if (expected) {
      if (this.expectedColorCache.size >= 512) this.expectedColorCache.clear();
      this.expectedColorCache.set(key, expected);
    }
    return expected;
  }

  private ownWrite(write: () => void, expected: (record: MutationRecord) => boolean): void {
    this.pendingRecords.push(...(this.observer?.takeRecords() ?? []));
    this.overlayObserver?.takeRecords();
    try { write(); }
    finally {
      for (const record of [...(this.observer?.takeRecords() ?? []), ...(this.overlayObserver?.takeRecords() ?? [])]) {
        if (expected(record)) this.ownRecords += 1;
        else this.pendingRecords.push(record);
      }
    }
  }

  private suspend(code: string, message: string): void {
    if (this.stopped) return;
    this.observer?.disconnect();
    this.overlayObserver?.disconnect();
    for (const binding of new Set(this.bindings.values())) {
      try { this.release(binding.activeGroupId, binding); } catch { /* Continue freeing other overlays. */ }
    }
    for (const group of this.groups) {
      try { this.options.onDiagnostic?.({groupId: group.id, code, message}); } catch { /* Diagnostic only. */ }
      this.states.set(group.id, {id: group.id, status: 'unsafe', reason: code});
    }
    this.bindings.clear();
    this.pendingRecords = [];
    this.stopped = true;
  }
}

export function compileConditionalGroups(operations: Operation[]): ConditionalGroup[] {
  const groups = new Map<string, ConditionalGroup>();
  const active = new Map<string, Extract<Operation, {schemaVersion: 2}>>();
  for (const operation of resolveTargetRepairs(operations)) {
    if (operation.schemaVersion !== 2) continue;
    const {id, text} = operation.condition;
    if (operation.revision?.reason === 'undo') {
      const prior = active.get(operation.revision.previousOperationId);
      if (!prior || prior.condition.id !== id || prior.condition.text !== text
        || stableJson(prior.target) !== stableJson(operation.target)
        || prior.kind !== operation.kind
        || (prior.kind === 'setStyle' && operation.kind === 'setStyle' && normalizeProperty(prior.property) !== normalizeProperty(operation.property))) {
        throw new Error(`Conditional undo ${operation.id} does not match an active operation`);
      }
      active.delete(prior.id);
    } else {
      active.set(operation.id, operation);
    }
  }
  for (const operation of active.values()) {
    const {id, text} = operation.condition;
    const existing = groups.get(id);
    if (existing && (existing.when.value !== text || stableJson(existing.target) !== stableJson(operation.target))) {
      throw new Error(`Conditional group ${id} disagrees on target or source text`);
    }
    const group = existing ?? {id, target: operation.target, when: {kind: 'textEquals' as const, value: text}, operations: []};
    groups.set(id, group);
    const effect: ConditionalEffect = operation.kind === 'setText'
      ? {kind: 'setText', value: operation.value}
      : {kind: 'setStyle', property: operation.property, value: operation.value, priority: operation.priority ?? ''};
    const key = effect.kind === 'setText' ? 'text' : `style:${normalizeProperty(effect.property)}`;
    const previous = group.operations.findIndex(item => (item.kind === 'setText' ? 'text' : `style:${normalizeProperty(item.property)}`) === key);
    if (previous >= 0) group.operations.splice(previous, 1);
    group.operations.push(effect);
  }
  return [...groups.values()].filter(group => group.operations.length > 0);
}

function nextOverlayAttribute(document: Document): string {
  type Counter = {prefix: string; next: number};
  const shared = document as unknown as Record<symbol, Counter | undefined>;
  let counter = shared[OVERLAY_COUNTER_KEY];
  if (!counter || !/^[a-z0-9]+$/.test(counter.prefix) || !Number.isSafeInteger(counter.next)
    || counter.next < 0 || counter.next >= Number.MAX_SAFE_INTEGER) {
    const bytes = new Uint8Array(12);
    try { document.defaultView?.crypto?.getRandomValues(bytes); }
    catch { /* The timestamp and fallback random value still keep selectors isolated. */ }
    const random = [...bytes].some(Boolean)
      ? [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    counter = {prefix: random, next: 0};
    shared[OVERLAY_COUNTER_KEY] = counter;
  }
  counter.next += 1;
  return `data-lykar-overlay-${counter.prefix}-${counter.next.toString(36)}`;
}

function validateGroups(groups: ConditionalGroup[], document: Document): ConditionalGroup[] {
  if (groups.length > PROTOCOL_LIMITS.conditionalGroups) throw new Error('Too many conditional groups');
  const ids = new Set<string>();
  let operationCount = 0;
  for (const group of groups) {
    if (!group.id || group.id.length > PROTOCOL_LIMITS.conditionIdLength || ids.has(group.id)) throw new Error('Invalid conditional group id');
    ids.add(group.id);
    if (group.when.kind !== 'textEquals' || group.when.value.length > PROTOCOL_LIMITS.conditionTextLength) throw new Error('Invalid conditional source text');
    if (group.operations.length < 1 || group.operations.length > PROTOCOL_LIMITS.conditionalGroupOperations) throw new Error('Invalid conditional group size');
    operationCount += group.operations.length;
    if (operationCount > PROTOCOL_LIMITS.operations) throw new Error('Too many conditional effects');
    const effectKeys = new Set<string>();
    for (const effect of group.operations) {
      if (effect.value.length > PROTOCOL_LIMITS.manifestBytes) throw new Error('Conditional effect value exceeds the manifest bound');
      if (effect.kind === 'setStyle') validateStyle(document, effect);
      const key = effect.kind === 'setText' ? 'text' : `style:${normalizeProperty(effect.property)}`;
      if (effectKeys.has(key)) throw new Error('Conditional group has duplicate effects');
      effectKeys.add(key);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(groups)).byteLength > PROTOCOL_LIMITS.manifestBytes) {
    throw new Error('Conditional groups exceed the manifest byte bound');
  }
  return groups.map(group => ({...group, operations: group.operations.map(effect => ({...effect}))}));
}

function validateStyle(document: Document, effect: Extract<ConditionalEffect, {kind: 'setStyle'}>): void {
  const property = normalizeProperty(effect.property);
  if (!property || /(?:expression\s*\(|javascript\s*:|-moz-binding|!important\s*$)/i.test(effect.value)) throw new Error('Unsafe conditional style');
  if (effect.priority !== undefined && effect.priority !== '' && effect.priority !== 'important') throw new Error('Invalid conditional style priority');
  if (effect.value && !property.startsWith('--') && document.defaultView?.CSS?.supports && !document.defaultView.CSS.supports(property, effect.value)) {
    throw new Error('Unsupported conditional style');
  }
  const probe = document.createElement('div').style;
  probe.setProperty(property, effect.value, effect.priority ?? '');
  if (effect.value && !probe.getPropertyValue(property) && !/\b(?:var|env)\s*\(/i.test(effect.value)) throw new Error('Unsupported conditional style');
}

function plainTextNode(element: Element): Text | null {
  let found: Text | null = null;
  for (const node of element.childNodes) {
    if (node.nodeType === 8) continue;
    if (node.nodeType !== 3 || found) return null;
    found = node as Text;
  }
  return found;
}

function styleOf(element: Element): CSSStyleDeclaration | null {
  const style = (element as Element & {style?: CSSStyleDeclaration}).style;
  return style?.setProperty ? style : null;
}

function readStyle(style: CSSStyleDeclaration, property: string): StyleValue {
  return {value: style.getPropertyValue(property), priority: style.getPropertyPriority(property)};
}

function normalizeProperty(property: string): string | null {
  const trimmed = property.trim();
  if (/^--[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  const kebab = trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
  return /^-?[a-z][a-z0-9-]*$/.test(kebab) ? kebab : null;
}

function withinRoot(root: Document | Element, element: Element): boolean {
  return root.nodeType === 9
    ? (root as Document).documentElement?.contains(element) ?? false
    : root === element || root.contains(element);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
