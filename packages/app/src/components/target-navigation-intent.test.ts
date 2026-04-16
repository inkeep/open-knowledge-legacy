import { describe, expect, test } from 'bun:test';
import { resolveTargetNavigationIntent } from './target-navigation-intent';

describe('resolveTargetNavigationIntent', () => {
  test('routes canonical folder index targets through the folder hash', () => {
    expect(
      resolveTargetNavigationIntent('reports', {
        pages: new Set(['reports/index']),
        folderPaths: new Set(['reports']),
      }),
    ).toEqual({
      resolvedTarget: {
        kind: 'folder-index',
        target: 'reports',
        folderPath: 'reports',
        docName: 'reports/index',
        noteKind: 'canonical-index',
      },
      hashDocName: 'reports',
      displayState: 'folder',
    });
  });

  test('keeps exact documents on their own hash target', () => {
    expect(
      resolveTargetNavigationIntent('reports/index', {
        pages: new Set(['reports/index']),
        folderPaths: new Set(['reports']),
      }),
    ).toEqual({
      resolvedTarget: {
        kind: 'doc',
        target: 'reports/index',
        docName: 'reports/index',
      },
      hashDocName: 'reports/index',
      displayState: 'doc',
    });
  });

  test('treats legacy folder notes as folder navigation targets', () => {
    expect(
      resolveTargetNavigationIntent('reports', {
        pages: new Set(['reports/reports']),
      }),
    ).toEqual({
      resolvedTarget: {
        kind: 'folder-index',
        target: 'reports',
        folderPath: 'reports',
        docName: 'reports/reports',
        noteKind: 'legacy-folder-note',
      },
      hashDocName: 'reports',
      displayState: 'folder',
    });
  });

  test('returns folder display state for folder-only targets', () => {
    expect(
      resolveTargetNavigationIntent('reports', {
        pages: new Set(),
        folderPaths: new Set(['reports']),
      }),
    ).toEqual({
      resolvedTarget: {
        kind: 'folder',
        target: 'reports',
        folderPath: 'reports',
      },
      hashDocName: 'reports',
      displayState: 'folder',
    });
  });

  test('keeps missing targets on the existing missing-page hash path', () => {
    expect(
      resolveTargetNavigationIntent('reports', {
        pages: new Set(['docs/index']),
      }),
    ).toEqual({
      resolvedTarget: {
        kind: 'missing',
        target: 'reports',
      },
      hashDocName: 'reports',
      displayState: 'missing',
    });
  });
});
