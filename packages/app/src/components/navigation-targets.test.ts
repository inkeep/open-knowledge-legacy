import { describe, expect, test } from 'bun:test';
import { deriveKnownFolderPaths, resolveNavigationTarget } from './navigation-targets';

describe('deriveKnownFolderPaths', () => {
  test('derives ancestor folders from admitted doc names', () => {
    const folderPaths = deriveKnownFolderPaths(new Set(['docs/index', 'reports/q1/REPORT']));

    expect(folderPaths).toEqual(new Set(['docs', 'reports', 'reports/q1']));
  });
});

describe('resolveNavigationTarget', () => {
  test('prefers an exact document over folder landing notes', () => {
    const resolved = resolveNavigationTarget('reports', {
      pages: new Set(['reports', 'reports/index', 'reports/reports']),
      folderPaths: new Set(['reports']),
    });

    expect(resolved).toEqual({
      kind: 'doc',
      target: 'reports',
      docName: 'reports',
    });
  });

  test('resolves a canonical index note before a bare folder', () => {
    const resolved = resolveNavigationTarget('./reports/', {
      pages: new Set(['reports/index']),
    });

    expect(resolved).toEqual({
      kind: 'folder-index',
      target: 'reports',
      folderPath: 'reports',
      docName: 'reports/index',
      noteKind: 'canonical-index',
    });
  });

  test('falls back to the legacy folder note when no canonical index exists', () => {
    const resolved = resolveNavigationTarget('reports', {
      pages: new Set(['reports/reports']),
    });

    expect(resolved).toEqual({
      kind: 'folder-index',
      target: 'reports',
      folderPath: 'reports',
      docName: 'reports/reports',
      noteKind: 'legacy-folder-note',
    });
  });

  test('returns folder for a known folder with no landing note', () => {
    const resolved = resolveNavigationTarget('reports/', {
      pages: new Set(),
      folderPaths: new Set(['reports']),
    });

    expect(resolved).toEqual({
      kind: 'folder',
      target: 'reports',
      folderPath: 'reports',
    });
  });

  test('returns missing when neither a doc nor folder exists', () => {
    const resolved = resolveNavigationTarget('reports', {
      pages: new Set(['docs/index']),
    });

    expect(resolved).toEqual({
      kind: 'missing',
      target: 'reports',
    });
  });
});
