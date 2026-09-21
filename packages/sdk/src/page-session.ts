export type PageSessionRoot = Document | Element;

export type PageSessionScope = {
  pathname: string;
  root: PageSessionRoot;
  pageId?: string;
  draftId?: string;
};

export type PageSessionSnapshot = PageSessionScope & {
  projectKey: string;
  generation: number;
  status: 'active' | 'destroyed';
};

export type PageSessionContext = PageSessionSnapshot & {
  signal: AbortSignal;
  isCurrent: () => boolean;
  assertCurrent: () => void;
  registerCleanup: (cleanup: () => void) => () => void;
};

export class PageSessionStaleError extends Error {
  readonly code = 'PAGE_SESSION_STALE';

  constructor(message = 'PageSession generation is no longer current.') {
    super(message);
    this.name = 'PageSessionStaleError';
  }
}

/**
 * Owns all asynchronous work and resources for one logical page/root context.
 * A navigation or refresh retires the previous generation synchronously.
 */
export class PageSession {
  readonly projectKey: string;

  private generationValue = 0;
  private current?: {
    scope: PageSessionScope;
    controller: AbortController;
    cleanups: Set<() => void>;
  };
  private destroyed = true;
  private lastScope?: PageSessionScope;
  private replayTail: Promise<void> = Promise.resolve();

  constructor(projectKey: string) {
    if (!projectKey.trim()) throw new Error('PageSession requires a projectKey.');
    this.projectKey = projectKey;
  }

  start(scope: PageSessionScope): PageSessionContext {
    if (this.current && !this.destroyed && sameScope(this.current.scope, scope)) {
      return this.contextFor(this.generationValue);
    }
    return this.activate(scope);
  }

  navigate(scope: PageSessionScope): PageSessionContext {
    return this.activate(scope);
  }

  refresh(scope: PageSessionScope = this.requireScope()): PageSessionContext {
    return this.activate(scope);
  }

  updateScope(context: PageSessionContext, update: Pick<PageSessionScope, 'pageId' | 'draftId'>): void {
    context.assertCurrent();
    const active = this.current!;
    active.scope = {
      ...active.scope,
      ...(update.pageId !== undefined ? {pageId: update.pageId} : {}),
      ...(update.draftId !== undefined ? {draftId: update.draftId} : {}),
    };
    this.lastScope = active.scope;
  }

  /** Serialize replay work within the active generation/root. */
  runReplay<T>(context: PageSessionContext, work: () => Promise<T>): Promise<T> {
    const run = this.replayTail.then(async () => {
      context.assertCurrent();
      const result = await work();
      context.assertCurrent();
      return result;
    });
    this.replayTail = run.then(() => undefined, () => undefined);
    return run;
  }

  registerJournalCleanup(context: PageSessionContext, cleanup: () => void): () => void {
    return context.registerCleanup(cleanup);
  }

  snapshot(): PageSessionSnapshot {
    const scope = this.current?.scope ?? this.lastScope;
    if (!scope) {
      throw new Error('PageSession has not been started.');
    }
    return {
      projectKey: this.projectKey,
      ...scope,
      generation: this.generationValue,
      status: this.destroyed ? 'destroyed' : 'active',
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.retireCurrent();
    this.destroyed = true;
  }

  private activate(scope: PageSessionScope): PageSessionContext {
    validateScope(scope);
    this.retireCurrent();
    this.generationValue += 1;
    this.destroyed = false;
    this.current = {
      scope: {...scope},
      controller: new AbortController(),
      cleanups: new Set(),
    };
    this.lastScope = this.current.scope;
    // A retired generation must not keep a new route behind an unresolved transport.
    this.replayTail = Promise.resolve();
    return this.contextFor(this.generationValue);
  }

  private contextFor(generation: number): PageSessionContext {
    const active = this.current;
    if (!active) throw new PageSessionStaleError();
    const isCurrent = () => (
      !this.destroyed
      && this.generationValue === generation
      && this.current === active
      && !active.controller.signal.aborted
    );
    const assertCurrent = () => {
      if (!isCurrent()) throw new PageSessionStaleError();
    };
    const registerCleanup = (cleanup: () => void): (() => void) => {
      assertCurrent();
      active.cleanups.add(cleanup);
      return () => active.cleanups.delete(cleanup);
    };
    return {
      projectKey: this.projectKey,
      ...active.scope,
      generation,
      status: 'active',
      signal: active.controller.signal,
      isCurrent,
      assertCurrent,
      registerCleanup,
    };
  }

  private retireCurrent(): void {
    const active = this.current;
    if (!active) return;
    active.controller.abort(new PageSessionStaleError());
    for (const cleanup of [...active.cleanups].reverse()) {
      try { cleanup(); } catch { /* Cleanup is best-effort and must continue. */ }
    }
    active.cleanups.clear();
    this.current = undefined;
  }

  private requireScope(): PageSessionScope {
    if (!this.current) throw new Error('PageSession refresh requires an active scope.');
    return this.current.scope;
  }
}

export function isPageSessionStale(error: unknown): boolean {
  return error instanceof PageSessionStaleError
    || (error instanceof DOMException && error.name === 'AbortError')
    || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError');
}

function validateScope(scope: PageSessionScope): void {
  if (!scope.pathname.startsWith('/')) throw new Error('PageSession pathname must start with /.');
  if (scope.root.nodeType !== 1 && scope.root.nodeType !== 9) {
    throw new Error('PageSession root must be a Document or Element.');
  }
}

function sameScope(left: PageSessionScope, right: PageSessionScope): boolean {
  return left.pathname === right.pathname
    && left.root === right.root
    && left.pageId === right.pageId
    && left.draftId === right.draftId;
}
