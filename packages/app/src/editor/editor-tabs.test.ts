import { describe, expect, mock, test } from 'bun:test';
import {
  addOpenTab,
  addPinnedTab,
  applyDragPinMutation,
  assetTabId,
  createEditorTabSessionState,
  docNameForTabId,
  docTabId,
  filterClosableTabIds,
  filterOpenTabsForKnownTargets,
  findOpenTabTarget,
  folderTabId,
  localTabSessionStorageKey,
  nextActiveTabAfterClose,
  nextActiveTabAfterCloseMany,
  nextAvailableDocTabId,
  nextAvailableTabId,
  normalizeOpenTabs,
  normalizePinnedTabIds,
  openDocTab,
  openTab,
  parseEditorTabId,
  parseEditorTabSessionState,
  readLocalTabSessionState,
  reconcileVisibleTabOrder,
  remapOpenTabs,
  remapVisibleTabsForRename,
  removeOpenTab,
  removePinnedTab,
  replaceOpenTab,
  sameTabTarget,
  tabIdForNavigationTarget,
  tabParts,
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

  test('normalizes asset tabs alongside document tabs', () => {
    const asset = assetTabId('docs/photo.png');
    expect(normalizeOpenTabs(['a', asset, asset, 42, 'b'], 10)).toEqual(['a', asset, 'b']);
  });

  test('normalizes pinned tabs against the open tab set', () => {
    expect(normalizePinnedTabIds(['b', 'missing', 'b', '', 42], ['a', 'b', 'c'])).toEqual(['b']);
  });

  test('adds and removes pinned tabs only when the tab is open', () => {
    expect(addPinnedTab(['a'], 'b', ['a', 'b'])).toEqual(['a', 'b']);
    expect(addPinnedTab(['a'], 'missing', ['a', 'b'])).toEqual(['a']);
    expect(removePinnedTab(['a', 'b'], 'a')).toEqual(['b']);
  });

  test('filters close batches so pinned tabs survive close-all and close-others actions', () => {
    expect(filterClosableTabIds(['a', 'b', 'c', 'b'], ['b'])).toEqual(['a', 'c']);
  });

  test('derives tab ids for document, folder, and asset navigation targets', () => {
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
    expect(
      tabIdForNavigationTarget({
        kind: 'asset',
        target: 'docs/photo.png',
        assetPath: 'docs/photo.png',
      }),
    ).toBe(assetTabId('docs/photo.png'));
  });

  test('parses tab ids back to their navigation payload', () => {
    expect(parseEditorTabId(docTabId('docs/a'))).toEqual({ kind: 'doc', docName: 'docs/a' });
    expect(parseEditorTabId('docs/a\u0000doc-tab:1')).toEqual({
      kind: 'doc',
      docName: 'docs/a',
    });
    expect(parseEditorTabId(folderTabId('docs'))).toEqual({
      kind: 'folder',
      folderPath: 'docs',
    });
    expect(parseEditorTabId(`${folderTabId('docs')}\u0000doc-tab:1`)).toEqual({
      kind: 'folder',
      folderPath: 'docs',
    });
    expect(parseEditorTabId(assetTabId('docs/photo.png'))).toEqual({
      kind: 'asset',
      assetPath: 'docs/photo.png',
    });
    expect(parseEditorTabId(`${assetTabId('docs/photo.png')}\u0000doc-tab:1`)).toEqual({
      kind: 'asset',
      assetPath: 'docs/photo.png',
    });
    expect(docNameForTabId(folderTabId('docs'))).toBeNull();
    expect(docNameForTabId(assetTabId('docs/photo.png'))).toBeNull();
  });

  test('addOpenTab appends new tabs and caps by dropping the oldest tab', () => {
    expect(addOpenTab(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
  });

  test('addOpenTab preserves pinned tabs while capping unpinned tabs', () => {
    expect(addOpenTab(['pinned', 'a', 'b'], 'c', 2, ['pinned'])).toEqual(['pinned', 'b', 'c']);
  });

  test('addOpenTab keeps existing tabs in place', () => {
    expect(addOpenTab(['a', 'b'], 'a', 10)).toEqual(['a', 'b']);
  });

  test('replaceOpenTab dedupes the destination tab while replacing the active tab', () => {
    expect(replaceOpenTab(['foo.md', 'bar.md', 'baz.md'], 'bar.md', 'foo.md', 10)).toEqual([
      'foo.md',
      'baz.md',
    ]);
  });

  test('replaceOpenTab appends when there is no current tab', () => {
    expect(replaceOpenTab(['foo.md'], null, 'bar.md', 10)).toEqual(['foo.md', 'bar.md']);
  });

  test('replaceOpenTab ignores invalid destination tab ids', () => {
    expect(replaceOpenTab(['foo.md', '', 'bar.md'], 'foo.md', '', 10)).toEqual([
      'foo.md',
      'bar.md',
    ]);
  });

  test('replaceOpenTab appends when the current tab is missing', () => {
    expect(replaceOpenTab(['foo.md'], 'missing.md', 'bar.md', 10)).toEqual(['foo.md', 'bar.md']);
  });

  test('replaceOpenTab replaces document tabs with folder tabs', () => {
    expect(
      replaceOpenTab(['foo.md', folderTabId('docs')], 'foo.md', folderTabId('guides'), 10),
    ).toEqual([folderTabId('guides'), folderTabId('docs')]);
  });

  test('replaceOpenTab preserves pinned tabs while capping unpinned tabs', () => {
    expect(replaceOpenTab(['pinned', 'a', 'b'], 'b', 'c', 1, ['pinned'])).toEqual(['pinned', 'c']);
  });

  test('openDocTab appends a new document tab', () => {
    expect(
      openDocTab(['foo.md'], 'bar.md', {
        behavior: 'append',
        currentTabId: 'foo.md',
        limit: 10,
      }),
    ).toEqual({
      tabs: ['foo.md', 'bar.md'],
      activeTabId: 'bar.md',
    });
  });

  test('openDocTab keeps the current tab when replace-active targets the same document', () => {
    expect(
      openDocTab(['foo.md'], 'foo.md', {
        behavior: 'replace-active',
        currentTabId: 'foo.md',
        limit: 10,
      }),
    ).toEqual({
      tabs: ['foo.md'],
      activeTabId: 'foo.md',
    });
  });

  test('openDocTab focuses the existing tab when replace-active targets an already-open doc', () => {
    expect(
      openDocTab(['foo.md', 'bar.md'], 'foo.md', {
        behavior: 'replace-active',
        currentTabId: 'bar.md',
        limit: 10,
      }),
    ).toEqual({
      tabs: ['foo.md', 'bar.md'],
      activeTabId: 'foo.md',
    });
  });

  test('openDocTab mints a new tab when the target is not already open under replace-active', () => {
    expect(
      openDocTab(['bar.md'], 'foo.md', {
        behavior: 'replace-active',
        currentTabId: 'bar.md',
        limit: 10,
      }),
    ).toEqual({
      tabs: ['foo.md'],
      activeTabId: 'foo.md',
    });
  });

  test('openDocTab focuses an existing duplicate instance instead of minting another one', () => {
    const duplicateFooTab1 = 'foo.md\u0000doc-tab:1';

    expect(
      openDocTab(['foo.md', duplicateFooTab1, 'bar.md'], 'foo.md', {
        behavior: 'replace-active',
        currentTabId: 'bar.md',
        limit: 10,
      }),
    ).toEqual({
      tabs: ['foo.md', duplicateFooTab1, 'bar.md'],
      activeTabId: 'foo.md',
    });
  });

  test('nextAvailableDocTabId returns a duplicate id when the canonical doc tab exists', () => {
    expect(nextAvailableDocTabId(['foo', 'foo\u0000doc-tab:1'], 'foo')).toBe('foo\u0000doc-tab:2');
  });

  test('nextAvailableTabId returns a duplicate id when a canonical folder or asset tab exists', () => {
    expect(
      nextAvailableTabId(
        [folderTabId('docs'), `${folderTabId('docs')}\u0000doc-tab:1`],
        folderTabId('docs'),
      ),
    ).toBe(`${folderTabId('docs')}\u0000doc-tab:2`);
    expect(nextAvailableTabId([assetTabId('docs/photo.png')], assetTabId('docs/photo.png'))).toBe(
      `${assetTabId('docs/photo.png')}\u0000doc-tab:1`,
    );
  });

  test('findOpenTabTarget returns an existing duplicate tab for a canonical target', () => {
    const folder = folderTabId('docs');
    const duplicateFolder = `${folder}\u0000doc-tab:1`;

    expect(findOpenTabTarget([duplicateFolder], folder)).toBe(duplicateFolder);
    expect(findOpenTabTarget(['other'], folder)).toBeNull();
  });

  test('sameTabTarget matches duplicate ids against their canonical target', () => {
    const folder = folderTabId('docs');
    const duplicateFolder = `${folder}\u0000doc-tab:1`;
    const asset = assetTabId('docs/photo.png');

    expect(sameTabTarget(duplicateFolder, folder)).toBe(true);
    expect(sameTabTarget(duplicateFolder, asset)).toBe(false);
  });

  test('openDocTab append preserves an active duplicate tab for the same document', () => {
    const duplicateFooTab = 'foo.md\u0000doc-tab:1';

    expect(
      openDocTab(['foo.md', duplicateFooTab], 'foo.md', {
        behavior: 'append',
        currentTabId: duplicateFooTab,
        limit: 10,
      }),
    ).toEqual({
      tabs: ['foo.md', duplicateFooTab],
      activeTabId: duplicateFooTab,
    });
  });

  test('openTab focuses the existing folder tab when replace-active targets an already-open folder', () => {
    const folder = folderTabId('docs');

    expect(
      openTab([folder, 'bar.md'], folder, {
        behavior: 'replace-active',
        currentTabId: 'bar.md',
        limit: 10,
      }),
    ).toEqual({
      tabs: [folder, 'bar.md'],
      activeTabId: folder,
    });
  });

  test('openTab focuses the existing asset tab when a blank tab targets the same asset', () => {
    const asset = assetTabId('docs/photo.png');

    expect(
      openTab([asset], asset, {
        behavior: 'replace-active',
        currentTabId: null,
        limit: 10,
      }),
    ).toEqual({
      tabs: [asset],
      activeTabId: asset,
    });
  });

  test('openTab preserves the current duplicate tab when it already targets the same asset', () => {
    const asset = assetTabId('docs/photo.png');
    const duplicateAsset = `${asset}\u0000doc-tab:1`;

    expect(
      openTab([asset, duplicateAsset], asset, {
        behavior: 'replace-active',
        currentTabId: duplicateAsset,
        limit: 10,
      }),
    ).toEqual({
      tabs: [asset, duplicateAsset],
      activeTabId: duplicateAsset,
    });
  });

  test('removeOpenTab removes only the requested tab', () => {
    expect(removeOpenTab(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  test('reconcileVisibleTabOrder preserves interleaved blank-tab positions', () => {
    expect(
      reconcileVisibleTabOrder(['doc-a', 'new-tab:1', 'doc-b'], ['doc-a', 'doc-b'], ['new-tab:1']),
    ).toEqual(['doc-a', 'new-tab:1', 'doc-b']);
  });

  test('reconcileVisibleTabOrder appends newly-created ids and drops stale ids', () => {
    expect(
      reconcileVisibleTabOrder(
        ['stale-doc', 'doc-a', 'new-tab:1', 'stale-new'],
        ['doc-a', 'doc-b'],
        ['new-tab:1', 'new-tab:2'],
      ),
    ).toEqual(['doc-a', 'new-tab:1', 'doc-b', 'new-tab:2']);
  });

  test('filterOpenTabsForKnownTargets drops stale folder tabs', () => {
    expect(
      filterOpenTabsForKnownTargets(
        ['docs/a', folderTabId('hello'), folderTabId('hello2'), 'missing'],
        {
          pages: new Set(['docs/a']),
          folderPaths: new Set(['hello']),
          assetPaths: new Set(),
        },
      ),
    ).toEqual(['docs/a', folderTabId('hello')]);
  });

  test('filterOpenTabsForKnownTargets preserves the active missing document draft', () => {
    expect(
      filterOpenTabsForKnownTargets(['docs/a', 'Untitled', 'deleted'], {
        pages: new Set(['docs/a']),
        folderPaths: new Set(),
        assetPaths: new Set(),
        keepMissingDocName: 'Untitled',
      }),
    ).toEqual(['docs/a', 'Untitled']);
  });

  test('filterOpenTabsForKnownTargets drops stale asset tabs', () => {
    expect(
      filterOpenTabsForKnownTargets(
        ['docs/a', assetTabId('docs/photo.png'), assetTabId('docs/deleted.png')],
        {
          pages: new Set(['docs/a']),
          folderPaths: new Set(),
          assetPaths: new Set(['docs/photo.png']),
        },
      ),
    ).toEqual(['docs/a', assetTabId('docs/photo.png')]);
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
        [
          folderTabId('docs'),
          folderTabId('docs/guides'),
          assetTabId('docs/guides/photo.png'),
          `${assetTabId('docs/guides/photo.png')}\u0000doc-tab:1`,
          'docs/guides/a',
        ],
        [{ fromDocName: 'docs/guides/a', toDocName: 'notes/guides/a' }],
        10,
        [{ fromPath: 'docs', toPath: 'notes' }],
      ),
    ).toEqual([
      folderTabId('notes'),
      folderTabId('notes/guides'),
      assetTabId('notes/guides/photo.png'),
      `${assetTabId('notes/guides/photo.png')}\u0000doc-tab:1`,
      'notes/guides/a',
    ]);
  });

  test('remapOpenTabs preserves pinned tabs while capping unpinned tabs', () => {
    expect(
      remapOpenTabs(
        ['pinned', 'a', 'b'],
        [{ fromDocName: 'pinned', toDocName: 'renamed' }],
        1,
        [],
        ['pinned'],
      ),
    ).toEqual(['renamed', 'b']);
  });

  test('remapVisibleTabsForRename — doc rename preserves slot order', () => {
    expect(
      remapVisibleTabsForRename(
        ['foo.md', 'bar.md', 'baz.md'],
        [{ fromDocName: 'foo.md', toDocName: 'bazz.md' }],
      ),
    ).toEqual(['bazz.md', 'bar.md', 'baz.md']);
  });

  test('remapVisibleTabsForRename — uncapped (no limit applied to visible tabs)', () => {
    const many = Array.from({ length: 100 }, (_, i) => `doc${i}.md`);
    const result = remapVisibleTabsForRename(many, [
      { fromDocName: 'doc0.md', toDocName: 'renamed0.md' },
      { fromDocName: 'doc99.md', toDocName: 'renamed99.md' },
    ]);
    expect(result).toHaveLength(100);
    expect(result[0]).toBe('renamed0.md');
    expect(result[99]).toBe('renamed99.md');
    expect(result.slice(1, 99)).toEqual(many.slice(1, 99));
  });

  test('remapVisibleTabsForRename — folder rename remaps every nested visible tab', () => {
    expect(
      remapVisibleTabsForRename(
        [folderTabId('docs'), folderTabId('docs/guides'), 'docs/guides/a.md', 'other.md'],
        [{ fromDocName: 'docs/guides/a.md', toDocName: 'notes/guides/a.md' }],
        [{ fromPath: 'docs', toPath: 'notes' }],
      ),
    ).toEqual([folderTabId('notes'), folderTabId('notes/guides'), 'notes/guides/a.md', 'other.md']);
  });

  test('remapVisibleTabsForRename — multiple renames apply atomically', () => {
    expect(
      remapVisibleTabsForRename(
        ['a.md', 'b.md', 'c.md'],
        [
          { fromDocName: 'a.md', toDocName: 'x.md' },
          { fromDocName: 'c.md', toDocName: 'z.md' },
        ],
      ),
    ).toEqual(['x.md', 'b.md', 'z.md']);
  });

  test('remapVisibleTabsForRename — empty rename list is a no-op', () => {
    expect(remapVisibleTabsForRename(['a.md', 'b.md'], [])).toEqual(['a.md', 'b.md']);
  });

  test('remapVisibleTabsForRename — new-tab placeholder is preserved through rename', () => {
    expect(
      remapVisibleTabsForRename(
        ['foo.md', 'new-tab:1', 'bar.md'],
        [{ fromDocName: 'foo.md', toDocName: 'bazz.md' }],
      ),
    ).toEqual(['bazz.md', 'new-tab:1', 'bar.md']);
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
      pinnedTabIds: [],
      activeDocName: null,
      activeTabId: null,
      updatedAt: '2026-05-06T00:00:00Z',
    });
  });

  test('parseEditorTabSessionState preserves pinned tabs beyond the unpinned tab cap', () => {
    expect(
      parseEditorTabSessionState(
        {
          openTabs: ['pinned', 'a', 'b', 'c'],
          pinnedTabIds: ['pinned'],
          activeTabId: 'c',
          updatedAt: '2026-05-06T00:00:00Z',
        },
        2,
      ),
    ).toEqual({
      openTabs: ['pinned', 'b', 'c'],
      pinnedTabIds: ['pinned'],
      activeDocName: 'c',
      activeTabId: 'c',
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
      pinnedTabIds: [],
      activeDocName: null,
      activeTabId: folder,
      updatedAt: '2026-05-06T00:00:00Z',
    });
  });

  test('parseEditorTabSessionState accepts active asset tabs', () => {
    const asset = assetTabId('docs/photo.png');
    expect(
      parseEditorTabSessionState(
        { openTabs: ['a', asset], activeTabId: asset, updatedAt: '2026-05-06T00:00:00Z' },
        10,
      ),
    ).toEqual({
      openTabs: ['a', asset],
      pinnedTabIds: [],
      activeDocName: null,
      activeTabId: asset,
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
      pinnedTabIds: [],
      activeDocName: 'b',
      activeTabId: 'b',
      updatedAt: '2026-05-06T00:00:00Z',
    });
  });

  test('createEditorTabSessionState timestamps serializable state', () => {
    const state = createEditorTabSessionState(
      ['a', 'b'],
      'b',
      ['a'],
      () => new Date('2026-05-06T00:00:00Z'),
    );
    expect(state).toEqual({
      openTabs: ['a', 'b'],
      pinnedTabIds: ['a'],
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
      [],
      () => new Date('2026-05-06T00:00:00Z'),
    );
    expect(state).toEqual({
      openTabs: ['a', folder],
      pinnedTabIds: [],
      activeDocName: null,
      activeTabId: folder,
      updatedAt: '2026-05-06T00:00:00.000Z',
    });
  });

  test('createEditorTabSessionState stores active asset tabs without activeDocName', () => {
    const asset = assetTabId('docs/photo.png');
    const state = createEditorTabSessionState(
      ['a', asset],
      asset,
      [],
      () => new Date('2026-05-06T00:00:00Z'),
    );
    expect(state).toEqual({
      openTabs: ['a', asset],
      pinnedTabIds: [],
      activeDocName: null,
      activeTabId: asset,
      updatedAt: '2026-05-06T00:00:00.000Z',
    });
  });

  test('local tab session storage round-trips serializable state', () => {
    const storage = createMemoryStorage();
    const key = localTabSessionStorageKey('http://localhost:5173');
    const state = {
      openTabs: ['docs/a', 'docs/b'],
      pinnedTabIds: ['docs/a'],
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
        pinnedTabIds: [],
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
          pinnedTabIds: [],
          activeDocName: 'docs/a',
          activeTabId: 'docs/a',
          updatedAt: '2026-05-06T00:00:00.000Z',
        }),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe('[editor-tabs] failed to write local tab session:');
    });
  });

  test('readLocalTabSessionState returns empty state when storage is null', () => {
    expect(readLocalTabSessionState(null, 'key', 10)).toEqual({
      openTabs: [],
      pinnedTabIds: [],
      activeDocName: null,
      activeTabId: null,
      updatedAt: null,
    });
  });

  test('writeLocalTabSessionState is a silent no-op when storage is null', () => {
    expect(() =>
      writeLocalTabSessionState(null, 'key', {
        openTabs: ['docs/a'],
        pinnedTabIds: [],
        activeDocName: 'docs/a',
        activeTabId: 'docs/a',
        updatedAt: '2026-05-06T00:00:00.000Z',
      }),
    ).not.toThrow();
  });
});

