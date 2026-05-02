import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_GBRAIN_SEARCH_LIMIT,
  fetchGBrainStatus,
  normalizeGBrainSearchPayload,
  searchGBrain,
} from './gbrain-client';

function jsonResponse(payload: unknown, ok = true): Pick<Response, 'json' | 'ok' | 'status'> {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  };
}

describe('gbrain client API helpers', () => {
  test('fetches status from the relative local API endpoint', async () => {
    const calls: Array<RequestInfo | URL> = [];
    const status = await fetchGBrainStatus(async (input) => {
      calls.push(input);
      return jsonResponse({
        ok: true,
        status: {
          state: 'matched',
          sourceId: 'open-knowledge',
          sourceName: 'Open Knowledge',
          localPath: '/repo',
        },
      });
    });

    expect(calls).toEqual(['/api/gbrain/status']);
    expect(status).toEqual({
      state: 'matched',
      sourceId: 'open-knowledge',
      sourceName: 'Open Knowledge',
      localPath: '/repo',
    });
  });

  test('submits searches to the relative local API endpoint with default limit', async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const response = await searchGBrain('family calendar', {
      fetcher: async (input, init) => {
        calls.push({ input, init });
        return jsonResponse({
          ok: true,
          sourceId: 'open-knowledge',
          limit: 10,
          results: [
            {
              sourceId: 'open-knowledge',
              slug: 'notes/family-calendar',
              title: 'Family calendar',
              snippet: 'Calendar notes from the project.',
              score: 0.87,
            },
          ],
        });
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe('/api/gbrain/search');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      query: 'family calendar',
      limit: DEFAULT_GBRAIN_SEARCH_LIMIT,
    });
    expect(response).toEqual({
      ok: true,
      sourceId: 'open-knowledge',
      limit: 10,
      results: [
        {
          sourceId: 'open-knowledge',
          slug: 'notes/family-calendar',
          title: 'Family calendar',
          snippet: 'Calendar notes from the project.',
          score: 0.87,
        },
      ],
    });
  });

  test('maps malformed search payloads to a soft UI error', () => {
    expect(normalizeGBrainSearchPayload({ ok: true, results: 'nope' })).toEqual({
      ok: false,
      code: 'invalid-search-response',
      message: 'gbrain returned an unexpected search response.',
    });
  });
});
