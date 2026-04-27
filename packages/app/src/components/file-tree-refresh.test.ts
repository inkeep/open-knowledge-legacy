import { describe, expect, test } from 'bun:test';
import FILE_SIDEBAR_SOURCE from './FileSidebar?raw';
import FILE_TREE_SOURCE from './FileTree?raw';

describe('file tree document-list freshness wiring', () => {
  test('uses the bounded refresh scheduler for document-list refreshes', () => {
    expect(FILE_TREE_SOURCE).toContain(
      "import { createRefreshScheduler } from '@/lib/refresh-scheduler'",
    );
    expect(FILE_TREE_SOURCE).toContain('const scheduler = createRefreshScheduler(refreshDocs)');
    expect(FILE_TREE_SOURCE).toContain('model.resetPaths(documentsToTreePaths(data.documents)');
    expect(FILE_TREE_SOURCE).toContain('subscribeToDocumentsChanged');
  });

  test('does not use recurring document-list polling in FileTree or FileSidebar', () => {
    expect(FILE_TREE_SOURCE).not.toContain('setInterval');
    expect(FILE_SIDEBAR_SOURCE).not.toContain('setInterval');
  });
});
