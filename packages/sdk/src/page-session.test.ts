import {describe, expect, it, vi} from 'vitest';

import {PageSession, PageSessionStaleError} from './page-session.js';

describe('PageSession', () => {
  it('keeps project/page/root/generation and makes repeated start idempotent', () => {
    const root = document.createElement('main');
    const session = new PageSession('pk_test');
    const first = session.start({pathname: '/a', root});
    const repeated = session.start({pathname: '/a', root});

    expect(repeated.generation).toBe(first.generation);
    expect(session.snapshot()).toMatchObject({
      projectKey: 'pk_test', pathname: '/a', root, generation: 1, status: 'active',
    });
  });

  it('retires the previous generation and runs every registered cleanup once', () => {
    const cleanup = vi.fn();
    const session = new PageSession('pk_test');
    const first = session.start({pathname: '/a', root: document});
    first.registerCleanup(cleanup);

    const second = session.navigate({pathname: '/b', root: document});

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(() => first.assertCurrent()).toThrow(PageSessionStaleError);
    expect(second.generation).toBe(2);
    expect(cleanup).toHaveBeenCalledTimes(1);
    session.destroy();
    session.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(session.snapshot()).toMatchObject({pathname: '/b', generation: 2, status: 'destroyed'});
  });

  it('serializes replay in a generation but does not let a stale transport block navigation', async () => {
    const session = new PageSession('pk_test');
    const pageA = session.start({pathname: '/a', root: document});
    let finishA!: () => void;
    const pendingA = new Promise<void>(resolve => { finishA = resolve; });
    const first = session.runReplay(pageA, () => pendingA.then(() => 'a'));

    const pageB = session.navigate({pathname: '/b', root: document});
    const second = session.runReplay(pageB, async () => 'b');

    await expect(second).resolves.toBe('b');
    finishA();
    await expect(first).rejects.toBeInstanceOf(PageSessionStaleError);
  });

  it('provides a journal cleanup hook for the next replay stage', () => {
    const session = new PageSession('pk_test');
    const context = session.start({pathname: '/a', root: document});
    const cleanup = vi.fn();
    session.registerJournalCleanup(context, cleanup);
    session.refresh();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
