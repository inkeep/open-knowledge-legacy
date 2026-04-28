/**
 * Unit tests for `uploadFile` — the MIME-prefix routing helper that POSTs a
 * File to the appropriate media-upload endpoint and returns the resolved URL.
 *
 * Mocks `globalThis.fetch` directly (no @testing-library, no happy-dom — see
 * the conventions of `shortestImageRef.test.ts` and `PropPanel.test.tsx`).
 * `currentDocName` is a real module-level singleton set/cleared per test.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setCurrentDocName } from './current-doc-name.ts';
import { uploadFile } from './upload-file.ts';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

describe('uploadFile', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: FetchCall[];

  function installFetchMock(handler: (call: FetchCall) => Response | Promise<Response>): void {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const call: FetchCall = { url, init };
      fetchCalls.push(call);
      return handler(call);
    }) as typeof globalThis.fetch;
  }

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
    setCurrentDocName('docs/guide');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setCurrentDocName(null);
  });

  test('image MIME routes to /api/upload-image with multipart form data', async () => {
    installFetchMock(() => jsonResponse(200, { ok: true, src: 'screenshot.png' }));
    const file = new File(['fake-png'], 'screenshot.png', { type: 'image/png' });

    await uploadFile(file, ['image/png', 'image/jpeg']);

    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0];
    expect(call?.url).toBe('/api/upload-image');
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.body).toBeInstanceOf(FormData);
    const fd = call?.init?.body as FormData;
    expect(fd.get('parentDocName')).toBe('docs/guide.md');
    const sentFile = fd.get('file');
    expect(sentFile).toBeInstanceOf(File);
    expect((sentFile as File).name).toBe('screenshot.png');
  });

  test('video MIME routes to /api/upload-video', async () => {
    installFetchMock(() => jsonResponse(200, { ok: true, src: 'demo.mp4' }));
    const file = new File(['fake-mp4'], 'demo.mp4', { type: 'video/mp4' });

    await uploadFile(file, ['video/mp4']);

    expect(fetchCalls[0]?.url).toBe('/api/upload-video');
  });

  test('audio MIME routes to /api/upload-audio', async () => {
    installFetchMock(() => jsonResponse(200, { ok: true, src: 'song.mp3' }));
    const file = new File(['fake-mp3'], 'song.mp3', { type: 'audio/mpeg' });

    await uploadFile(file, ['audio/mpeg']);

    expect(fetchCalls[0]?.url).toBe('/api/upload-audio');
  });

  test('returns { url } from the server src field on success', async () => {
    installFetchMock(() => jsonResponse(200, { ok: true, src: 'photo-1.png' }));
    const file = new File(['x'], 'photo.png', { type: 'image/png' });

    const result = await uploadFile(file, ['image/png']);

    expect(result).toEqual({ url: 'photo-1.png' });
  });

  test('unknown MIME prefix throws without making any fetch call', async () => {
    installFetchMock(() => jsonResponse(200, { ok: true, src: 'unused' }));
    const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });

    await expect(uploadFile(file, ['image/png'])).rejects.toThrow(
      /application\/pdf.*image\/, video\/, audio\//,
    );
    expect(fetchCalls).toHaveLength(0);
  });

  test('error message includes the accept hint for caller-side context', async () => {
    installFetchMock(() => jsonResponse(200, { ok: true, src: 'unused' }));
    const file = new File(['x'], 'x.bin', { type: 'application/octet-stream' });

    await expect(uploadFile(file, ['video/mp4', 'video/webm'])).rejects.toThrow(
      /accept hint: video\/mp4, video\/webm/,
    );
  });

  test('HTTP error response surfaces server-supplied error message', async () => {
    installFetchMock(() =>
      jsonResponse(400, { ok: false, error: 'Unsupported file type: application/pdf' }),
    );
    const file = new File(['fake'], 'malicious.png', { type: 'image/png' });

    await expect(uploadFile(file, ['image/png'])).rejects.toThrow(
      'Unsupported file type: application/pdf',
    );
  });

  test('HTTP error without parseable body falls back to status-code message', async () => {
    installFetchMock(() => new Response('Server error', { status: 500 }));
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    await expect(uploadFile(file, ['image/png'])).rejects.toThrow('Upload failed (500)');
  });

  test('network error surfaces a descriptive message', async () => {
    installFetchMock(() => {
      throw new Error('connection refused');
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    await expect(uploadFile(file, ['image/png'])).rejects.toThrow(
      /Upload failed.*connection refused/,
    );
  });

  test('throws when no document is open', async () => {
    installFetchMock(() => jsonResponse(200, { ok: true, src: 'unused' }));
    setCurrentDocName(null);
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    await expect(uploadFile(file, ['image/png'])).rejects.toThrow('No document is open');
    expect(fetchCalls).toHaveLength(0);
  });

  test('response missing src field throws', async () => {
    installFetchMock(() => jsonResponse(200, { ok: true }));
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    await expect(uploadFile(file, ['image/png'])).rejects.toThrow(/src/);
  });
});