describe('applyDragPinMutation — drag-mutable pin state', () => {
  test('pinned tab dragged out of the (size-1) pinned zone unpins; only it changes', () => {
    expect(applyDragPinMutation(['B', 'A', 'C'], ['A'], 'A')).toEqual([]);
  });

  test('unpinned tab dragged into the pinned zone pins; others keep state', () => {
    expect(applyDragPinMutation(['D', 'A', 'B', 'C'], ['A', 'B'], 'D')).toEqual(['A', 'B', 'D']);
  });

  test('pinned tab dragged past the divide into the unpinned region unpins', () => {
    expect(applyDragPinMutation(['B', 'C', 'A', 'D'], ['A', 'B'], 'A')).toEqual(['B']);
  });

  test('swapping two pinned tabs within the zone keeps both pinned', () => {
    expect(applyDragPinMutation(['B', 'A', 'C', 'D'], ['A', 'B'], 'A')).toEqual(['A', 'B']);
  });

  test('reordering unpinned tabs among themselves never touches pin state', () => {
    expect(applyDragPinMutation(['A', 'B', 'D', 'C'], ['A', 'B'], 'C')).toEqual(['A', 'B']);
  });

  test('with no pinned tabs, dragging any tab cannot pin it (no pinned position to cross)', () => {
    expect(applyDragPinMutation(['C', 'A', 'B'], [], 'C')).toEqual([]);
  });

  test('dragged id that is not an open tab (placeholder/unknown) never mutates pin state', () => {
    expect(applyDragPinMutation(['A', 'B'], ['A'], 'new-tab:placeholder')).toEqual(['A']);
  });

  test('normalizes inputs: stale pinned ids not in openTabs are dropped', () => {
    expect(applyDragPinMutation(['A', 'B'], ['A', 'Z'], 'B')).toEqual(['A']);
  });
});

describe('tabParts — non-`.md` call-site shapes (folder + asset)', () => {
  test('folder shape: docExt `/` produces baseName-with-trailing-slash label', () => {
    expect(tabParts('docs/guides', '/')).toEqual({
      baseName: 'guides',
      extension: '/',
      label: 'guides/',
      prefix: 'docs/',
    });
  });

  test('asset shape: docExt empty string produces label equal to baseName', () => {
    expect(tabParts('images/cat.jpg', '')).toEqual({
      baseName: 'cat.jpg',
      extension: '',
      label: 'cat.jpg',
      prefix: 'images/',
    });
  });

  test('folder shape at top-level (no slash) has empty prefix', () => {
    expect(tabParts('drafts', '/')).toEqual({
      baseName: 'drafts',
      extension: '/',
      label: 'drafts/',
      prefix: '',
    });
  });
});
