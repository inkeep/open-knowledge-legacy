import { describe, expect, test } from 'bun:test';
import type { ContextMenuItem, FileTreeDropTarget } from '@pierre/trees';
import {
  collectTreeFolderPathsFromDocuments,
  computeTreeAncestorPaths,
  computeTreeDropDestinationPath,
  createPagePathFromTreeDestination,
  createTreePlaceholder,
  docNameToTreePath,
  documentsToTreePaths,
  folderPathToTreeDirectoryPath,
  relativePathForTreeItem,
  treeDirectoryPathToFolderPath,
  treeFilePathToDocName,
  treeItemToTarget,
  treePathToAppPath,
} from './file-tree-adapter';
import type { DocEntry } from './file-tree-utils';

function doc(docName: string): DocEntry {
  return { docName, size: 100, modified: '2026-01-01T00:00:00Z' };
}

function menuItem(path: string, kind: ContextMenuItem['kind']): ContextMenuItem {
  return {
    kind,
    name: path.split('/').filter(Boolean).at(-1) ?? path,
    path,
  };
}

function dropTarget(target: Partial<FileTreeDropTarget>): FileTreeDropTarget {
  return {
    directoryPath: null,
    flattenedSegmentPath: null,
    hoveredPath: null,
    kind: 'root',
    ...target,
  };
}

describe('file-tree-adapter', () => {
  test('converts document names into Trees file paths', () => {
    expect(docNameToTreePath('README')).toBe('README.md');
    expect(documentsToTreePaths([doc('README'), doc('docs/guide')])).toEqual([
      'README.md',
      'docs/guide.md',
    ]);
  });

  test('converts Trees file and directory paths back to app paths', () => {
    expect(treeFilePathToDocName('docs/guide.md')).toBe('docs/guide');
    expect(treeFilePathToDocName('docs/guide')).toBe('docs/guide');
    expect(treeDirectoryPathToFolderPath('docs/')).toBe('docs');
    expect(folderPathToTreeDirectoryPath('docs')).toBe('docs/');
    expect(treePathToAppPath('docs/guide.md')).toBe('docs/guide');
    expect(treePathToAppPath('docs/')).toBe('docs');
  });

  test('collects canonical folder paths from flat documents', () => {
    expect(
      collectTreeFolderPathsFromDocuments([
        doc('docs/guide'),
        doc('docs/nested/page'),
        doc('README'),
      ]),
    ).toEqual(['docs/', 'docs/nested/']);
  });

  test('computes active ancestor paths using Trees directory slash convention', () => {
    expect(computeTreeAncestorPaths('README.md')).toEqual([]);
    expect(computeTreeAncestorPaths('docs/guide.md')).toEqual(['docs/']);
    expect(computeTreeAncestorPaths('docs/nested/')).toEqual(['docs/', 'docs/nested/']);
  });

  test('creates unique file and folder placeholders', () => {
    expect(createTreePlaceholder('file', 'docs', ['docs/Untitled.md'])).toEqual({
      addPath: 'docs/Untitled 2.md',
      renamePath: 'docs/Untitled 2.md',
    });
    expect(createTreePlaceholder('folder', '', ['New Folder/index.md'])).toEqual({
      addPath: 'New Folder 2/index.md',
      renamePath: 'New Folder 2/',
    });
  });

  test('converts create destinations to create-page paths', () => {
    expect(createPagePathFromTreeDestination('file', 'docs/new-note')).toBe('docs/new-note.md');
    expect(createPagePathFromTreeDestination('folder', 'docs/new-folder/')).toBe(
      'docs/new-folder/index.md',
    );
  });

  test('computes server move destinations from Trees drop targets', () => {
    expect(
      computeTreeDropDestinationPath(
        'docs/guide.md',
        dropTarget({ kind: 'root', directoryPath: null }),
      ),
    ).toBe('guide.md');
    expect(
      computeTreeDropDestinationPath(
        'docs/guide.md',
        dropTarget({ kind: 'directory', directoryPath: 'archive/', hoveredPath: 'archive/' }),
      ),
    ).toBe('archive/guide.md');
    expect(
      computeTreeDropDestinationPath(
        'docs/',
        dropTarget({ kind: 'directory', directoryPath: 'archive/', hoveredPath: 'archive/' }),
      ),
    ).toBe('archive/docs/');
  });

  test('converts context menu items to sidebar targets and relative paths', () => {
    const file = menuItem('docs/guide.md', 'file');
    const folder = menuItem('docs/', 'directory');

    expect(treeItemToTarget(file)).toEqual({
      kind: 'file',
      name: 'guide',
      path: 'docs/guide',
      treePath: 'docs/guide.md',
      docExt: '.md',
    });
    expect(treeItemToTarget(folder)).toEqual({
      kind: 'folder',
      name: 'docs',
      path: 'docs',
      treePath: 'docs/',
      docExt: undefined,
    });
    expect(relativePathForTreeItem(file)).toBe('docs/guide.md');
    expect(relativePathForTreeItem(folder)).toBe('docs');
  });

  test('treeItemToTarget detects .mdx and surfaces it via docExt', () => {
    const mdxFile = menuItem('docs/guide.mdx', 'file');
    expect(treeItemToTarget(mdxFile)).toEqual({
      kind: 'file',
      name: 'guide',
      path: 'docs/guide',
      treePath: 'docs/guide.mdx',
      docExt: '.mdx',
    });
  });

  test('docNameToTreePath honors a per-doc extension; defaults to .md', () => {
    expect(docNameToTreePath('README')).toBe('README.md');
    expect(docNameToTreePath('README', '.md')).toBe('README.md');
    expect(docNameToTreePath('docs/guide', '.mdx')).toBe('docs/guide.mdx');
  });

  test('treeFilePathToDocName strips both .md and .mdx suffixes', () => {
    expect(treeFilePathToDocName('docs/guide.md')).toBe('docs/guide');
    expect(treeFilePathToDocName('docs/guide.mdx')).toBe('docs/guide');
  });

  test('documentsToTreePaths uses each doc.docExt; absent docExt defaults to .md', () => {
    expect(
      documentsToTreePaths([
        { docName: 'README', size: 0, modified: '' },
        { docName: 'docs/guide', docExt: '.mdx', size: 0, modified: '' },
        { docName: 'docs/legacy', docExt: '.md', size: 0, modified: '' },
      ]),
    ).toEqual(['README.md', 'docs/guide.mdx', 'docs/legacy.md']);
  });
});
