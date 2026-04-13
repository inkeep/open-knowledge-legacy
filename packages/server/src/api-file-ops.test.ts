import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { createApiExtension } from './api-extension.ts';
import type { FileIndexEntry } from './file-watcher.ts';

function makeReq(url: string, method: string, body: unknown): IncomingMessage {
  const raw = JSON.stringify(body);
  const readable = Readable.from(Buffer.from(raw)) as unknown as IncomingMessage;
  readable.method = method;
  readable.url = url;
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

function buildFileIndex(contentDir: string): ReadonlyMap<string, FileIndexEntry> {
  const index = new Map<string, FileIndexEntry>();

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const stat = statSync(fullPath);
      const docName = fullPath.slice(contentDir.length + 1).replace(/\.md$/, '');
      index.set(docName, {
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
  }

  walk(contentDir);
  return index;
}

async function callApi(
  contentDir: string,
  url: string,
  method: string,
  body: unknown,
): Promise<CapturedResponse> {
  const ext = createApiExtension({
    hocuspocus: {
      documents: new Map(),
      closeConnections() {},
      unloadDocument: async () => {},
    } as unknown as Parameters<typeof createApiExtension>[0]['hocuspocus'],
    sessionManager: {
      closeSession: async () => {},
    } as unknown as Parameters<typeof createApiExtension>[0]['sessionManager'],
    contentDir,
    getFileIndex: () => buildFileIndex(contentDir),
  });

  const req = makeReq(url, method, body);
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

let tmpDir: string;

function setupTmpDir(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'ok-file-ops-'));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('file operation API routes', () => {
  test('renames a file and returns the old-to-new mapping', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');

    const result = await callApi(dir, '/api/rename-path', 'POST', {
      kind: 'file',
      fromPath: 'notes',
      toPath: 'renamed-notes',
    });

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'notes.md'))).toBe(false);
    expect(readFileSync(join(dir, 'renamed-notes.md'), 'utf-8')).toBe('# Notes\n');

    const body = JSON.parse(result.body) as { ok: boolean; renamed: Array<Record<string, string>> };
    expect(body.ok).toBe(true);
    expect(body.renamed).toEqual([{ fromDocName: 'notes', toDocName: 'renamed-notes' }]);
  });

  test('renames a folder and returns descendant mappings', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'docs/nested'), { recursive: true });
    writeFileSync(join(dir, 'docs/index.md'), '# Docs\n', 'utf-8');
    writeFileSync(join(dir, 'docs/nested/page.md'), '# Nested\n', 'utf-8');

    const result = await callApi(dir, '/api/rename-path', 'POST', {
      kind: 'folder',
      fromPath: 'docs',
      toPath: 'guides',
    });

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'docs'))).toBe(false);
    expect(readFileSync(join(dir, 'guides/index.md'), 'utf-8')).toBe('# Docs\n');
    expect(readFileSync(join(dir, 'guides/nested/page.md'), 'utf-8')).toBe('# Nested\n');

    const body = JSON.parse(result.body) as {
      ok: boolean;
      renamed: Array<{ fromDocName: string; toDocName: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.renamed).toEqual([
      { fromDocName: 'docs/index', toDocName: 'guides/index' },
      { fromDocName: 'docs/nested/page', toDocName: 'guides/nested/page' },
    ]);
  });

  test('deletes a file and reports the removed doc name', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'trash-me.md'), '# Delete me\n', 'utf-8');

    const result = await callApi(dir, '/api/delete-path', 'POST', {
      kind: 'file',
      path: 'trash-me',
    });

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'trash-me.md'))).toBe(false);

    const body = JSON.parse(result.body) as { ok: boolean; deletedDocNames: string[] };
    expect(body.ok).toBe(true);
    expect(body.deletedDocNames).toEqual(['trash-me']);
  });

  test('deletes a folder recursively and reports descendant doc names', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'archive/old'), { recursive: true });
    writeFileSync(join(dir, 'archive/index.md'), '# Archive\n', 'utf-8');
    writeFileSync(join(dir, 'archive/old/entry.md'), '# Entry\n', 'utf-8');

    const result = await callApi(dir, '/api/delete-path', 'POST', {
      kind: 'folder',
      path: 'archive',
    });

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'archive'))).toBe(false);

    const body = JSON.parse(result.body) as { ok: boolean; deletedDocNames: string[] };
    expect(body.ok).toBe(true);
    expect(body.deletedDocNames).toEqual(['archive/index', 'archive/old/entry']);
  });

  test('rejects traversal attempts', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');

    const result = await callApi(dir, '/api/rename-path', 'POST', {
      kind: 'file',
      fromPath: 'notes',
      toPath: '../escape',
    });

    expect(result.status).toBe(400);
    const body = JSON.parse(result.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('relative content paths');
  });
});
