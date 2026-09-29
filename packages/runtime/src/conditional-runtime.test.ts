import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Operation} from '@lykar/protocol';
import {ConditionalRuntime, compileConditionalGroups} from './conditional-runtime.js';
import type {ConditionalGroup} from './conditional-runtime.js';

const group = (id = 'continue', source = 'Продолжить', text = 'Далее', color = 'navy'): ConditionalGroup => ({
  id,
  target: {selectors: {css: '#cta'}},
  when: {kind: 'textEquals', value: source},
  operations: [{kind: 'setText', value: text}, {kind: 'setStyle', property: 'color', value: color}],
});

function runtime(groups: ConditionalGroup[] = [group()], isTargetReady?: (element: Element) => boolean): ConditionalRuntime {
  const instance = new ConditionalRuntime({
    document, root: document.body, groups,
    resolveTargetSync: target => {
      const matches = document.body.querySelectorAll(target.selectors?.css ?? 'invalid');
      return matches.length === 1 ? matches[0] : null;
    },
    isTargetReady,
  });
  instance.start();
  return instance;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('style').forEach(sheet => sheet.remove());
  vi.restoreAllMocks();
});

describe('ConditionalRuntime', () => {
  it('switches source text and style together, preserving the text node and latest host CSS', async () => {
    document.body.innerHTML = '<button id="cta" style="color: orange; background: white">Ожидаем</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const text = button.firstChild as Text;
    const instance = runtime();
    expect(button.textContent).toBe('Ожидаем');
    text.data = 'Продолжить';
    await Promise.resolve();
    expect(button.textContent).toBe('Далее');
    expect(button.firstChild).toBe(text);
    expect(getComputedStyle(button).color).toBe('rgb(0, 0, 128)');
    expect(instance.readSource(button)?.text).toBe('Продолжить');

    button.style.cssText = 'color: green; background: black';
    await Promise.resolve();
    expect(getComputedStyle(button).color).toBe('rgb(0, 0, 128)');
    expect(button.style.background).toBe('black');
    text.data = 'Ожидаем';
    await Promise.resolve();
    expect(button.textContent).toBe('Ожидаем');
    expect(button.style.color).toBe('green');
    expect(button.style.background).toBe('black');
    instance.dispose();
  });

  it('preserves host writes equal to the overlay and removes owned CSS on dispose', async () => {
    document.body.innerHTML = '<button id="cta" style="color: orange">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const sheets = document.head.querySelectorAll('style').length;
    const instance = runtime();
    expect(button.style.color).toBe('orange');
    button.style.color = 'navy';
    await Promise.resolve();
    instance.dispose();
    expect(button.style.color).toBe('navy');
    expect(button.textContent).toBe('Продолжить');
    expect(document.head.querySelectorAll('style')).toHaveLength(sheets);
    expect(button.getAttributeNames().filter(name => name.startsWith('data-lykar-overlay-'))).toEqual([]);
  });

  it('keeps same-queue host text and style writes separate from its own records', async () => {
    document.body.innerHTML = '<button id="cta" style="color: orange">Ожидаем</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const text = button.firstChild as Text;
    const instance = runtime();
    text.data = 'Продолжить';
    button.style.color = 'green';
    await Promise.resolve();
    expect(button.textContent).toBe('Далее');
    expect(instance.readSource(button)).toMatchObject({text: 'Продолжить', styles: {color: {value: 'green'}}});
    expect(instance.stats.ownRecords).toBeGreaterThan(0);
    text.data = 'Ожидаем';
    await Promise.resolve();
    expect(button.style.color).toBe('green');
    instance.dispose();
  });

  it('fails closed for inline important without leaving a partial text edit', () => {
    document.body.innerHTML = '<button id="cta" style="color: orange !important">Продолжить</button>';
    const instance = runtime();
    expect(document.querySelector('#cta')!.textContent).toBe('Продолжить');
    expect(instance.groupStates[0]).toMatchObject({status: 'unsafe', reason: 'APPLY_FAILED'});
    instance.dispose();
  });

  it('shares host baseline among conditions for the same element', async () => {
    document.body.innerHTML = '<button id="cta" style="color: orange">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const text = button.firstChild as Text;
    const instance = runtime([group(), group('waiting', 'Ожидаем', 'Подождите', 'gray')]);
    expect(button.textContent).toBe('Далее');
    expect(instance.readSource(button)?.text).toBe('Продолжить');
    text.data = 'Ожидаем';
    await Promise.resolve();
    expect(button.textContent).toBe('Подождите');
    expect(getComputedStyle(button).color).toBe('rgb(128, 128, 128)');
    expect(instance.readSource(button)?.text).toBe('Ожидаем');
    instance.dispose();
    expect(button.textContent).toBe('Ожидаем');
    expect(button.style.color).toBe('orange');
  });

  it('handles textContent replacement, remount and duplicate locator fail-closed', async () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const old = document.querySelector<HTMLButtonElement>('#cta')!;
    const instance = runtime();
    old.textContent = 'Ожидаем';
    await Promise.resolve();
    expect(old.textContent).toBe('Ожидаем');
    old.remove();
    const fresh = document.createElement('button');
    fresh.id = 'cta';
    fresh.textContent = 'Продолжить';
    document.body.append(fresh);
    await Promise.resolve();
    expect(fresh.textContent).toBe('Далее');
    const duplicate = fresh.cloneNode(true) as HTMLButtonElement;
    document.body.append(duplicate);
    await Promise.resolve();
    expect(fresh.textContent).toBe('Продолжить');
    expect(fresh.style.color).toBe('');
    expect(instance.groupStates[0].status).toBe('missing');
    instance.dispose();
  });

  it('waits for target readiness and applies synchronously once ready', () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    let ready = false;
    const instance = runtime([group()], () => ready);
    expect(button.textContent).toBe('Продолжить');
    expect(instance.groupStates[0].status).toBe('not-ready');
    ready = true;
    instance.sync();
    expect(button.textContent).toBe('Далее');
    instance.dispose();
  });

  it('replaceGroups removes old overlays and honors tombstone undo', () => {
    document.body.innerHTML = '<button id="cta" style="color: orange">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const instance = runtime();
    instance.replaceGroups([]);
    expect(button.textContent).toBe('Продолжить');
    expect(button.style.color).toBe('orange');

    const base = {schemaVersion: 2 as const, target: {selectors: {css: '#cta'}}, condition: {id: 'continue', text: 'Продолжить'}};
    const textOp = {...base, id: 'text', kind: 'setText' as const, value: 'Далее'};
    const colorOp = {...base, id: 'color', kind: 'setStyle' as const, property: 'color', value: 'navy'};
    const undo = {...colorOp, id: 'undo-color', revision: {reason: 'undo' as const, previousOperationId: 'color'}};
    const groups = compileConditionalGroups([textOp, colorOp, undo] as Operation[]);
    expect(groups[0].operations).toEqual([{kind: 'setText', value: 'Далее'}]);
    instance.replaceGroups(groups);
    expect(button.textContent).toBe('Далее');
    expect(button.style.color).toBe('orange');
    instance.dispose();
  });

  it('strips a copied overlay selector from a cloned target before reconciliation', async () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const instance = runtime();
    const overlayAttribute = button.getAttributeNames().find(name => name.startsWith('data-lykar-overlay-'))!;
    const clone = button.cloneNode(true) as HTMLButtonElement;
    clone.id = 'copy';
    document.body.append(clone);
    await Promise.resolve();
    expect(clone.hasAttribute(overlayAttribute)).toBe(false);
    expect(button.hasAttribute(overlayAttribute)).toBe(true);
    instance.dispose();
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('strips a copied overlay selector inside a cloned wrapper', async () => {
    document.body.innerHTML = '<div id="wrapper"><button id="cta">Продолжить</button></div>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const instance = runtime();
    const overlayAttribute = button.getAttributeNames().find(name => name.startsWith('data-lykar-overlay-'))!;
    const wrapper = document.querySelector('#wrapper')!.cloneNode(true) as Element;
    wrapper.id = 'copy-wrapper';
    const copiedButton = wrapper.querySelector('button')!;
    copiedButton.id = 'copy';
    document.body.append(wrapper);
    await Promise.resolve();
    expect(copiedButton.hasAttribute(overlayAttribute)).toBe(false);
    expect(button.hasAttribute(overlayAttribute)).toBe(true);
    expect(instance.groupStates[0].status).toBe('active');
    instance.dispose();
  });

  it('keeps selectors and cleanup isolated across two targets', () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button><button id="other">Продолжить</button>';
    const first = document.querySelector<HTMLButtonElement>('#cta')!;
    const second = document.querySelector<HTMLButtonElement>('#other')!;
    const firstRuntime = runtime();
    const secondGroup = group('other-group', 'Продолжить', 'Вперёд', 'gray');
    secondGroup.target = {selectors: {css: '#other'}};
    const secondRuntime = new ConditionalRuntime({
      document, root: document.body, groups: [secondGroup], resolveTargetSync: () => second,
    });
    secondRuntime.start();
    const firstAttribute = first.getAttributeNames().find(name => name.startsWith('data-lykar-overlay-'));
    const secondAttribute = second.getAttributeNames().find(name => name.startsWith('data-lykar-overlay-'));
    expect(firstAttribute).toBeTruthy();
    expect(secondAttribute).toBeTruthy();
    expect(firstAttribute).not.toBe(secondAttribute);
    expect(document.head.querySelectorAll('style')).toHaveLength(2);
    firstRuntime.dispose();
    expect(second.textContent).toBe('Вперёд');
    expect(second.hasAttribute(secondAttribute!)).toBe(true);
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
    secondRuntime.dispose();
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('fails closed before text mutation when the computed overlay color loses the cascade', () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const computed = getComputedStyle(element, pseudo);
      if (element !== button) return computed;
      return new Proxy(computed, {get(target, key) {
        if (key === 'getPropertyValue') return (property: string) => property === 'color'
          ? 'rgb(255, 0, 0)' : target.getPropertyValue(property);
        return Reflect.get(target, key);
      }});
    });
    const instance = runtime();
    expect(button.textContent).toBe('Продолжить');
    expect(instance.groupStates[0]).toMatchObject({status: 'unsafe', reason: 'STYLE_OVERLAY_OVERRIDDEN'});
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    instance.dispose();
  });

  it('rechecks color when host adds a stylesheet after activation', async () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const instance = runtime();
    expect(button.textContent).toBe('Далее');
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const computed = getComputedStyle(element, pseudo);
      if (element !== button) return computed;
      return new Proxy(computed, {get(target, key) {
        if (key === 'getPropertyValue') return (property: string) => property === 'color'
          ? 'rgb(255, 0, 0)' : target.getPropertyValue(property);
        return Reflect.get(target, key);
      }});
    });
    const hostSheet = document.createElement('style');
    hostSheet.textContent = '#cta { color: red !important }';
    document.head.append(hostSheet);
    await Promise.resolve();
    expect(button.textContent).toBe('Продолжить');
    expect(instance.groupStates[0].reason).toBe('STYLE_OVERLAY_OVERRIDDEN');
    instance.dispose();
    hostSheet.remove();
  });

  it('uses a connected head probe once per literal color', () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const original = window.getComputedStyle.bind(window);
    let connectedProbeReads = 0;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      if (element.tagName === 'SPAN' && element.parentNode === document.head && element.isConnected) {
        connectedProbeReads += 1;
      }
      return original(element, pseudo);
    });
    const instance = runtime();
    expect(connectedProbeReads).toBe(1);
    const ownWrites = instance.stats.ownRecords;
    for (let index = 0; index < 10; index += 1) instance.sync();
    expect(connectedProbeReads).toBe(1);
    expect(instance.stats.ownRecords).toBe(ownWrites);
    instance.dispose();
    expect(document.head.querySelectorAll('span')).toHaveLength(0);
  });

  it('removes overlays when the lifecycle becomes stale during target resolution', () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    let current = true;
    let staleOnResolve = false;
    const instance = new ConditionalRuntime({
      document, root: document.body, groups: [group()],
      isCurrent: () => current,
      resolveTargetSync: () => {
        if (staleOnResolve) current = false;
        return button;
      },
    });
    instance.start();
    expect(button.textContent).toBe('Далее');
    staleOnResolve = true;
    instance.sync();
    expect(button.textContent).toBe('Продолжить');
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect(instance.stats.suspended).toBe(true);
    expect(instance.groupStates[0].reason).toBe('STALE_SESSION');
  });

  it('keeps a reentrant dispose from applying after cleanup', () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    let instance: ConditionalRuntime;
    instance = new ConditionalRuntime({
      document, root: document.body, groups: [group()],
      resolveTargetSync: () => {
        instance.dispose();
        return button;
      },
    });
    instance.start();
    expect(button.textContent).toBe('Продолжить');
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect(instance.stats.suspended).toBe(true);
  });

  it('suspends and frees resources when one unrelated mutation batch exceeds the bound', async () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const instance = new ConditionalRuntime({
      document, root: document.body, groups: [group()], maxMutationRecords: 2,
      resolveTargetSync: () => button,
    });
    instance.start();
    document.body.append(document.createElement('div'));
    document.body.append(document.createElement('div'));
    document.body.append(document.createElement('div'));
    await Promise.resolve();
    expect(instance.stats.suspended).toBe(true);
    expect(button.textContent).toBe('Продолжить');
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect(instance.groupStates[0].reason).toBe('MUTATION_LIMIT');
  });

  it('fails closed when a nested insertion exceeds the bounded clone scan', async () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const instance = new ConditionalRuntime({
      document, root: document.body, groups: [group()], maxMutationRecords: 2,
      resolveTargetSync: () => button,
    });
    instance.start();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<span><span></span></span>';
    document.body.append(wrapper);
    await Promise.resolve();
    expect(instance.stats.suspended).toBe(true);
    expect(instance.groupStates[0].reason).toBe('CLONE_SCAN_LIMIT');
    expect(button.textContent).toBe('Продолжить');
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('bounds overlay resources through repeated source transitions', async () => {
    document.body.innerHTML = '<button id="cta">Ожидаем</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const text = button.firstChild as Text;
    const instance = runtime();
    for (let index = 0; index < 30; index += 1) {
      text.data = 'Продолжить';
      await Promise.resolve();
      expect(document.head.querySelectorAll('style')).toHaveLength(1);
      text.data = 'Ожидаем';
      await Promise.resolve();
      expect(document.head.querySelectorAll('style')).toHaveLength(0);
    }
    expect(instance.stats.suspended).toBe(false);
    instance.dispose();
  });

  it('fails closed when host removes the owned stylesheet and avoids a retry loop', () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const diagnostics: string[] = [];
    const instance = new ConditionalRuntime({
      document, root: document.body, groups: [group()],
      resolveTargetSync: () => button,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic.code),
    });
    instance.start();
    const firstSheet = document.head.querySelector('style')!;
    firstSheet.remove();
    instance.sync();
    expect(button.textContent).toBe('Продолжить');
    expect(instance.groupStates[0]).toMatchObject({status: 'unsafe', reason: 'STYLE_OVERLAY_LOST'});
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    const passes = instance.stats.syncPasses;
    for (let index = 0; index < 10; index += 1) instance.sync();
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect(instance.stats.syncPasses - passes).toBe(10);
    expect(diagnostics.filter(code => code === 'STYLE_OVERLAY_LOST')).toHaveLength(1);
    instance.dispose();
  });

  it('observes head removal even when the runtime root is an element', async () => {
    document.body.innerHTML = '<button id="cta">Продолжить</button>';
    const button = document.querySelector<HTMLButtonElement>('#cta')!;
    const instance = runtime();
    document.head.querySelector('style')!.remove();
    await Promise.resolve();
    expect(instance.stats.suspended).toBe(true);
    expect(instance.groupStates[0].reason).toBe('STYLE_OVERLAY_LOST');
    expect(button.textContent).toBe('Продолжить');
  });
});
