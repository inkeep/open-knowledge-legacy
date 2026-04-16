import { describe, expect, test } from 'bun:test';
import { folderIndexCreateSeed, resolveLinkTargetIntent } from './link-target-intent';

describe('resolveLinkTargetIntent', () => {
  test('navigates directly to an exact document target', () => {
    expect(resolveLinkTargetIntent('reports', { pages: new Set(['reports']) })).toEqual({
      kind: 'navigate',
      displayState: 'resolved',
      resolvedTarget: {
        kind: 'doc',
        target: 'reports',
        docName: 'reports',
      },
      hashDocName: 'reports',
    });
  });

  test('keeps folder-like links navigable when a canonical index note exists', () => {
    expect(resolveLinkTargetIntent('reports', { pages: new Set(['reports/index']) })).toEqual({
      kind: 'navigate',
      displayState: 'resolved',
      resolvedTarget: {
        kind: 'folder-index',
        target: 'reports',
        folderPath: 'reports',
        docName: 'reports/index',
        noteKind: 'canonical-index',
      },
      hashDocName: 'reports',
    });
  });

  test('keeps legacy folder notes navigable through the folder hash target', () => {
    expect(resolveLinkTargetIntent('reports', { pages: new Set(['reports/reports']) })).toEqual({
      kind: 'navigate',
      displayState: 'resolved',
      resolvedTarget: {
        kind: 'folder-index',
        target: 'reports',
        folderPath: 'reports',
        docName: 'reports/reports',
        noteKind: 'legacy-folder-note',
      },
      hashDocName: 'reports',
    });
  });

  test('opens existing folders as folders instead of falling into create-page flow', () => {
    expect(
      resolveLinkTargetIntent('reports', {
        pages: new Set<string>(),
        folderPaths: new Set(['reports']),
      }),
    ).toEqual({
      kind: 'navigate',
      displayState: 'folder',
      resolvedTarget: {
        kind: 'folder',
        target: 'reports',
        folderPath: 'reports',
      },
      hashDocName: 'reports',
    });
  });

  test('keeps true missing targets on the generic create-page path', () => {
    expect(resolveLinkTargetIntent('reports/new-note', { pages: new Set<string>() })).toEqual({
      kind: 'create',
      displayState: 'missing',
      resolvedTarget: {
        kind: 'missing',
        target: 'reports/new-note',
      },
      initialDir: 'reports',
      suggestedName: 'new-note.md',
    });
  });

  test('supports wiki-link slug fallback without misclassifying true missing targets', () => {
    expect(
      resolveLinkTargetIntent('My Notes', {
        pages: new Set(['my-notes']),
        fallbackTargets: ['my-notes'],
        createDialogSeed: {
          initialDir: '',
          suggestedName: 'My Notes.md',
        },
      }),
    ).toEqual({
      kind: 'navigate',
      displayState: 'resolved',
      resolvedTarget: {
        kind: 'doc',
        target: 'my-notes',
        docName: 'my-notes',
      },
      hashDocName: 'my-notes',
    });
  });
});

describe('folderIndexCreateSeed', () => {
  test('returns an index-note seed for folder-only targets', () => {
    const intent = resolveLinkTargetIntent('reports', {
      pages: new Set<string>(),
      folderPaths: new Set(['reports']),
    });

    expect(folderIndexCreateSeed(intent)).toEqual({
      initialDir: 'reports',
      suggestedName: 'index.md',
    });
  });

  test('returns null for direct document targets', () => {
    const intent = resolveLinkTargetIntent('reports', {
      pages: new Set(['reports']),
    });

    expect(folderIndexCreateSeed(intent)).toBeNull();
  });
});
