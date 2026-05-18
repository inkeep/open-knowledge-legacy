import { describe, expect, test } from 'bun:test';
import { computeAncestors, defaultInitialDir, filterVisibleEntries } from './file-tree-utils';

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
});

describe('defaultInitialDir', () => {
  test('returns empty string for null', () => {
    expect(defaultInitialDir(null)).toBe('');
  });

  test('returns empty string for root-level file', () => {
    expect(defaultInitialDir('README')).toBe('');
  });

  test('returns parent directory for nested file', () => {
    expect(defaultInitialDir('docs/guide')).toBe('docs');
  });

  test('returns deepest parent for deeply nested file', () => {
    expect(defaultInitialDir('a/b/c/d')).toBe('a/b/c');
  });

  test('returns empty string for empty string', () => {
    expect(defaultInitialDir('')).toBe('');
  });
});

describe('filterVisibleEntries', () => {
  test('keeps top-level visible document and folder entries', () => {
    const entries = [
      { kind: 'document' as const, docName: 'README' },
      { kind: 'folder' as const, path: 'brain' },
    ];
    expect(filterVisibleEntries(entries)).toEqual(entries);
  });

  test('hides top-level dot-prefixed document and folder entries', () => {
    expect(
      filterVisibleEntries([
        { kind: 'document' as const, docName: 'README' },
        { kind: 'folder' as const, path: '.claude' },
        { kind: 'folder' as const, path: '.cursor' },
        { kind: 'document' as const, docName: '.config' },
      ]),
    ).toEqual([{ kind: 'document', docName: 'README' }]);
  });

  test('hides entries nested under a dot-prefixed ancestor at any depth', () => {
    expect(
      filterVisibleEntries([
        { kind: 'document' as const, docName: '.claude/agents/foo' },
        { kind: 'document' as const, docName: 'brain/.archived/note' },
        { kind: 'document' as const, docName: 'brain/visible' },
        { kind: 'folder' as const, path: 'brain/.archived' },
      ]),
    ).toEqual([{ kind: 'document', docName: 'brain/visible' }]);
  });

  test('hides asset entries when an ancestor segment is dot-prefixed', () => {
    expect(
      filterVisibleEntries([
        { kind: 'asset' as const, path: 'images/logo.png' },
        { kind: 'asset' as const, path: '.attachments/secret.png' },
        { kind: 'asset' as const, path: 'brain/.private/diagram.svg' },
      ]),
    ).toEqual([{ kind: 'asset', path: 'images/logo.png' }]);
  });

  test('returns empty array when every entry is hidden', () => {
    expect(
      filterVisibleEntries([
        { kind: 'folder' as const, path: '.claude' },
        { kind: 'document' as const, docName: '.claude/agents/foo' },
        { kind: 'folder' as const, path: '.codex' },
      ]),
    ).toEqual([]);
  });

  test('default (showHiddenFiles unset) preserves today behavior — dot-segments dropped', () => {
    expect(
      filterVisibleEntries([
        { kind: 'document' as const, docName: 'README' },
        { kind: 'folder' as const, path: '.claude' },
      ]),
    ).toEqual([{ kind: 'document', docName: 'README' }]);
  });

  test('showHiddenFiles=false (explicit) preserves today behavior', () => {
    expect(
      filterVisibleEntries(
        [
          { kind: 'document' as const, docName: 'README' },
          { kind: 'folder' as const, path: '.claude' },
        ],
        false,
      ),
    ).toEqual([{ kind: 'document', docName: 'README' }]);
  });

  test('showHiddenFiles=true recovers top-level dot-prefixed entries', () => {
    const entries = [
      { kind: 'document' as const, docName: 'README' },
      { kind: 'folder' as const, path: '.claude' },
      { kind: 'document' as const, docName: '.config' },
    ];
    expect(filterVisibleEntries(entries, true)).toEqual(entries);
  });

  test('showHiddenFiles=true recovers entries nested under a dot-prefixed ancestor', () => {
    const entries = [
      { kind: 'document' as const, docName: '.claude/agents/foo' },
      { kind: 'document' as const, docName: 'brain/.archived/note' },
      { kind: 'document' as const, docName: 'brain/visible' },
      { kind: 'folder' as const, path: 'brain/.archived' },
    ];
    expect(filterVisibleEntries(entries, true)).toEqual(entries);
  });

  test('showHiddenFiles=true recovers asset entries with dot-prefixed ancestor', () => {
    const entries = [
      { kind: 'asset' as const, path: 'images/logo.png' },
      { kind: 'asset' as const, path: '.attachments/secret.png' },
      { kind: 'asset' as const, path: 'brain/.private/diagram.svg' },
    ];
    expect(filterVisibleEntries(entries, true)).toEqual(entries);
  });

  test('showHiddenFiles=true still rejects empty-ref entries', () => {
    expect(
      filterVisibleEntries(
        [
          { kind: 'document' as const, docName: '' },
          { kind: 'folder' as const, path: '' },
          { kind: 'document' as const, docName: 'README' },
        ],
        true,
      ),
    ).toEqual([{ kind: 'document', docName: 'README' }]);
  });

  test('showHiddenFiles toggle is idempotent — applying twice equals applying once', () => {
    const entries = [
      { kind: 'document' as const, docName: 'README' },
      { kind: 'folder' as const, path: '.claude' },
      { kind: 'document' as const, docName: 'brain/.archived/note' },
    ];
    const onceTrue = filterVisibleEntries(entries, true);
    expect(filterVisibleEntries(onceTrue, true)).toEqual(onceTrue);
    const onceFalse = filterVisibleEntries(entries, false);
    expect(filterVisibleEntries(onceFalse, false)).toEqual(onceFalse);
  });

  test('showHiddenFiles=true → false transition produces today behavior (no leak)', () => {
    const entries = [
      { kind: 'document' as const, docName: 'README' },
      { kind: 'folder' as const, path: '.claude' },
    ];
    const expanded = filterVisibleEntries(entries, true);
    expect(expanded).toEqual(entries);
    const reduced = filterVisibleEntries(expanded, false);
    expect(reduced).toEqual([{ kind: 'document', docName: 'README' }]);
  });
});
