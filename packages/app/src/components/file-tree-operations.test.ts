import { describe, expect, test } from 'bun:test';
import {
  applyDeleteToDocuments,
  applyRenameToDocuments,
  buildRenamedNodePath,
  isValidNodeName,
  normalizeRenameValue,
  planRenameCleanupCalls,
  remapActiveDocName,
} from './file-tree-operations';
import type { FileEntry } from './file-tree-utils';

const fileNode = {
  name: 'notes',
  path: 'docs/notes',
  kind: 'file',
} as const;

const folderNode = {
  name: 'docs',
  path: 'docs',
  kind: 'folder',
} as const;

const documents: FileEntry[] = [
  { kind: 'document', docName: 'docs/notes', size: 10, modified: '2026-04-13T00:00:00.000Z' },
  {
    kind: 'document',
    docName: 'docs/nested/page',
    size: 11,
    modified: '2026-04-13T00:00:00.000Z',
  },
  { kind: 'folder', path: 'docs/empty', size: 0, modified: '2026-04-13T00:00:00.000Z' },
  {
    kind: 'asset',
    path: 'docs/image.png',
    assetExt: '.png',
    mediaKind: 'image',
    size: 1,
    modified: '2026-04-13T00:00:00.000Z',
  },
  { kind: 'document', docName: 'README', size: 12, modified: '2026-04-13T00:00:00.000Z' },
];

describe('file-tree-operations', () => {
  test('normalizeRenameValue trims whitespace but preserves the raw name', () => {
    expect(normalizeRenameValue('file', '  renamed  ')).toBe('renamed');
    expect(normalizeRenameValue('folder', '  renamed  ')).toBe('renamed');
  });

  test('normalizeRenameValue preserves .md suffix as an explicit extension signal', () => {
    expect(normalizeRenameValue('file', 'renamed.md')).toBe('renamed.md');
    expect(normalizeRenameValue('folder', 'renamed.md')).toBe('renamed.md');
  });

  test('normalizeRenameValue preserves .mdx suffix as an explicit extension signal', () => {
    expect(normalizeRenameValue('file', 'renamed.mdx')).toBe('renamed.mdx');
    expect(normalizeRenameValue('folder', 'renamed.mdx')).toBe('renamed.mdx');
  });

  test('normalizeRenameValue leaves bare names unchanged (preserves backward-compat server re-derivation)', () => {
    expect(normalizeRenameValue('file', 'renamed')).toBe('renamed');
    expect(normalizeRenameValue('folder', 'renamed')).toBe('renamed');
  });

  test('isValidNodeName rejects path separators and dot segments', () => {
    expect(isValidNodeName('valid-name')).toBe(true);
    expect(isValidNodeName('nested/name')).toBe(false);
    expect(isValidNodeName('..')).toBe(false);
  });

  test('buildRenamedNodePath only replaces the last path segment', () => {
    expect(buildRenamedNodePath(fileNode, 'renamed')).toBe('docs/renamed');
    expect(buildRenamedNodePath(folderNode, 'guides')).toBe('guides');
  });

  test('applyRenameToDocuments remaps returned doc names', () => {
    expect(
      applyRenameToDocuments(documents, [
        { fromDocName: 'docs/notes', toDocName: 'docs/renamed' },
        { fromDocName: 'docs/nested/page', toDocName: 'guides/nested/page' },
      ]).map((entry) => (entry.kind === 'document' ? entry.docName : entry.path)),
    ).toEqual(['docs/renamed', 'guides/nested/page', 'docs/empty', 'docs/image.png', 'README']);
  });

  test('applyRenameToDocuments remaps explicit folder and asset paths', () => {
    expect(
      applyRenameToDocuments(documents, [], [{ fromPath: 'docs', toPath: 'guides' }]).map(
        (entry) => (entry.kind === 'document' ? entry.docName : entry.path),
      ),
    ).toEqual(['docs/notes', 'docs/nested/page', 'guides/empty', 'guides/image.png', 'README']);
  });

  test('applyDeleteToDocuments removes all deleted doc names', () => {
    expect(
      applyDeleteToDocuments(documents, ['docs/notes', 'docs/nested/page']).map((entry) =>
        entry.kind === 'document' ? entry.docName : entry.path,
      ),
    ).toEqual(['docs/empty', 'docs/image.png', 'README']);
  });

  test('applyDeleteToDocuments removes explicit folder and asset descendants', () => {
    expect(
      applyDeleteToDocuments(documents, ['docs/notes', 'docs/nested/page'], 'docs').map((entry) =>
        entry.kind === 'document' ? entry.docName : entry.path,
      ),
    ).toEqual(['README']);
  });

  test('remapActiveDocName returns renamed active path when present', () => {
    expect(
      remapActiveDocName('docs/notes', [{ fromDocName: 'docs/notes', toDocName: 'docs/renamed' }]),
    ).toBe('docs/renamed');
    expect(
      remapActiveDocName('README', [{ fromDocName: 'docs/notes', toDocName: 'docs/renamed' }]),
    ).toBe('README');
  });

  describe('planRenameCleanupCalls — symptom 1+3 race gate', () => {
    test('pool active === toDocName → skip the destructive `to` clear', () => {
      expect(
        planRenameCleanupCalls(
          [{ fromDocName: 'docs/notes', toDocName: 'docs/renamed' }],
          'docs/renamed',
        ),
      ).toEqual(['docs/notes']);
    });

    test('pool active === fromDocName (server-push not yet run) → clear BOTH ends', () => {
      expect(
        planRenameCleanupCalls(
          [{ fromDocName: 'docs/notes', toDocName: 'docs/renamed' }],
          'docs/notes',
        ),
      ).toEqual(['docs/notes', 'docs/renamed']);
    });

    test('pool active is unrelated (renamed doc was never active) → clear BOTH ends', () => {
      expect(
        planRenameCleanupCalls(
          [{ fromDocName: 'docs/notes', toDocName: 'docs/renamed' }],
          'README',
        ),
      ).toEqual(['docs/notes', 'docs/renamed']);
    });

    test('pool active is null (collabUrl unresolved) → clear BOTH ends', () => {
      expect(
        planRenameCleanupCalls([{ fromDocName: 'docs/notes', toDocName: 'docs/renamed' }], null),
      ).toEqual(['docs/notes', 'docs/renamed']);
    });

    test('multi-rename batch — gate is per-entry', () => {
      expect(
        planRenameCleanupCalls(
          [
            { fromDocName: 'docs/a', toDocName: 'archive/a' },
            { fromDocName: 'docs/b', toDocName: 'archive/b' },
            { fromDocName: 'docs/c', toDocName: 'archive/c' },
          ],
          'archive/a',
        ),
      ).toEqual(['docs/a', 'docs/b', 'archive/b', 'docs/c', 'archive/c']);
    });

    test('empty rename batch — empty result', () => {
      expect(planRenameCleanupCalls([], null)).toEqual([]);
      expect(planRenameCleanupCalls([], 'anything')).toEqual([]);
    });
  });
});
