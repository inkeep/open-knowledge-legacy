import { describe, expect, test } from 'bun:test';
import { buildFolderOverviewData } from './folder-overview-data';

describe('buildFolderOverviewData', () => {
  test('lists only immediate child folders and docs for a folder overview', () => {
    const data = buildFolderOverviewData('reports', {
      pages: new Set([
        'reports/weekly',
        'reports/monthly',
        'reports/q1/summary',
        'reports/q2/details',
      ]),
      folderPaths: new Set(['reports/q1', 'reports/q2', 'reports/q2/deep']),
    });

    expect(data).toEqual({
      title: 'reports',
      childFolders: [
        { path: 'reports/q1', name: 'q1' },
        { path: 'reports/q2', name: 'q2' },
      ],
      childDocs: [
        { docName: 'reports/monthly', name: 'monthly' },
        { docName: 'reports/weekly', name: 'weekly' },
      ],
    });
  });
});
