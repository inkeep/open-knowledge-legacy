import { afterEach, describe, expect, test } from 'bun:test';
import { emitCreateTopLevelFile, subscribeToCreateTopLevelFile } from './create-file-events';

const originalWindow = globalThis.window;

type Listener = (event: Event) => void;

function installFakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  const fakeWindow = {
    addEventListener(type: string, listener: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
    writable: true,
  });

  return fakeWindow;
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
    writable: true,
  });
});

describe('create top-level file event bridge', () => {
  test('subscriber receives the emitted request', () => {
    installFakeWindow();
    let calls = 0;
    const unsubscribe = subscribeToCreateTopLevelFile(() => {
      calls += 1;
    });

    emitCreateTopLevelFile();
    emitCreateTopLevelFile();

    unsubscribe();
    expect(calls).toBe(2);
  });

  test('unsubscribe stops further deliveries', () => {
    installFakeWindow();
    let calls = 0;
    const unsubscribe = subscribeToCreateTopLevelFile(() => {
      calls += 1;
    });

    emitCreateTopLevelFile();
    unsubscribe();
    emitCreateTopLevelFile();

    expect(calls).toBe(1);
  });

  test('multiple subscribers all fire on a single emit', () => {
    installFakeWindow();
    const received: string[] = [];
    const offA = subscribeToCreateTopLevelFile(() => received.push('a'));
    const offB = subscribeToCreateTopLevelFile(() => received.push('b'));

    emitCreateTopLevelFile();

    offA();
    offB();
    expect(received.sort()).toEqual(['a', 'b']);
  });
});
