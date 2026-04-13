import { describe, expect, test } from 'bun:test';
import { buildTree, collectFolderPaths, computeAncestors, type DocEntry } from './file-tree-utils';

function doc(docName: string): DocEntry {
  return { docName, size: 100, modified: '2026-01-01T00:00:00Z' };
}

describe('buildTree', () => {
  test('returns empty array for no documents', () => {
    expect(buildTree([])).toEqual([]);
  });

  test('creates flat file nodes for top-level documents', () => {
    const tree = buildTree([doc('README'), doc('CHANGELOG')]);
    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe('CHANGELOG');
    expect(tree[0].kind).toBe('file');
    expect(tree[0].path).toBe('CHANGELOG');
    expect(tree[0].children).toEqual([]);
    expect(tree[1].name).toBe('README');
    expect(tree[1].kind).toBe('file');
  });

  test('creates folder nodes for nested paths', () => {
    const tree = buildTree([doc('docs/guide')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('docs');
    expect(tree[0].kind).toBe('folder');
    expect(tree[0].path).toBe('docs');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe('guide');
    expect(tree[0].children[0].kind).toBe('file');
    expect(tree[0].children[0].path).toBe('docs/guide');
  });

  test('groups files under shared parent folders', () => {
    const tree = buildTree([doc('docs/a'), doc('docs/b'), doc('docs/c')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('docs');
    expect(tree[0].children).toHaveLength(3);
    expect(tree[0].children.map((c) => c.name)).toEqual(['a', 'b', 'c']);
  });

  test('handles deeply nested paths', () => {
    const tree = buildTree([doc('a/b/c/d')]);
    expect(tree[0].name).toBe('a');
    expect(tree[0].children[0].name).toBe('b');
    expect(tree[0].children[0].children[0].name).toBe('c');
    expect(tree[0].children[0].children[0].children[0].name).toBe('d');
    expect(tree[0].children[0].children[0].children[0].kind).toBe('file');
  });

  test('sorts folders before files', () => {
    const tree = buildTree([doc('zebra'), doc('articles/intro'), doc('alpha')]);
    // 'articles' folder should come before 'alpha' and 'zebra' files
    expect(tree[0].kind).toBe('folder');
    expect(tree[0].name).toBe('articles');
    expect(tree[1].kind).toBe('file');
    expect(tree[1].name).toBe('alpha');
    expect(tree[2].kind).toBe('file');
    expect(tree[2].name).toBe('zebra');
  });

  test('sorts alphabetically within folders and files', () => {
    const tree = buildTree([
      doc('docs/zz'),
      doc('docs/aa'),
      doc('articles/bb'),
      doc('articles/aa'),
    ]);
    expect(tree[0].name).toBe('articles');
    expect(tree[0].children.map((c) => c.name)).toEqual(['aa', 'bb']);
    expect(tree[1].name).toBe('docs');
    expect(tree[1].children.map((c) => c.name)).toEqual(['aa', 'zz']);
  });

  test('handles mixed depth — some files at root, some nested', () => {
    const tree = buildTree([doc('README'), doc('specs/feature/SPEC'), doc('docs/guide')]);
    // folders first: docs, specs; then files: README
    expect(tree.map((n) => n.name)).toEqual(['docs', 'specs', 'README']);
    expect(tree[1].children[0].name).toBe('feature');
    expect(tree[1].children[0].children[0].name).toBe('SPEC');
  });

  test('deduplicates folder nodes when multiple files share a path prefix', () => {
    const tree = buildTree([
      doc('reports/a/evidence/e1'),
      doc('reports/a/evidence/e2'),
      doc('reports/a/REPORT'),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('reports');
    const a = tree[0].children[0];
    expect(a.name).toBe('a');
    // Should have 'evidence' folder + 'REPORT' file
    expect(a.children.map((c) => c.name)).toEqual(['evidence', 'REPORT']);
    expect(a.children[0].children.map((c) => c.name)).toEqual(['e1', 'e2']);
  });

  test('preserves full path on each node', () => {
    const tree = buildTree([doc('a/b/c')]);
    expect(tree[0].path).toBe('a');
    expect(tree[0].children[0].path).toBe('a/b');
    expect(tree[0].children[0].children[0].path).toBe('a/b/c');
  });

  test('propagates symlink metadata to file TreeNode', () => {
    const tree = buildTree([
      { docName: 'bar', size: 100, modified: '2026-01-01T00:00:00Z' },
      {
        docName: 'foo',
        size: 100,
        modified: '2026-01-01T00:00:00Z',
        isSymlink: true,
        canonicalDocName: 'bar',
        targetPath: 'bar.md',
      },
    ]);
    const bar = tree.find((n) => n.name === 'bar');
    const foo = tree.find((n) => n.name === 'foo');
    if (!bar || !foo) throw new Error('expected bar and foo in tree');

    expect(foo.isSymlink).toBe(true);
    expect(foo.canonicalDocName).toBe('bar');
    expect(foo.targetPath).toBe('bar.md');

    expect(bar.isSymlink).toBeUndefined();
    expect(bar.canonicalDocName).toBeUndefined();
    expect(bar.targetPath).toBeUndefined();
  });

  test('folder nodes do not carry symlink metadata', () => {
    const tree = buildTree([
      {
        docName: 'links/alias',
        size: 100,
        modified: '2026-01-01T00:00:00Z',
        isSymlink: true,
        canonicalDocName: 'target',
        targetPath: 'target.md',
      },
    ]);
    const folder = tree[0];
    expect(folder.kind).toBe('folder');
    expect(folder.isSymlink).toBeUndefined();
    expect(folder.canonicalDocName).toBeUndefined();

    const file = folder.children[0];
    expect(file.kind).toBe('file');
    expect(file.isSymlink).toBe(true);
    expect(file.canonicalDocName).toBe('target');
    expect(file.targetPath).toBe('target.md');
  });
});

describe('computeAncestors', () => {
  test('returns empty array for null', () => {
    expect(computeAncestors(null)).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(computeAncestors('')).toEqual([]);
  });

  test('returns empty array for top-level docName', () => {
    expect(computeAncestors('README')).toEqual([]);
  });

  test('returns single ancestor for one-level nesting', () => {
    expect(computeAncestors('docs/guide')).toEqual(['docs']);
  });

  test('returns ancestors from shallowest to deepest for multi-level path', () => {
    expect(computeAncestors('a/b/c')).toEqual(['a', 'a/b']);
  });

  test('handles deeply nested paths', () => {
    expect(computeAncestors('a/b/c/d/e')).toEqual(['a', 'a/b', 'a/b/c', 'a/b/c/d']);
  });

  test('returns stable results across multiple calls', () => {
    const first = computeAncestors('x/y/z');
    const second = computeAncestors('x/y/z');
    expect(first).toEqual(second);
  });
});

describe('collectFolderPaths', () => {
  test('returns empty set for empty tree', () => {
    expect(collectFolderPaths([])).toEqual(new Set());
  });

  test('returns empty set for tree with only files', () => {
    const tree = buildTree([doc('README'), doc('CHANGELOG')]);
    expect(collectFolderPaths(tree)).toEqual(new Set());
  });

  test('returns folder paths for single-level nesting', () => {
    const tree = buildTree([doc('docs/guide'), doc('docs/intro')]);
    expect(collectFolderPaths(tree)).toEqual(new Set(['docs']));
  });

  test('returns all folder paths for deeply nested tree', () => {
    const tree = buildTree([doc('a/b/c/d')]);
    expect(collectFolderPaths(tree)).toEqual(new Set(['a', 'a/b', 'a/b/c']));
  });

  test('handles mixed file and folder trees', () => {
    const tree = buildTree([doc('README'), doc('docs/guide'), doc('reports/a/REPORT')]);
    expect(collectFolderPaths(tree)).toEqual(new Set(['docs', 'reports', 'reports/a']));
  });

  test('returns stable results across multiple calls', () => {
    const tree = buildTree([doc('x/y/z')]);
    const first = collectFolderPaths(tree);
    const second = collectFolderPaths(tree);
    expect(first).toEqual(second);
  });
});
