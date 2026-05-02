import { describe, expect, test } from 'bun:test';
import {
  createGBrainSearcher,
  type GBrainSearchStatusProvider,
  parseGBrainSearchJson,
} from './gbrain-search';
import type { GBrainCommandResult, GBrainCommandRunner } from './gbrain-status';

const success = (stdout = ''): GBrainCommandResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
});

const failure = (stderr = 'failed'): GBrainCommandResult => ({
  exitCode: 1,
  stdout: '',
  stderr,
});

function createRunner(results: GBrainCommandResult[]): GBrainCommandRunner & { calls: string[][] } {
  const calls: string[][] = [];
  const runner = async (args: readonly string[]) => {
    calls.push([...args]);
    const result = results.shift();
    if (result === undefined) throw new Error(`unexpected gbrain call: ${args.join(' ')}`);
    return result;
  };
  return Object.assign(runner, { calls });
}

const matchedStatusProvider: GBrainSearchStatusProvider = {
  getStatus: async () => ({
    state: 'matched',
    sourceId: 'source-1',
    sourceName: 'Source One',
    localPath: '/project',
  }),
};

describe('createGBrainSearcher', () => {
  test('requires a matched gbrain status before invoking search', async () => {
    const runner = createRunner([]);
    const searcher = createGBrainSearcher({
      run: runner,
      statusProvider: {
        getStatus: async () => ({
          state: 'not-registered',
          projectPath: '/project',
          message: 'This folder is not registered as a gbrain source.',
        }),
      },
    });

    await expect(searcher.search('/project', { query: 'intro' })).resolves.toMatchObject({
      ok: false,
      code: 'not-matched',
      diagnostic: 'not-registered',
    });
    expect(runner.calls).toEqual([]);
  });

  test('returns normalized results filtered to the matched source', async () => {
    const runner = createRunner([
      success(
        JSON.stringify([
          {
            source_id: 'source-1',
            slug: 'docs/intro',
            title: 'Intro',
            chunk_text: 'Open Knowledge intro snippet',
            score: 0.82,
            stale: false,
          },
          {
            source_id: 'other-source',
            slug: 'other/page',
            chunk_text: 'Unrelated snippet',
            score: 0.5,
          },
        ]),
      ),
    ]);
    const searcher = createGBrainSearcher({
      run: runner,
      statusProvider: matchedStatusProvider,
    });

    await expect(searcher.search('/project', { query: 'intro' })).resolves.toEqual({
      ok: true,
      sourceId: 'source-1',
      limit: 10,
      results: [
        {
          sourceId: 'source-1',
          slug: 'docs/intro',
          title: 'Intro',
          snippet: 'Open Knowledge intro snippet',
          score: 0.82,
          stale: false,
        },
      ],
    });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.slice(0, 2)).toEqual(['call', 'query']);
    expect(JSON.parse(runner.calls[0]?.[2] ?? '{}')).toMatchObject({
      query: 'intro',
      limit: 40,
    });
  });

  test('clamps rendered limits and over-fetches within a bounded cap', async () => {
    const runner = createRunner([success(JSON.stringify([]))]);
    const searcher = createGBrainSearcher({
      run: runner,
      statusProvider: matchedStatusProvider,
    });

    await expect(searcher.search('/project', { query: 'intro', limit: 1000 })).resolves.toEqual({
      ok: true,
      sourceId: 'source-1',
      limit: 50,
      results: [],
    });
    expect(JSON.parse(runner.calls[0]?.[2] ?? '{}')).toMatchObject({
      query: 'intro',
      limit: 50,
    });
  });

  test('returns empty results when no rows are available', async () => {
    const runner = createRunner([success(JSON.stringify([]))]);
    const searcher = createGBrainSearcher({
      run: runner,
      statusProvider: matchedStatusProvider,
    });

    await expect(searcher.search('/project', { query: 'no match', limit: 3 })).resolves.toEqual({
      ok: true,
      sourceId: 'source-1',
      limit: 3,
      results: [],
    });
  });

  test('fails soft when result source identifiers are missing', async () => {
    const runner = createRunner([
      success(
        JSON.stringify([
          {
            slug: 'docs/intro',
            chunk_text: 'Open Knowledge intro snippet',
          },
        ]),
      ),
    ]);
    const searcher = createGBrainSearcher({
      run: runner,
      statusProvider: matchedStatusProvider,
    });

    await expect(searcher.search('/project', { query: 'intro' })).resolves.toMatchObject({
      ok: false,
      code: 'missing-source-identifiers',
    });
  });

  test('maps invalid JSON responses to a concise diagnostic', async () => {
    const runner = createRunner([success('{not-json')]);
    const searcher = createGBrainSearcher({
      run: runner,
      statusProvider: matchedStatusProvider,
    });

    await expect(searcher.search('/project', { query: 'intro' })).resolves.toMatchObject({
      ok: false,
      code: 'invalid-json',
      message: 'gbrain returned an unexpected search response.',
    });
  });

  test('maps timeout responses without throwing', async () => {
    const runner = createRunner([{ exitCode: null, stdout: '', stderr: '', timedOut: true }]);
    const searcher = createGBrainSearcher({
      run: runner,
      statusProvider: matchedStatusProvider,
    });

    await expect(searcher.search('/project', { query: 'intro' })).resolves.toEqual({
      ok: false,
      code: 'timeout',
      message: 'gbrain search did not respond in time.',
    });
  });

  test('maps embedding and generic CLI failures', async () => {
    const embeddingSearch = createGBrainSearcher({
      run: createRunner([failure('missing vector embeddings')]),
      statusProvider: matchedStatusProvider,
    });
    await expect(embeddingSearch.search('/project', { query: 'intro' })).resolves.toMatchObject({
      ok: false,
      code: 'missing-embeddings',
      diagnostic: 'missing vector embeddings',
    });

    const genericSearch = createGBrainSearcher({
      run: createRunner([failure('database unavailable')]),
      statusProvider: matchedStatusProvider,
    });
    await expect(genericSearch.search('/project', { query: 'intro' })).resolves.toMatchObject({
      ok: false,
      code: 'search-failed',
      diagnostic: 'database unavailable',
    });
  });
});

describe('parseGBrainSearchJson', () => {
  test('normalizes row fallbacks into renderer-friendly fields', () => {
    expect(
      parseGBrainSearchJson(
        JSON.stringify([
          {
            source_id: 'source-1',
            page_id: 'page-fallback',
            chunk_source: 'Source text fallback',
            score: Number.NaN,
            stale: true,
          },
        ]),
      ),
    ).toEqual([
      {
        sourceId: 'source-1',
        slug: 'page-fallback',
        title: undefined,
        snippet: 'Source text fallback',
        score: undefined,
        stale: true,
      },
    ]);
  });

  test('rejects unexpected search response shapes', () => {
    expect(() => parseGBrainSearchJson(JSON.stringify({ rows: [] }))).toThrow();
  });
});
