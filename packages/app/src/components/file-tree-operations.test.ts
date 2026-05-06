import { describe, expect, test } from 'bun:test';
import {
  applyDeleteToDocuments,
  applyRenameToDocuments,
  buildRenamedNodePath,
  isRenamePathResponse,
  isValidNodeName,
  normalizeRenameValue,
  remapActiveDocName,
} from './file-tree-operations';
import type { DocEntry } from './file-tree-utils';

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

const documents: DocEntry[] = [
  { docName: 'docs/notes', size: 10, modified: '2026-04-13T00:00:00.000Z' },
  { docName: 'docs/nested/page', size: 11, modified: '2026-04-13T00:00:00.000Z' },
  { docName: 'README', size: 12, modified: '2026-04-13T00:00:00.000Z' },
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
      ]).map((doc) => doc.docName),
    ).toEqual(['docs/renamed', 'guides/nested/page', 'README']);
  });

  test('applyDeleteToDocuments removes all deleted doc names', () => {
    expect(
      applyDeleteToDocuments(documents, ['docs/notes', 'docs/nested/page']).map(
        (doc) => doc.docName,
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

  test('isRenamePathResponse validates the managed rename response shape', () => {
    expect(
      isRenamePathResponse({
        ok: true,
        renamed: [{ fromDocName: 'docs/notes', toDocName: 'docs/renamed' }],
        rewrittenDocs: [{ docName: 'README', rewrites: 1 }],
      }),
    ).toBe(true);
    expect(isRenamePathResponse({ ok: false, error: 'Destination already exists' })).toBe(true);
    expect(isRenamePathResponse({ ok: true, renamed: [], rewrittenDocs: [{}] })).toBe(false);
  });
});
