import { describe, expect, test } from 'bun:test';
import {
  buildWorkspaceEntries,
  EMPTY_QUERY_NAV_LIMIT,
  matchesCommandQuery,
  searchWorkspaceEntries,
} from './command-palette-search';

describe('buildWorkspaceEntries', () => {
  test('builds sorted file and folder entries from page and folder sets', () => {
    const entries = buildWorkspaceEntries(
      new Set(['notes/zebra', 'alpha', 'notes/atlas']),
      new Set(['notes', 'docs']),
    );

    expect(entries).toEqual([
      { kind: 'file', path: 'alpha', name: 'alpha' },
      { kind: 'folder', path: 'docs', name: 'docs' },
      { kind: 'folder', path: 'notes', name: 'notes' },
      { kind: 'file', path: 'notes/atlas', name: 'atlas' },
      { kind: 'file', path: 'notes/zebra', name: 'zebra' },
    ]);
  });
});

describe('searchWorkspaceEntries', () => {
  const entries = buildWorkspaceEntries(
    new Set(['architecture/overview', 'docs/api', 'docs/graph-guide', 'notes/graphing', 'roadmap']),
    new Set(['architecture', 'docs', 'notes']),
  );

  test('returns a capped alphabetical list for the empty query', () => {
    const results = searchWorkspaceEntries(entries, '');
    expect(results.length).toBeLessThanOrEqual(EMPTY_QUERY_NAV_LIMIT);
    expect(results[0]?.path).toBe('architecture');
  });

  test('prefers exact basename match over prefix and substring matches', () => {
    const results = searchWorkspaceEntries(entries, 'api');
    expect(results.map((entry) => entry.path)).toEqual(['docs/api']);
  });

  test('prefers basename prefix matches before plain substring path matches', () => {
    const results = searchWorkspaceEntries(entries, 'graph');
    expect(results.map((entry) => entry.path)).toEqual(['docs/graph-guide', 'notes/graphing']);
  });

  test('matches folder paths as well as files', () => {
    const results = searchWorkspaceEntries(entries, 'arch');
    expect(results[0]).toEqual({ kind: 'folder', path: 'architecture', name: 'architecture' });
  });

  test('breaks ties alphabetically by path', () => {
    const tieEntries = buildWorkspaceEntries(new Set(['b/docs', 'a/docs']), new Set());
    const results = searchWorkspaceEntries(tieEntries, 'docs');
    expect(results.map((entry) => entry.path)).toEqual(['a/docs', 'b/docs']);
  });
});

describe('matchesCommandQuery', () => {
  test('matches empty query', () => {
    expect(matchesCommandQuery('New file', '')).toBe(true);
  });

  test('matches label text and keyword text case-insensitively', () => {
    expect(matchesCommandQuery('Open graph', 'graph')).toBe(true);
    expect(matchesCommandQuery('Open graph', 'claude', ['open in claude code'])).toBe(true);
  });

  test('returns false when neither label nor keywords include the query', () => {
    expect(matchesCommandQuery('Open graph', 'cursor')).toBe(false);
  });
});
