import { describe, expect, mock, test } from 'bun:test';
import {
  addOpenTab,
  createEditorTabSessionState,
  localTabSessionStorageKey,
  nextActiveDocAfterClose,
  normalizeOpenTabs,
  parseEditorTabSessionState,
  readLocalTabSessionState,
  remapOpenTabs,
  removeOpenTab,
  writeLocalTabSessionState,
} from './editor-tabs';

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

function withConsoleWarnStub(fn: (warn: ReturnType<typeof mock>) => void) {
  const originalWarn = console.warn;
  const warn = mock(() => {});
  console.warn = warn as unknown as typeof console.warn;
  try {
    fn(warn);
  } finally {
    console.warn = originalWarn;
  }
}

describe('editor tab state', () => {
  test('normalizes persisted tabs by filtering invalid and duplicate entries', () => {
    expect(normalizeOpenTabs(['a', '', 'a', 'b', 42, 'c'], 3)).toEqual(['a', 'b', 'c']);
  });

  test('addOpenTab appends new tabs and caps by dropping the oldest tab', () => {
    expect(addOpenTab(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
  });

  test('addOpenTab keeps existing tabs in place', () => {
    expect(addOpenTab(['a', 'b'], 'a', 10)).toEqual(['a', 'b']);
  });

  test('removeOpenTab removes only the requested doc', () => {
    expect(removeOpenTab(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  test('remapOpenTabs preserves tab order and dedupes renamed destinations', () => {
    expect(
      remapOpenTabs(
        ['docs/a', 'docs/b', 'other'],
        [
          { fromDocName: 'docs/a', toDocName: 'notes/a' },
          { fromDocName: 'docs/b', toDocName: 'other' },
        ],
        10,
      ),
    ).toEqual(['notes/a', 'other']);
  });

  test('nextActiveDocAfterClose prefers the tab to the right, then left', () => {
    expect(nextActiveDocAfterClose(['a', 'b', 'c'], 'b', 'b')).toBe('c');
    expect(nextActiveDocAfterClose(['a', 'b'], 'b', 'b')).toBe('a');
    expect(nextActiveDocAfterClose(['a'], 'a', 'a')).toBeNull();
  });

  test('nextActiveDocAfterClose preserves active doc when closing an inactive tab', () => {
    expect(nextActiveDocAfterClose(['a', 'b', 'c'], 'a', 'c')).toBe('a');
  });

  test('parseEditorTabSessionState accepts only active docs present in open tabs', () => {
    expect(
      parseEditorTabSessionState(
        { openTabs: ['a', 'b'], activeDocName: 'missing', updatedAt: '2026-05-06T00:00:00Z' },
        10,
      ),
    ).toEqual({
      openTabs: ['a', 'b'],
      activeDocName: null,
      updatedAt: '2026-05-06T00:00:00Z',
    });
  });

  test('createEditorTabSessionState timestamps serializable state', () => {
    const state = createEditorTabSessionState(
      ['a', 'b'],
      'b',
      () => new Date('2026-05-06T00:00:00Z'),
    );
    expect(state).toEqual({
      openTabs: ['a', 'b'],
      activeDocName: 'b',
      updatedAt: '2026-05-06T00:00:00.000Z',
    });
  });

  test('local tab session storage round-trips serializable state', () => {
    const storage = createMemoryStorage();
    const key = localTabSessionStorageKey('http://localhost:5173');
    const state = {
      openTabs: ['docs/a', 'docs/b'],
      activeDocName: 'docs/b',
      updatedAt: '2026-05-06T00:00:00.000Z',
    };

    writeLocalTabSessionState(storage, key, state);

    expect(readLocalTabSessionState(storage, key, 10)).toEqual(state);
  });

  test('local tab session storage returns empty state for corrupted JSON', () => {
    withConsoleWarnStub((warn) => {
      const storage: Pick<Storage, 'getItem'> = {
        getItem: () => '{not-json',
      };

      expect(readLocalTabSessionState(storage, 'key', 10)).toEqual({
        openTabs: [],
        activeDocName: null,
        updatedAt: null,
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe('[editor-tabs] failed to read local tab session:');
    });
  });

  test('local tab session storage write swallows quota failures', () => {
    withConsoleWarnStub((warn) => {
      const storage: Pick<Storage, 'setItem'> = {
        setItem: () => {
          throw new Error('quota exceeded');
        },
      };

      expect(() =>
        writeLocalTabSessionState(storage, 'key', {
          openTabs: ['docs/a'],
          activeDocName: 'docs/a',
          updatedAt: '2026-05-06T00:00:00.000Z',
        }),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe('[editor-tabs] failed to write local tab session:');
    });
  });
});
