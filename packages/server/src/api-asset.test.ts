import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiExtension } from './api-extension.ts';

interface Harness {
  baseURL: string;
  close: () => Promise<void>;
}

async function startHarness(contentDir: string): Promise<Harness> {
  const ext = createApiExtension({
    hocuspocus: {} as Parameters<typeof createApiExtension>[0]['hocuspocus'],
    sessionManager: {} as Parameters<typeof createApiExtension>[0]['sessionManager'],
    contentDir,
    serverInstanceId: 'test-server',
    getFileIndex: () => new Map(),
  });

  const server: Server = createServer((req, res) => {
    void (
      ext as {
        onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
      }
    ).onRequest({ request: req, response: res });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('server did not bind to a port');
  }

  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function assetUrl(baseURL: string, path: string): string {
  return `${baseURL}/api/asset?path=${encodeURIComponent(path)}`;
}

describe('GET /api/asset', () => {
  let tmpDir: string;
  let contentDir: string;
  let harness: Harness;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-api-asset-'));
    contentDir = join(tmpDir, 'content');
    mkdirSync(join(contentDir, 'docs'), { recursive: true });
    writeFileSync(join(contentDir, 'docs', 'photo.png'), 'fake-png-bytes');
    writeFileSync(join(contentDir, 'docs', 'clip.mp4'), 'fake-mp4-bytes');
    writeFileSync(join(contentDir, 'docs', 'notes.txt'), 'not renderable');
    mkdirSync(join(contentDir, 'docs', 'directory.png'));
    writeFileSync(join(tmpDir, 'outside.png'), 'outside');
    symlinkSync(join(tmpDir, 'outside.png'), join(contentDir, 'docs', 'escape.png'));
    harness = await startHarness(contentDir);
  });

  afterEach(async () => {
    await harness.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('serves supported assets inline with nosniff', async () => {
    const res = await fetch(assetUrl(harness.baseURL, 'docs/photo.png'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe('fake-png-bytes');
  });

  test('rejects missing and null-byte paths', async () => {
    expect((await fetch(`${harness.baseURL}/api/asset`)).status).toBe(400);
    expect((await fetch(`${harness.baseURL}/api/asset?path=docs/photo.png%00`)).status).toBe(400);
  });

  test('rejects unsupported extensions', async () => {
    const res = await fetch(assetUrl(harness.baseURL, 'docs/notes.txt'));

    expect(res.status).toBe(415);
  });

  test('rejects traversal and symlink escapes', async () => {
    expect((await fetch(assetUrl(harness.baseURL, '../outside.png'))).status).toBe(400);
    expect((await fetch(assetUrl(harness.baseURL, 'docs/escape.png'))).status).toBe(400);
  });

  test('rejects missing assets and non-file targets', async () => {
    expect((await fetch(assetUrl(harness.baseURL, 'docs/missing.png'))).status).toBe(404);
    expect((await fetch(assetUrl(harness.baseURL, 'docs/directory.png'))).status).toBe(404);
  });

  test('rejects unsupported methods', async () => {
    const res = await fetch(assetUrl(harness.baseURL, 'docs/photo.png'), { method: 'POST' });

    expect(res.status).toBe(405);
  });
});
