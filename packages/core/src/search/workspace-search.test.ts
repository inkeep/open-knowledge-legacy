import { describe, expect, test } from 'bun:test';
import { createWorkspaceSearchDocument, searchWorkspaceDocuments } from './workspace-search.ts';

const documents = [
  createWorkspaceSearchDocument({
    kind: 'page',
    path: 'docs/api',
    title: 'API Reference',
    content: 'HTTP endpoint contracts',
    modifiedTs: 10,
  }),
  createWorkspaceSearchDocument({
    kind: 'page',
    path: 'architecture/overview',
    title: 'Architecture Overview',
    content: 'Observer bridge and CRDT topology',
    modifiedTs: 30,
  }),
  createWorkspaceSearchDocument({
    kind: 'folder',
    path: 'architecture',
    modifiedTs: 0,
  }),
  createWorkspaceSearchDocument({
    kind: 'page',
    path: 'notes/graphing',
    title: 'Graphing Notes',
    content: 'Visual explorer notes',
    modifiedTs: 20,
  }),
];

describe('searchWorkspaceDocuments', () => {
  test('searches page and folder entities for omnibar intent', () => {
    const results = searchWorkspaceDocuments(documents, 'arch', { intent: 'omnibar' });

    expect(results.map((result) => result.document.path)).toEqual([
      'architecture',
      'architecture/overview',
    ]);
  });

  test('autocomplete intent searches pages only', () => {
    const results = searchWorkspaceDocuments(documents, 'arch', { intent: 'autocomplete' });

    expect(results.map((result) => result.document.path)).toEqual(['architecture/overview']);
  });

  test('full_text intent can return content-only matches', () => {
    const results = searchWorkspaceDocuments(documents, 'crdt', { intent: 'full_text' });

    expect(results[0]?.document.path).toBe('architecture/overview');
    expect(results[0]?.signals.fullText).toBeGreaterThan(0);
  });

  test('recency breaks otherwise comparable autocomplete matches', () => {
    const localDocuments = [
      createWorkspaceSearchDocument({
        kind: 'page',
        path: 'old/research',
        title: 'Research',
        modifiedTs: 1,
      }),
      createWorkspaceSearchDocument({
        kind: 'page',
        path: 'new/research',
        title: 'Research',
        modifiedTs: 100,
      }),
    ];

    const results = searchWorkspaceDocuments(localDocuments, 'research', {
      intent: 'autocomplete',
    });

    expect(results.map((result) => result.document.path)).toEqual(['new/research', 'old/research']);
  });
});
