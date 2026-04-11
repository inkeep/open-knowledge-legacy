/**
 * Tests for POST /api/create-page — create a new empty markdown file.
 *
 * These tests exercise the handler through the `createApiExtension` factory,
 * using a real temp directory on the filesystem so 409 (already exists) and
 * the actual file creation can be verified without mocking node:fs.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApiExtension } from './api-extension.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(method: string, body: unknown): IncomingMessage {
  const raw = JSON.stringify(body);
  const readable = Readable.from(Buffer.from(raw)) as unknown as IncomingMessage;
  readable.method = method;
  readable.url = '/api/create-page';
  readable.headers = { host: 'localhost' };
  return readable;
}

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      if (headers) Object.assign(captured.headers, headers);
    },
    end(body?: string) {
      captured.body = body ?? '';
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

async function callCreatePage(
  contentDir: string,
  method: string,
  body: unknown,
): Promise<CapturedResponse> {
  const ext = createApiExtension({
    hocuspocus: {} as unknown as Parameters<typeof createApiExtension>[0]['hocuspocus'],
    sessionManager: {} as unknown as Parameters<typeof createApiExtension>[0]['sessionManager'],
    contentDir,
  });
  const req = makeReq(method, body);
  const { res, captured } = makeRes();
  // onRequest is guaranteed to be defined by createApiExtension
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string;

function setupTmpDir(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'ok-create-page-'));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/create-page', () => {
  test('creates a file and returns { ok: true, docName }', async () => {
    const dir = setupTmpDir();
    const result = await callCreatePage(dir, 'POST', { path: 'my-page.md' });

    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.docName).toBe('my-page');
    expect(existsSync(join(dir, 'my-page.md'))).toBe(true);
  });

  test('creates parent directories for nested paths and returns full docName', async () => {
    const dir = setupTmpDir();
    const result = await callCreatePage(dir, 'POST', { path: 'nested/folder/my-page.md' });

    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.docName).toBe('nested/folder/my-page');
    expect(existsSync(join(dir, 'nested/folder/my-page.md'))).toBe(true);
  });

  test('returns 400 when path field is missing', async () => {
    const dir = setupTmpDir();
    const result = await callCreatePage(dir, 'POST', {});

    expect(result.status).toBe(400);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('returns 400 when path contains ..', async () => {
    const dir = setupTmpDir();
    const result = await callCreatePage(dir, 'POST', { path: '../escape.md' });

    expect(result.status).toBe(400);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.ok).toBe(false);
  });

  test('returns 409 when the file already exists', async () => {
    const dir = setupTmpDir();
    // Create the file first
    await callCreatePage(dir, 'POST', { path: 'existing.md' });

    // Try to create again — should 409
    const result = await callCreatePage(dir, 'POST', { path: 'existing.md' });

    expect(result.status).toBe(409);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.ok).toBe(false);
  });

  test('returns 405 for GET requests', async () => {
    const dir = setupTmpDir();
    const result = await callCreatePage(dir, 'GET', {});

    expect(result.status).toBe(405);
  });
});
