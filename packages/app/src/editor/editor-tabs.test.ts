import { describe, expect, mock, test } from 'bun:test';
import {
  addOpenTab,
  createEditorTabSessionState,
  docNameForTabId,
  docTabId,
  filterOpenTabsForKnownTargets,
  folderTabId,
  localTabSessionStorageKey,
  nextActiveTabAfterClose,
  nextActiveTabAfterCloseMany,
  normalizeOpenTabs,
  parseEditorTabId,
  parseEditorTabSessionState,
  readLocalTabSessionState,
  remapOpenTabs,
  removeOpenTab,
  tabIdForNavigationTarget,
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

  test('normalizes folder tabs alongside document tabs', () => {
    const folder = folderTabId('docs/guides');
    expect(normalizeOpenTabs(['a', folder, folder, 42, 'b'], 10)).toEqual(['a', folder, 'b']);
  });

  test('derives tab ids for document and folder navigation targets', () => {
    expect(tabIdForNavigationTarget({ kind: 'doc', target: 'docs/a', docName: 'docs/a' })).toBe(
      docTabId('docs/a'),
    );
    expect(
      tabIdForNavigationTarget({
        kind: 'folder',
        target: 'docs',
        folderPath: 'docs',
      }),
    ).toBe(folderTabId('docs'));
    expect(tabIdForNavigationTarget({ kind: 'asset' })).toBeNull();
  });

  test('parses tab ids back to their navigation payload', () => {
    expect(parseEditorTabId(docTabId('docs/a'))).toEqual({ kind: 'doc', docName: 'docs/a' });
    expect(parseEditorTabId(folderTabId('docs'))).toEqual({
      kind: 'folder',
      folderPath: 'docs',
    });
    expect(docNameForTabId(folderTabId('docs'))).toBeNull();
  });

  test('addOpenTab appends new tabs and caps by dropping the oldest tab', () => {
    expect(addOpenTab(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
  });

  test('addOpenTab keeps existing tabs in place', () => {
    expect(addOpenTab(['a', 'b'], 'a', 10)).toEqual(['a', 'b']);
  });

  test('removeOpenTab removes only the requested tab', () => {
    expect(removeOpenTab(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  test('filterOpenTabsForKnownTargets drops stale folder tabs', () => {
    expect(
      filterOpenTabsForKnownTargets(
        ['docs/a', folderTabId('hello'), folderTabId('hello2'), 'missing'],
        {
          pages: new Set(['docs/a']),
          folderPaths: new Set(['hello']),
        },
      ),
    ).toEqual(['docs/a', folderTabId('hello')]);
  });

  test('filterOpenTabsForKnownTargets preserves the active missing document draft', () => {
    expect(
      filterOpenTabsForKnownTargets(['docs/a', 'Untitled', 'deleted'], {
        pages: new Set(['docs/a']),
        folderPaths: new Set(),
        keepMissingDocName: 'Untitled',
      }),
    ).toEqual(['docs/a', 'Untitled']);
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

  test('remapOpenTabs remaps folder tabs after folder rename', () => {
    expect(
      remapOpenTabs(
        [folderTabId('docs'), folderTabId('docs/guides'), 'docs/guides/a'],
        [{ fromDocName: 'docs/guides/a', toDocName: 'notes/guides/a' }],
        10,
        [{ fromPath: 'docs', toPath: 'notes' }],
      ),
    ).toEqual([folderTabId('notes'), folderTabId('notes/guides'), 'notes/guides/a']);
  });

  test('nextActiveTabAfterClose prefers the tab to the right, then left', () => {
    expect(nextActiveTabAfterClose(['a', 'b', 'c'], 'b', 'b')).toBe('c');
    expect(nextActiveTabAfterClose(['a', 'b'], 'b', 'b')).toBe('a');
    expect(nextActiveTabAfterClose(['a'], 'a', 'a')).toBeNull();
  });

  test('nextActiveTabAfterClose preserves active tab when closing an inactive tab', () => {
    expect(nextActiveTabAfterClose(['a', 'b', 'c'], 'a', 'c')).toBe('a');
  });

  test('nextActiveTabAfterCloseMany chooses the nearest surviving tab', () => {
    expect(nextActiveTabAfterCloseMany(['a', 'b', 'c', 'd'], 'b', ['b', 'c'])).toBe('d');
    expect(nextActiveTabAfterCloseMany(['a', 'b', 'c'], 'c', ['b', 'c'])).toBe('a');
    expect(nextActiveTabAfterCloseMany(['a', 'b'], 'a', ['a', 'b'])).toBeNull();
  });

  test('nextActiveTabAfterCloseMany preserves active tab when it survives', () => {
    expect(nextActiveTabAfterCloseMany(['a', 'b', 'c'], 'a', ['b', 'c'])).toBe('a');
  });

  test('parseEditorTabSessionState accepts only active tabs present in open tabs', () => {
    expect(
      parseEditorTabSessionState(
        { openTabs: ['a', 'b'], activeDocName: 'missing', updatedAt: '2026-05-06T00:00:00Z' },
        10,
      ),
    ).toEqual({
      openTabs: ['a', 'b'],
      activeDocName: null,
      activeTabId: null,
      updatedAt: '2026-05-06T00:00:00Z',
    });
  });

  test('parseEditorTabSessionState accepts active folder tabs', () => {
    const folder = folderTabId('docs');
    expect(
      parseEditorTabSessionState(
        { openTabs: ['a', folder], activeTabId: folder, updatedAt: '2026-05-06T00:00:00Z' },
        10,
      ),
    ).toEqual({
      openTabs: ['a', folder],
      activeDocName: null,
      activeTabId: folder,
      updatedAt: '2026-05-06T00:00:00Z',
    });
  });

  test('parseEditorTabSessionState restores legacy activeDocName as activeTabId', () => {
    expect(
      parseEditorTabSessionState(
        { openTabs: ['a', 'b'], activeDocName: 'b', updatedAt: '2026-05-06T00:00:00Z' },
        10,
      ),
    ).toEqual({
      openTabs: ['a', 'b'],
      activeDocName: 'b',
      activeTabId: 'b',
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
      activeTabId: 'b',
      updatedAt: '2026-05-06T00:00:00.000Z',
    });
  });

  test('createEditorTabSessionState stores active folder tabs without activeDocName', () => {
    const folder = folderTabId('docs');
    const state = createEditorTabSessionState(
      ['a', folder],
      folder,
      () => new Date('2026-05-06T00:00:00Z'),
    );
    expect(state).toEqual({
      openTabs: ['a', folder],
      activeDocName: null,
      activeTabId: folder,
      updatedAt: '2026-05-06T00:00:00.000Z',
    });
  });

  test('local tab session storage round-trips serializable state', () => {
    const storage = createMemoryStorage();
    const key = localTabSessionStorageKey('http://localhost:5173');
    const state = {
      openTabs: ['docs/a', 'docs/b'],
      activeDocName: 'docs/b',
      activeTabId: 'docs/b',
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
        activeTabId: null,
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
          activeTabId: 'docs/a',
          updatedAt: '2026-05-06T00:00:00.000Z',
        }),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe('[editor-tabs] failed to write local tab session:');
    });
  });
});
