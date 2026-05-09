import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApiExtension } from './api-extension.ts';
import type { FileIndexEntry } from './file-watcher.ts';

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function makeReq(method: string, url: string, body = ''): IncomingMessage {
  const readable = Readable.from(Buffer.from(body)) as unknown as IncomingMessage;
  readable.method = method;
  readable.url = url;
  readable.headers = { host: 'localhost' };
  return readable;
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

function buildFileIndex(dir: string, base = ''): ReadonlyMap<string, FileIndexEntry> {
  const index = new Map<string, FileIndexEntry>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [key, value] of buildFileIndex(join(dir, entry.name), rel)) {
        index.set(key, value);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const stat = statSync(join(dir, entry.name));
      index.set(rel.slice(0, -3), {
        size: stat.size,
        modified: stat.mtime.toISOString(),
        canonicalPath: join(dir, entry.name),
        inode: stat.ino,
        aliases: [],
      });
    }
  }
  return index;
}

async function callSearch(contentDir: string, url: string, method = 'GET', body = '') {
  const fileIndex = buildFileIndex(contentDir);
  const ext = createApiExtension({
    hocuspocus: {} as unknown as Parameters<typeof createApiExtension>[0]['hocuspocus'],
    sessionManager: {} as unknown as Parameters<typeof createApiExtension>[0]['sessionManager'],
    contentDir,
    serverInstanceId: 'test-server',
    getFileIndex: () => fileIndex,
  });
  const req = makeReq(method, url, body);
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

describe('GET /api/search', () => {
  test('returns page and folder entity matches for omnibar intent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-search-'));
    try {
      mkdirSync(join(dir, 'architecture'), { recursive: true });
      writeFileSync(join(dir, 'architecture/overview.md'), '# System Overview\n', 'utf-8');
      writeFileSync(join(dir, 'api.md'), '# API\n', 'utf-8');

      const result = await callSearch(dir, '/api/search?query=arch&intent=omnibar');
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as {
        results?: Array<{ kind: string; path: string }>;
      };

      expect(body.results?.map((row) => `${row.kind}:${row.path}`)).toEqual([
        'folder:architecture',
        'page:architecture/overview',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns full-text content matches with snippets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-search-'));
    try {
      writeFileSync(
        join(dir, 'bridge.md'),
        '# Bridge\n\nObserver bridge keeps CRDT views synchronized.\n',
        'utf-8',
      );
      writeFileSync(join(dir, 'api.md'), '# API\n\nEndpoint list.\n', 'utf-8');

      const result = await callSearch(dir, '/api/search?query=crdt&intent=full_text');
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as {
        results?: Array<{ kind: string; path: string; snippet?: string }>;
      };

      expect(body.results?.[0]).toEqual(
        expect.objectContaining({
          kind: 'page',
          path: 'bridge',
          snippet: expect.stringContaining('CRDT'),
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('supports POST bodies for shared search clients', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-search-'));
    try {
      writeFileSync(join(dir, 'release-notes.md'), '# Release Notes\n', 'utf-8');

      const result = await callSearch(
        dir,
        '/api/search',
        'POST',
        JSON.stringify({ query: 'release', intent: 'autocomplete', scopes: ['page'] }),
      );
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as {
        results?: Array<{ path: string }>;
      };

      expect(body.results?.map((row) => row.path)).toEqual(['release-notes']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns 400 for malformed POST bodies', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-search-'));
    try {
      const result = await callSearch(dir, '/api/search', 'POST', '{not json');

      expect(result.status).toBe(400);
      const body = JSON.parse(result.body) as { type: string };
      expect(body.type).toBe('urn:ok:error:invalid-request');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns 413 for oversized POST bodies', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-search-'));
    try {
      const result = await callSearch(dir, '/api/search', 'POST', 'x'.repeat(1_048_577));

      expect(result.status).toBe(413);
      const body = JSON.parse(result.body) as { type: string };
      expect(body.type).toBe('urn:ok:error:payload-too-large');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
