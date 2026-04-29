/**
 * Unit tests for `uploadFile` — POSTs a File to the unified `/api/upload`
 * endpoint and unwraps the response into `{ url }`.
 *
 * Uses dependency-injection (the optional `deps` arg) to pass mock fetch +
 * docName directly. No `globalThis.fetch =` mutation — the prior pattern
 * proved flaky on Linux Bun (CI surfaced "string-rejection" before the first
 * test ran on commit `1f69f274`). DI tests are platform-stable.
 */
import { describe, expect, test } from 'bun:test';
import { uploadFile } from './upload-file.ts';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function captureFetch(handler: (call: FetchCall) => Response | Promise<Response>): {
  fetch: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof fetch = (async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const call: FetchCall = { url, init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TEST_DOC_NAME = 'docs/guide';

describe('uploadFile', () => {
  test('image upload posts to /api/upload with multipart form data', async () => {
    const { fetch, calls } = captureFetch(() =>
      jsonResponse(200, {
        ok: true,
        src: 'screenshot.png',
        path: 'docs/screenshot.png',
        deduped: false,
      }),
    );
    const file = new File(['fake-png'], 'screenshot.png', { type: 'image/png' });

    await uploadFile(file, ['image/png', 'image/jpeg'], { fetch, docName: TEST_DOC_NAME });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe('/api/upload');
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.body).toBeInstanceOf(FormData);
    const fd = call?.init?.body as FormData;
    expect(fd.get('parentDocName')).toBe('docs/guide');
    const sentFile = fd.get('file');
    expect(sentFile).toBeInstanceOf(File);
    expect((sentFile as File).name).toBe('screenshot.png');
  });

  test('video upload posts to /api/upload (no per-MIME route)', async () => {
    const { fetch, calls } = captureFetch(() =>
      jsonResponse(200, { ok: true, src: 'demo.mp4', path: 'demo.mp4', deduped: false }),
    );
    const file = new File(['fake-mp4'], 'demo.mp4', { type: 'video/mp4' });

    await uploadFile(file, ['video/mp4'], { fetch, docName: TEST_DOC_NAME });

    expect(calls[0]?.url).toBe('/api/upload');
  });

  test('audio upload posts to /api/upload (no per-MIME route)', async () => {
    const { fetch, calls } = captureFetch(() =>
      jsonResponse(200, { ok: true, src: 'song.mp3', path: 'song.mp3', deduped: false }),
    );
    const file = new File(['fake-mp3'], 'song.mp3', { type: 'audio/mpeg' });

    await uploadFile(file, ['audio/mpeg'], { fetch, docName: TEST_DOC_NAME });

    expect(calls[0]?.url).toBe('/api/upload');
  });

  test('upload uses /api/upload regardless of MIME prefix (server is sole policy point)', async () => {
    // Pre-merge versions of this helper rejected non-image/video/audio MIMEs
    // client-side. Post-merge, the unified endpoint is accept-all by extension
    // (ASSET_EXTENSIONS). PDFs etc. travel through identically.
    const { fetch, calls } = captureFetch(() =>
      jsonResponse(200, { ok: true, src: 'doc.pdf', path: 'doc.pdf', deduped: false }),
    );
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });

    await uploadFile(file, ['image/png'], { fetch, docName: TEST_DOC_NAME });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/upload');
  });

  test('returns { url } from the server path field on success', async () => {
    // `path` is contentDir-relative — honors `attachmentFolderPath`. Prefer
    // it over `src` (bare basename) for accuracy under non-default attachment
    // paths.
    const { fetch } = captureFetch(() =>
      jsonResponse(200, {
        ok: true,
        src: 'photo-1.png',
        path: 'docs/photo-1.png',
        deduped: false,
      }),
    );
    const file = new File(['x'], 'photo.png', { type: 'image/png' });

    const result = await uploadFile(file, ['image/png'], { fetch, docName: TEST_DOC_NAME });

    expect(result).toEqual({ url: 'docs/photo-1.png' });
  });

  test('falls back to src when path is omitted', async () => {
    const { fetch } = captureFetch(() => jsonResponse(200, { ok: true, src: 'photo.png' }));
    const file = new File(['x'], 'photo.png', { type: 'image/png' });

    const result = await uploadFile(file, ['image/png'], { fetch, docName: TEST_DOC_NAME });

    expect(result).toEqual({ url: 'photo.png' });
  });

  test('HTTP error response surfaces server-supplied error message', async () => {
    const { fetch } = captureFetch(() =>
      jsonResponse(400, { ok: false, error: 'Unsupported file type: application/pdf' }),
    );
    const file = new File(['fake'], 'malicious.png', { type: 'image/png' });

    await expect(
      uploadFile(file, ['image/png'], { fetch, docName: TEST_DOC_NAME }),
    ).rejects.toThrow('Unsupported file type: application/pdf');
  });

  test('HTTP error without parseable body falls back to status-code message', async () => {
    const { fetch } = captureFetch(() => new Response('Server error', { status: 500 }));
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    await expect(
      uploadFile(file, ['image/png'], { fetch, docName: TEST_DOC_NAME }),
    ).rejects.toThrow('Upload failed (500)');
  });

  test('network error surfaces a descriptive message', async () => {
    const { fetch } = captureFetch(() => {
      throw new Error('connection refused');
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    await expect(
      uploadFile(file, ['image/png'], { fetch, docName: TEST_DOC_NAME }),
    ).rejects.toThrow(/Upload failed.*connection refused/);
  });

  test('throws when no document is open', async () => {
    const { fetch, calls } = captureFetch(() =>
      jsonResponse(200, { ok: true, src: 'unused', path: 'unused', deduped: false }),
    );
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    await expect(uploadFile(file, ['image/png'], { fetch, docName: null })).rejects.toThrow(
      'No document is open',
    );
    expect(calls).toHaveLength(0);
  });

  test('response missing path and src throws', async () => {
    const { fetch } = captureFetch(() => jsonResponse(200, { ok: true }));
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    await expect(
      uploadFile(file, ['image/png'], { fetch, docName: TEST_DOC_NAME }),
    ).rejects.toThrow(/path.*src/);
  });
});
