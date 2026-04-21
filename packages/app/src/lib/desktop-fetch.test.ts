import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { installDesktopFetchRewrite } from './desktop-fetch';

/**
 * Unit tests for the renderer-side fetch rewriter. These exercise the pure
 * wrapper logic — no DOM or Electron runtime needed. The real window.fetch
 * is replaced by a stub so we can assert on the URL passed through.
 *
 * Isolation contract: Bun's test runner shares a single process across test
 * files, so we preserve + restore `globalThis.window` and `globalThis.fetch`
 * around this suite. Other suites (e.g. `handle-paste.test.ts`) depend on
 * the ambient `window` object being untouched — without this restoration
 * they'd see our stub and fail with "window.getSelection is not a function"
 * or similar, depending on scheduling order.
 *
 * Coverage:
 *  - `/api/*` string URLs → rewritten to apiOrigin + path
 *  - absolute http/ws URLs pass through unchanged
 *  - URL objects with same-origin /api/* → rewritten
 *  - URL objects for absolute externals → unchanged
 *  - Request objects wrapping /api/* → rewritten while preserving method/body
 *  - apiOrigin === '' → installer is a no-op (web / CLI distribution)
 *  - double-install is idempotent
 */

type GlobalLike = {
  window?: Window;
  fetch?: typeof fetch;
};
const g = globalThis as unknown as GlobalLike;
const originalWindow = g.window;
const originalFetch = g.fetch;

function stubWindowFetch() {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchStub = mock((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
  });
  g.window = {
    fetch: fetchStub,
    location: { origin: 'http://localhost:5173' },
  } as unknown as Window;
  // Replace globalThis.fetch too since `window.fetch.bind(window)` reads the
  // identity from the `window` binding we just installed.
  g.fetch = fetchStub as unknown as typeof fetch;
  return { calls, fetchStub };
}

describe('installDesktopFetchRewrite', () => {
  beforeAll(() => {
    // Capture whatever ambient globals exist at suite entry. See header comment.
  });

  afterAll(() => {
    // Restore — don't leak our stub into sibling suites.
    if (originalWindow === undefined) delete g.window;
    else g.window = originalWindow;
    if (originalFetch === undefined) delete g.fetch;
    else g.fetch = originalFetch;
  });

  beforeEach(() => {
    // Fresh window per test so the Symbol.for marker doesn't leak across.
    delete g.window;
    delete g.fetch;
  });

  afterEach(() => {
    // Belt-and-suspenders: clear between tests so an early-abort test doesn't
    // leave a stub that the next suite picks up if this suite stops here.
    delete g.window;
    delete g.fetch;
  });

  test('rewrites string /api/* URL to apiOrigin + path', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    await window.fetch('/api/documents');
    expect(calls[0]?.input).toBe('http://localhost:59534/api/documents');
  });

  test('preserves query string on /api/* URL', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    await window.fetch('/api/document?docName=foo&cache=bust');
    expect(calls[0]?.input).toBe('http://localhost:59534/api/document?docName=foo&cache=bust');
  });

  test('passes absolute http:// URLs through unchanged', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    await window.fetch('https://example.com/image.png');
    expect(calls[0]?.input).toBe('https://example.com/image.png');
  });

  test('passes absolute ws:// URLs through unchanged', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    await window.fetch('ws://localhost:59534/collab');
    expect(calls[0]?.input).toBe('ws://localhost:59534/collab');
  });

  test('passes non-/api relative URLs through unchanged', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    await window.fetch('/assets/favicon.svg');
    expect(calls[0]?.input).toBe('/assets/favicon.svg');
  });

  test('rewrites URL object with same-origin /api/* path', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    await window.fetch(new URL('/api/backlinks?docName=foo', 'http://localhost:5173'));
    expect(calls[0]?.input).toBe('http://localhost:59534/api/backlinks?docName=foo');
  });

  test('leaves URL object for absolute external unchanged', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    const extUrl = new URL('https://api.example.com/v1/thing');
    await window.fetch(extUrl);
    expect(calls[0]?.input).toBe(extUrl);
  });

  test('rewrites Request object wrapping /api/* URL, preserving method + body', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    const req = new Request('http://localhost:5173/api/agent-write-md', {
      method: 'POST',
      body: JSON.stringify({ docName: 'foo', position: 'replace', content: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    });
    await window.fetch(req);
    const rewritten = calls[0]?.input;
    expect(rewritten).toBeInstanceOf(Request);
    expect((rewritten as Request).url).toBe('http://localhost:59534/api/agent-write-md');
    expect((rewritten as Request).method).toBe('POST');
  });

  test('empty apiOrigin → install is a no-op (web / CLI)', async () => {
    const { fetchStub } = stubWindowFetch();
    const before = window.fetch;
    installDesktopFetchRewrite({ apiOrigin: '' });
    // Identity preserved — no wrapper installed.
    expect(window.fetch).toBe(before);
    expect(window.fetch).toBe(fetchStub as unknown as typeof fetch);
  });

  test('double-install is idempotent (second call does not double-wrap)', async () => {
    const { calls } = stubWindowFetch();
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    const firstWrapper = window.fetch;
    installDesktopFetchRewrite({ apiOrigin: 'http://localhost:59534' });
    expect(window.fetch).toBe(firstWrapper);
    // And it still rewrites only once, not twice.
    await window.fetch('/api/documents');
    expect(calls[0]?.input).toBe('http://localhost:59534/api/documents');
  });
});
