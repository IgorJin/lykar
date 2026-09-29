import {describe, expect, it} from 'vitest';
import {observeNavigation} from './navigation.js';

describe('automatic router observation', () => {
  it('shares one history wrapper and restores it after the final subscriber', () => {
    const original = window.history.pushState;
    let first = 0; let second = 0;
    const stopFirst = observeNavigation(window, () => first++);
    const wrapped = window.history.pushState;
    const stopSecond = observeNavigation(window, () => second++);
    expect(window.history.pushState).toBe(wrapped);
    window.history.pushState({}, '', '/a');
    expect([first, second]).toEqual([1, 1]);
    stopFirst();
    window.history.replaceState({}, '', '/b');
    expect([first, second]).toEqual([1, 2]);
    stopSecond();
    expect(window.history.pushState).toBe(original);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect([first, second]).toEqual([1, 2]);
  });
});
