import { describe, expect, test } from 'bun:test';
import { resolveFileTreeSelection, resolveFileTreeSelectionAction } from './file-tree-selection';

describe('resolveFileTreeSelection', () => {
  test('keeps a document row active for doc targets', () => {
    expect(
      resolveFileTreeSelection(
        {
          kind: 'doc',
          target: 'reports/index',
          docName: 'reports/index',
        },
        'reports/index',
      ),
    ).toEqual({
      selectedFilePath: 'reports/index',
      selectedFolderPath: null,
      navigationPath: 'reports/index',
    });
  });

  test('keeps the folder row active when a folder click resolves to an index note', () => {
    expect(
      resolveFileTreeSelection(
        {
          kind: 'folder-index',
          target: 'reports',
          folderPath: 'reports',
          docName: 'reports/index',
          noteKind: 'canonical-index',
        },
        'reports/index',
      ),
    ).toEqual({
      selectedFilePath: null,
      selectedFolderPath: 'reports',
      navigationPath: 'reports',
    });
  });

  test('keeps the folder row active for folder overview targets', () => {
    expect(
      resolveFileTreeSelection(
        {
          kind: 'folder',
          target: 'reports',
          folderPath: 'reports',
        },
        null,
      ),
    ).toEqual({
      selectedFilePath: null,
      selectedFolderPath: 'reports',
      navigationPath: 'reports',
    });
  });

  test('clears sidebar selection for missing targets', () => {
    expect(
      resolveFileTreeSelection(
        {
          kind: 'missing',
          target: 'reports',
        },
        'reports/index',
      ),
    ).toEqual({
      selectedFilePath: null,
      selectedFolderPath: null,
      navigationPath: null,
    });
  });
});

describe('resolveFileTreeSelectionAction', () => {
  test('routes asset rows to the standalone asset hash', () => {
    expect(
      resolveFileTreeSelectionAction('docs/photo.png', [
        {
          kind: 'asset',
          path: 'docs/photo.png',
          assetExt: '.png',
          mediaKind: 'image',
          size: 0,
          modified: '',
        },
      ]),
    ).toEqual({
      kind: 'asset',
      hash: '#/__asset__/docs/photo.png',
    });
  });

  test('routes known document rows to document navigation', () => {
    expect(
      resolveFileTreeSelectionAction('docs/guide.md', [
        {
          kind: 'document',
          docName: 'docs/guide',
          size: 0,
          modified: '',
        },
      ]),
    ).toEqual({
      kind: 'document-or-folder',
      path: 'docs/guide',
    });
  });

  test('drops transient unknown document selections while allowing folders', () => {
    expect(resolveFileTreeSelectionAction('docs/missing.md', [])).toEqual({ kind: 'none' });
    expect(resolveFileTreeSelectionAction('docs/', [])).toEqual({
      kind: 'document-or-folder',
      path: 'docs',
    });
  });
});
