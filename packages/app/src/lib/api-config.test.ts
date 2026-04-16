import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { fetchApiConfig } from './api-config';

type FetchFn = typeof globalThis.fetch;

let originalFetch: FetchFn;

function stubFetch(fn: FetchFn): void {
  globalThis.fetch = fn;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchApiConfig', () => {
  it('returns parsed payload when /api/config returns 200 with full shape', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            collabUrl: 'ws://localhost:52000/collab',
            previewUrl: 'http://localhost:3000/',
            port: 3000,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const cfg = await fetchApiConfig();
    expect(cfg).toEqual({
      collabUrl: 'ws://localhost:52000/collab',
      previewUrl: 'http://localhost:3000/',
      port: 3000,
    });
  });

  it('normalizes missing fields to null / 0', async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ collabUrl: null, previewUrl: null, port: 0 }), {
          status: 200,
        }),
    );
    const cfg = await fetchApiConfig();
    expect(cfg).toEqual({ collabUrl: null, previewUrl: null, port: 0 });
  });

  it('returns null when the response is 404', async () => {
    stubFetch(async () => new Response('', { status: 404 }));
    const cfg = await fetchApiConfig();
    expect(cfg).toBeNull();
  });

  it('returns null when the response body is not an object', async () => {
    stubFetch(async () => new Response(JSON.stringify([1, 2, 3]), { status: 200 }));
    const cfg = await fetchApiConfig();
    expect(cfg).toBeNull();
  });

  it('coerces non-string collabUrl to null', async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ collabUrl: 42, previewUrl: true, port: 'abc' }), {
          status: 200,
        }),
    );
    const cfg = await fetchApiConfig();
    expect(cfg).toEqual({ collabUrl: null, previewUrl: null, port: 0 });
  });

  it('propagates AbortError when the signal is aborted before fetch resolves', async () => {
    const ac = new AbortController();
    stubFetch(async (_url, init) => {
      // Simulate a slow fetch that observes the abort signal.
      return await new Promise<Response>((_resolve, reject) => {
        const sig = (init as RequestInit | undefined)?.signal as AbortSignal | undefined;
        sig?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    const promise = fetchApiConfig(ac.signal);
    ac.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
