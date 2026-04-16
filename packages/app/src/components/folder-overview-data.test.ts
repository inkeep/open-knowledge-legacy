import { describe, expect, test } from 'bun:test';
import { buildFolderOverviewData } from './folder-overview-data';

describe('buildFolderOverviewData', () => {
  test('lists only immediate child folders and docs for a folder overview', () => {
    const data = buildFolderOverviewData('reports', {
      pages: new Set([
        'reports/index',
        'reports/weekly',
        'reports/monthly',
        'reports/q1/index',
        'reports/q1/summary',
        'reports/q2/details',
      ]),
      pageTitles: new Map([
        ['reports/index', 'Reports'],
        ['reports/weekly', 'Weekly Review'],
        ['reports/monthly', 'Monthly Review'],
        ['reports/q1/index', 'Quarter One'],
      ]),
      folderPaths: new Set(['reports/q1', 'reports/q2', 'reports/q2/deep']),
    });

    expect(data).toEqual({
      title: 'Reports',
      childFolders: [
        { path: 'reports/q2', name: 'q2', title: 'q2' },
        { path: 'reports/q1', name: 'q1', title: 'Quarter One' },
      ],
      childDocs: [
        { docName: 'reports/monthly', name: 'monthly', title: 'Monthly Review' },
        { docName: 'reports/index', name: 'index', title: 'Reports' },
        { docName: 'reports/weekly', name: 'weekly', title: 'Weekly Review' },
      ],
    });
  });
});
