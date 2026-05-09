import { afterEach, describe, expect, test } from 'bun:test';
import {
  buildWorkspaceEntries,
  EMPTY_QUERY_NAV_LIMIT,
  fetchWorkspaceSearchEntries,
  matchesCommandQuery,
  searchWorkspaceEntries,
  splitTextByQueryMatches,
} from './command-palette-search';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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

describe('splitTextByQueryMatches', () => {
  test('marks query words case-insensitively', () => {
    expect(splitTextByQueryMatches('Homepage content on the home page', 'homepage home')).toEqual([
      { text: 'Homepage', match: true, start: 0 },
      { text: ' content on the ', match: false, start: 8 },
      { text: 'home', match: true, start: 24 },
      { text: ' page', match: false, start: 28 },
    ]);
  });

  test('treats regex metacharacters as literal query text', () => {
    expect(splitTextByQueryMatches('Use api/search?query=home', 'api/search?query=home')).toEqual([
      { text: 'Use ', match: false, start: 0 },
      { text: 'api/search?query=home', match: true, start: 4 },
    ]);
  });
});

describe('fetchWorkspaceSearchEntries', () => {
  test('posts a full-text search request and maps server rows to palette entries', async () => {
    let requestBody: unknown = null;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          results: [
            {
              kind: 'page',
              path: 'THIRD_PARTY_NOTICES',
              title: 'Third Party Notices',
              snippet: 'Homepage: https://example.test',
              score: 42,
            },
            { kind: 'folder', path: 'docs', title: 'docs', score: 12 },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const results = await fetchWorkspaceSearchEntries('homepage');

    expect(requestBody).toEqual({
      query: 'homepage',
      intent: 'full_text',
      scopes: ['page', 'folder', 'content'],
      limit: 30,
    });
    expect(results).toEqual([
      {
        kind: 'file',
        path: 'THIRD_PARTY_NOTICES',
        name: 'THIRD_PARTY_NOTICES',
        title: 'Third Party Notices',
        snippet: 'Homepage: https://example.test',
        score: 42,
      },
      { kind: 'folder', path: 'docs', name: 'docs', title: 'docs', score: 12 },
    ]);
  });
});
