import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { Hocuspocus } from '@hocuspocus/server';
import type * as Y from 'yjs';
import { createApiExtension } from './api-extension.ts';
import { BacklinkIndex } from './backlink-index.ts';
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

function buildBacklinkIndex(contentDir: string): BacklinkIndex {
  const index = new BacklinkIndex({
    projectDir: contentDir,
    contentDir,
  });
  index.rebuildFromDisk();
  return index;
}

async function callApi(
  contentDir: string,
  url: string,
  method: string,
  body: unknown,
  options?: {
    backlinkIndex?: BacklinkIndex;
    hocuspocus?: Parameters<typeof createApiExtension>[0]['hocuspocus'];
    sessionManager?: Parameters<typeof createApiExtension>[0]['sessionManager'];
  },
): Promise<CapturedResponse> {
  const ext = createApiExtension({
    hocuspocus:
      options?.hocuspocus ??
      ({
        documents: new Map(),
        closeConnections() {},
        unloadDocument: async () => {},
      } as unknown as Parameters<typeof createApiExtension>[0]['hocuspocus']),
    sessionManager:
      options?.sessionManager ??
      ({
        closeSession: async () => {},
      } as unknown as Parameters<typeof createApiExtension>[0]['sessionManager']),
    contentDir,
    getFileIndex: () => buildFileIndex(contentDir),
    backlinkIndex: options?.backlinkIndex ?? buildBacklinkIndex(contentDir),
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
  test('managed rename rewrites inbound wiki-links and markdown links', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');
    writeFileSync(
      join(dir, 'journal.md'),
      '# Journal\n\nSee [[notes]] and [Notes](./notes.md).\n',
      'utf-8',
    );
    writeFileSync(
      join(dir, 'nested/child.md'),
      '# Child\n\nJump to [Notes](../notes.md#intro "Section").\n',
      'utf-8',
    );

    const result = await callApi(
      dir,
      '/api/rename',
      'POST',
      {
        docName: 'notes',
        newDocName: 'renamed-notes',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'notes.md'))).toBe(false);
    expect(readFileSync(join(dir, 'renamed-notes.md'), 'utf-8')).toBe('# Notes\n');
    expect(readFileSync(join(dir, 'journal.md'), 'utf-8')).toBe(
      '# Journal\n\nSee [[renamed-notes]] and [Notes](./renamed-notes.md).\n',
    );
    expect(readFileSync(join(dir, 'nested/child.md'), 'utf-8')).toBe(
      '# Child\n\nJump to [Notes](../renamed-notes.md#intro "Section").\n',
    );

    const body = JSON.parse(result.body) as {
      ok: boolean;
      renamed: Array<{ fromDocName: string; toDocName: string }>;
      rewrittenDocs: Array<{ docName: string; rewrites: number }>;
    };
    expect(body.ok).toBe(true);
    expect(body.renamed).toEqual([{ fromDocName: 'notes', toDocName: 'renamed-notes' }]);
    expect(body.rewrittenDocs).toEqual([
      { docName: 'journal', rewrites: 2 },
      { docName: 'nested/child', rewrites: 1 },
    ]);
  });

  test('managed rename updates an already-loaded referring document', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');
    writeFileSync(join(dir, 'journal.md'), '# Journal\n\nSee [[notes]].\n', 'utf-8');

    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('journal');
    const document = (conn as unknown as { document: Y.Doc }).document;
    const ytext = document.getText('source');
    document.transact(() => {
      ytext.insert(0, '# Journal\n\nSee [[notes]].\n');
    });

    try {
      const result = await callApi(
        dir,
        '/api/rename',
        'POST',
        {
          docName: 'notes',
          newDocName: 'renamed-notes',
        },
        {
          backlinkIndex: buildBacklinkIndex(dir),
          hocuspocus,
        },
      );

      expect(result.status).toBe(200);
      expect(document.getText('source').toString()).toBe('# Journal\n\nSee [[renamed-notes]].\n');
      expect(readFileSync(join(dir, 'journal.md'), 'utf-8')).toBe(
        '# Journal\n\nSee [[renamed-notes]].\n',
      );
    } finally {
      await conn.disconnect();
    }
  });

  test('managed rename rejects destination collisions without changing files', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');
    writeFileSync(join(dir, 'renamed-notes.md'), '# Existing\n', 'utf-8');
    writeFileSync(join(dir, 'journal.md'), '# Journal\n\nSee [[notes]].\n', 'utf-8');

    const result = await callApi(
      dir,
      '/api/rename',
      'POST',
      {
        docName: 'notes',
        newDocName: 'renamed-notes',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(409);
    expect(readFileSync(join(dir, 'notes.md'), 'utf-8')).toBe('# Notes\n');
    expect(readFileSync(join(dir, 'renamed-notes.md'), 'utf-8')).toBe('# Existing\n');
    expect(readFileSync(join(dir, 'journal.md'), 'utf-8')).toBe('# Journal\n\nSee [[notes]].\n');

    const body = JSON.parse(result.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Destination already exists');
  });

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

  test.skipIf(process.platform === 'win32')(
    'rejects delete when path resolves outside content via symlink',
    async () => {
      const root = setupTmpDir();
      const contentDir = join(root, 'content');
      const outside = join(root, 'outside');
      mkdirSync(contentDir);
      mkdirSync(outside);
      const victim = join(outside, 'victim.md');
      writeFileSync(victim, '# Victim\n', 'utf-8');
      symlinkSync(join('..', 'outside'), join(contentDir, 'evil'), 'dir');

      const result = await callApi(contentDir, '/api/delete-path', 'POST', {
        kind: 'file',
        path: 'evil/victim',
      });

      expect(result.status).toBe(500);
      expect(existsSync(victim)).toBe(true);
    },
  );

  test.skipIf(process.platform === 'win32')(
    'rejects rename into destination that resolves outside content via symlink',
    async () => {
      const root = setupTmpDir();
      const contentDir = join(root, 'content');
      const outside = join(root, 'outside');
      mkdirSync(contentDir);
      mkdirSync(outside);
      symlinkSync(join('..', 'outside'), join(contentDir, 'evil'), 'dir');
      writeFileSync(join(contentDir, 'safe.md'), '# Safe\n', 'utf-8');

      const result = await callApi(contentDir, '/api/rename-path', 'POST', {
        kind: 'file',
        fromPath: 'safe',
        toPath: 'evil/captured',
      });

      expect(result.status).toBe(500);
      expect(readFileSync(join(contentDir, 'safe.md'), 'utf-8')).toBe('# Safe\n');
      expect(existsSync(join(outside, 'captured.md'))).toBe(false);
    },
  );
});
