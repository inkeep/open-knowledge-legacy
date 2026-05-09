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
import simpleGit from 'simple-git';
import type * as Y from 'yjs';
import { createApiExtension } from './api-extension.ts';
import { BacklinkIndex } from './backlink-index.ts';
import { type ContentFilter, createContentFilter } from './content-filter.ts';
import type { FileIndexEntry, FolderIndexEntry } from './file-watcher.ts';

function makeReq(url: string, method: string, body: unknown): IncomingMessage {
  const raw = body === undefined ? '' : JSON.stringify(body);
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
        canonicalPath: fullPath,
        inode: stat.ino,
        aliases: [],
      });
    }
  }

  walk(contentDir);
  return index;
}

function buildFolderIndex(contentDir: string): ReadonlyMap<string, FolderIndexEntry> {
  const index = new Map<string, FolderIndexEntry>();

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = resolve(dir, entry.name);
      const stat = statSync(fullPath);
      const folderPath = fullPath.slice(contentDir.length + 1);
      index.set(folderPath, {
        size: 0,
        modified: stat.mtime.toISOString(),
        canonicalPath: fullPath,
        inode: stat.ino,
      });
      walk(fullPath);
    }
  }

  walk(contentDir);
  return index;
}

async function buildBacklinkIndex(contentDir: string): Promise<BacklinkIndex> {
  const index = new BacklinkIndex({
    projectDir: contentDir,
    contentDir,
  });
  await index.rebuildFromDisk();
  return index;
}

async function callApi(
  contentDir: string,
  url: string,
  method: string,
  body: unknown,
  options?: {
    backlinkIndex?: BacklinkIndex | Promise<BacklinkIndex>;
    hocuspocus?: Parameters<typeof createApiExtension>[0]['hocuspocus'];
    sessionManager?: Parameters<typeof createApiExtension>[0]['sessionManager'];
    getFileIndex?: () => ReadonlyMap<string, FileIndexEntry>;
    getFolderIndex?: () => ReadonlyMap<string, FolderIndexEntry>;
    signalChannel?: Parameters<typeof createApiExtension>[0]['signalChannel'];
    projectDir?: string;
    contentFilter?: ContentFilter;
  },
): Promise<CapturedResponse> {
  const resolvedBacklinkIndex = await (options?.backlinkIndex ?? buildBacklinkIndex(contentDir));
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
        closeAllForDoc: async () => {},
      } as unknown as Parameters<typeof createApiExtension>[0]['sessionManager']),
    contentDir,
    getFileIndex: options?.getFileIndex ?? (() => buildFileIndex(contentDir)),
    getFolderIndex: options?.getFolderIndex ?? (() => buildFolderIndex(contentDir)),
    backlinkIndex: resolvedBacklinkIndex,
    signalChannel: options?.signalChannel,
    projectDir: options?.projectDir,
    contentFilter: options?.contentFilter,
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
      '/api/rename-path',
      'POST',
      {
        kind: 'file',
        fromPath: 'notes',
        toPath: 'renamed-notes',
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
    expect(body.ok).toBeUndefined();
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
        '/api/rename-path',
        'POST',
        {
          kind: 'file',
          fromPath: 'notes',
          toPath: 'renamed-notes',
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

  test('GET /api/document returns 404 for missing docs (does not create a phantom Y.Doc)', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'real-doc.md'), '# Real\n', 'utf-8');

    const hocuspocus = new Hocuspocus({ quiet: true });

    expect(hocuspocus.documents.has('nonexistent-doc')).toBe(false);

    const result = await callApi(
      dir,
      '/api/document?docName=nonexistent-doc',
      'GET',
      {},
      { hocuspocus },
    );

    expect(result.status).toBe(404);
    const parsed = JSON.parse(result.body) as Record<string, unknown>;
    expect(parsed.type).toBe('urn:ok:error:doc-not-found');
    expect(parsed.title).toContain('Document not found');
    expect(parsed.title).toContain('nonexistent-doc');

    expect(hocuspocus.documents.has('nonexistent-doc')).toBe(false);

    const ok = await callApi(dir, '/api/document?docName=real-doc', 'GET', {}, { hocuspocus });
    expect(ok.status).toBe(200);
    expect((JSON.parse(ok.body) as { docName: string }).docName).toBe('real-doc');
  });

  test('rename does NOT materialize a phantom file for an in-memory-only backlink source', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');
    writeFileSync(join(dir, 'journal.md'), '# Journal\n\nSee [[notes]].\n', 'utf-8');

    const backlinkIndex = await buildBacklinkIndex(dir);
    backlinkIndex.updateDocumentFromMarkdown('phantom-doc', '# Phantom\n\nSee [[notes]].\n');
    expect(
      backlinkIndex.getBacklinks('notes').some((entry) => entry.source === 'phantom-doc'),
    ).toBe(true);

    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('phantom-doc');
    const document = (conn as unknown as { document: Y.Doc }).document;
    document.transact(() => {
      document.getText('source').insert(0, '# Phantom\n\nSee [[notes]].\n');
    });

    try {
      const result = await callApi(
        dir,
        '/api/rename-path',
        'POST',
        {
          kind: 'file',
          fromPath: 'notes',
          toPath: 'renamed-notes',
        },
        { backlinkIndex, hocuspocus },
      );

      expect(result.status).toBe(200);

      expect(existsSync(join(dir, 'renamed-notes.md'))).toBe(true);
      expect(readFileSync(join(dir, 'journal.md'), 'utf-8')).toBe(
        '# Journal\n\nSee [[renamed-notes]].\n',
      );

      expect(existsSync(join(dir, 'phantom-doc.md'))).toBe(false);

      expect(
        backlinkIndex.getBacklinks('renamed-notes').some((entry) => entry.source === 'phantom-doc'),
      ).toBe(false);
    } finally {
      await conn.disconnect();
    }
  });

  test('cross-folder file move rewrites outbound links without duplicating content', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'artists'), { recursive: true });
    writeFileSync(join(dir, 'artists/picasso.md'), '# Picasso\n', 'utf-8');
    const sourceBody = [
      '# Some File',
      '',
      'See [Picasso](./picasso.md) and [[artists/picasso]].',
      '',
      'A second paragraph with [Other](./other.md).',
      '',
      '```md',
      '[Code link](./picasso.md) — should not rewrite',
      '```',
      '',
      'End of file.',
      '',
    ].join('\n');
    writeFileSync(join(dir, 'artists/some-file.md'), sourceBody, 'utf-8');

    const result = await callApi(dir, '/api/rename-path', 'POST', {
      kind: 'file',
      fromPath: 'artists/some-file',
      toPath: 'venues/some-file',
    });

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'artists/some-file.md'))).toBe(false);

    const destContent = readFileSync(join(dir, 'venues/some-file.md'), 'utf-8');
    const expectedDest = [
      '# Some File',
      '',
      'See [Picasso](../artists/picasso.md) and [[artists/picasso]].',
      '',
      'A second paragraph with [Other](../artists/other.md).',
      '',
      '```md',
      '[Code link](./picasso.md) — should not rewrite',
      '```',
      '',
      'End of file.',
      '',
    ].join('\n');
    expect(destContent).toBe(expectedDest);

    expect(destContent.length).toBe(expectedDest.length);
    expect(destContent.match(/# Some File/g)?.length).toBe(1);
    expect(destContent.match(/End of file\./g)?.length).toBe(1);
    expect(destContent.match(/A second paragraph/g)?.length).toBe(1);
  });

  test('cross-folder file move with frontmatter + image refs does not duplicate content', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs/photo.png'), 'fakebytes', 'utf-8');
    const sourceBody = [
      '---',
      'title: Meeting Notes',
      'date: 2026-04-30',
      '---',
      '',
      '# Meeting Notes',
      '',
      '![photo](./photo.png)',
      '',
      '[See agenda](./agenda.md)',
      '',
      'Closing paragraph.',
      '',
    ].join('\n');
    writeFileSync(join(dir, 'docs/meeting.md'), sourceBody, 'utf-8');

    const result = await callApi(dir, '/api/rename-path', 'POST', {
      kind: 'file',
      fromPath: 'docs/meeting',
      toPath: 'archive/2026/meeting',
    });

    expect(result.status).toBe(200);

    const destContent = readFileSync(join(dir, 'archive/2026/meeting.md'), 'utf-8');
    const expected = [
      '---',
      'title: Meeting Notes',
      'date: 2026-04-30',
      '---',
      '',
      '# Meeting Notes',
      '',
      '![photo](../../docs/photo.png)',
      '',
      '[See agenda](../../docs/agenda.md)',
      '',
      'Closing paragraph.',
      '',
    ].join('\n');
    expect(destContent).toBe(expected);
    expect(destContent.match(/# Meeting Notes/g)?.length).toBe(1);
    expect(destContent.match(/Closing paragraph\./g)?.length).toBe(1);
    expect(destContent.match(/title: Meeting Notes/g)?.length).toBe(1);
  });

  test('cross-folder file move with currently-loaded Y.Doc does not duplicate content', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'artists'), { recursive: true });
    writeFileSync(join(dir, 'artists/picasso.md'), '# Picasso\n', 'utf-8');
    const initialBody = [
      '# Some File',
      '',
      'See [Picasso](./picasso.md).',
      '',
      'Body content.',
      '',
    ].join('\n');
    writeFileSync(join(dir, 'artists/some-file.md'), initialBody, 'utf-8');

    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('artists/some-file');
    const document = (conn as unknown as { document: Y.Doc }).document;
    const ytext = document.getText('source');
    document.transact(() => {
      ytext.insert(0, initialBody);
    });

    try {
      const result = await callApi(
        dir,
        '/api/rename-path',
        'POST',
        {
          kind: 'file',
          fromPath: 'artists/some-file',
          toPath: 'venues/some-file',
        },
        {
          backlinkIndex: buildBacklinkIndex(dir),
          hocuspocus,
        },
      );

      expect(result.status).toBe(200);

      const destContent = readFileSync(join(dir, 'venues/some-file.md'), 'utf-8');
      const expected = [
        '# Some File',
        '',
        'See [Picasso](../artists/picasso.md).',
        '',
        'Body content.',
        '',
      ].join('\n');
      expect(destContent).toBe(expected);
      expect(destContent.match(/# Some File/g)?.length).toBe(1);
      expect(destContent.match(/Body content\./g)?.length).toBe(1);
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
      '/api/rename-path',
      'POST',
      {
        kind: 'file',
        fromPath: 'notes',
        toPath: 'renamed-notes',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(409);
    expect(readFileSync(join(dir, 'notes.md'), 'utf-8')).toBe('# Notes\n');
    expect(readFileSync(join(dir, 'renamed-notes.md'), 'utf-8')).toBe('# Existing\n');
    expect(readFileSync(join(dir, 'journal.md'), 'utf-8')).toBe('# Journal\n\nSee [[notes]].\n');

    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.type).toBe('urn:ok:error:doc-already-exists');
    expect(body.title).toContain('Destination already exists');
  });

  test('managed rename returns no-op success when source and destination match', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'file',
        fromPath: 'notes',
        toPath: 'notes',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(200);
    expect(readFileSync(join(dir, 'notes.md'), 'utf-8')).toBe('# Notes\n');
    expect(JSON.parse(result.body)).toEqual({
      renamed: [],
      rewrittenDocs: [],
    });
  });

  test('managed rename rejects reserved document names', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'file',
        fromPath: 'notes',
        toPath: '__system__',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(400);
    const reservedBody = JSON.parse(result.body) as Record<string, unknown>;
    expect(reservedBody.type).toBe('urn:ok:error:reserved-doc-name');
    expect(reservedBody.title).toContain('Reserved document names cannot be renamed');
  });

  test('managed rename with kind:folder on an existing file returns 400 (type mismatch)', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'folder',
        fromPath: 'notes.md',
        toPath: 'renamed-notes',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(400);
    {
      const parsed = JSON.parse(result.body) as Record<string, unknown>;
      expect(parsed.type).toBe('urn:ok:error:invalid-request');
      expect(parsed.title).toContain('Source path is not a folder');
    }
  });

  test('managed rename with kind:file on a .md-named directory returns 400 (type mismatch)', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'looks-like.md'));

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'file',
        fromPath: 'looks-like.md',
        toPath: 'renamed.md',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(400);
    {
      const parsed = JSON.parse(result.body) as Record<string, unknown>;
      expect(parsed.type).toBe('urn:ok:error:invalid-request');
      expect(parsed.title).toContain('Source path is not a file');
    }
  });

  test('managed rename rejects .ok as a destination (reserved directory)', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'project'));
    writeFileSync(join(dir, 'project', 'index.md'), '# Index\n', 'utf-8');

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'folder',
        fromPath: 'project',
        toPath: '.ok',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(400);
    {
      const parsed = JSON.parse(result.body) as Record<string, unknown>;
      expect(parsed.type).toBe('urn:ok:error:reserved-doc-name');
      expect(parsed.title).toContain('.ok is a reserved directory');
    }
  });

  test('managed rename rejects .ok subpath as a destination', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'notes.md'), '# Notes\n', 'utf-8');

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'file',
        fromPath: 'notes',
        toPath: '.ok/secret',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(400);
    {
      const parsed = JSON.parse(result.body) as Record<string, unknown>;
      expect(parsed.type).toBe('urn:ok:error:reserved-doc-name');
      expect(parsed.title).toContain('.ok is a reserved directory');
    }
  });

  test('managed rename returns 404 when the source document is missing', async () => {
    const dir = setupTmpDir();

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'file',
        fromPath: 'notes',
        toPath: 'renamed-notes',
      },
      { backlinkIndex: buildBacklinkIndex(dir) },
    );

    expect(result.status).toBe(404);
    const notFoundBody = JSON.parse(result.body) as Record<string, unknown>;
    expect(notFoundBody.type).toBe('urn:ok:error:doc-not-found');
    expect(typeof notFoundBody.title).toBe('string');
    expect(String(notFoundBody.title).toLowerCase()).toContain('does not exist');
  });

  test.skipIf(process.platform === 'win32')(
    'managed rename surfaces actionable symlink escape errors',
    async () => {
      const root = setupTmpDir();
      const contentDir = join(root, 'content');
      const outside = join(root, 'outside');
      mkdirSync(contentDir);
      mkdirSync(outside);
      symlinkSync(join('..', 'outside'), join(contentDir, 'evil'), 'dir');
      writeFileSync(join(contentDir, 'safe.md'), '# Safe\n', 'utf-8');

      const result = await callApi(
        contentDir,
        '/api/rename-path',
        'POST',
        {
          kind: 'file',
          fromPath: 'safe',
          toPath: 'evil/captured',
        },
        { backlinkIndex: buildBacklinkIndex(contentDir) },
      );

      expect(result.status).toBe(400);
      const symlinkBody = JSON.parse(result.body) as Record<string, unknown>;
      expect(symlinkBody.type).toBe('urn:ok:error:path-escape');
      expect(symlinkBody.title).toBe('symlink-escape: path resolves outside content directory.');
    },
  );

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
    expect(body.ok).toBeUndefined();
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
    expect(body.ok).toBeUndefined();
    expect(body.renamed).toEqual([
      { fromDocName: 'docs/index', toDocName: 'guides/index' },
      { fromDocName: 'docs/nested/page', toDocName: 'guides/nested/page' },
    ]);
  });

  test('folder rename updates the in-memory index before /api/pages reads it', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'docs/nested'), { recursive: true });
    writeFileSync(join(dir, 'docs/index.md'), '# Docs\n', 'utf-8');
    writeFileSync(join(dir, 'docs/nested/page.md'), '# Nested\n', 'utf-8');

    const fileIndex = new Map(buildFileIndex(dir));
    const signals: string[] = [];

    const renameResult = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'folder',
        fromPath: 'docs',
        toPath: 'guides',
      },
      {
        backlinkIndex: buildBacklinkIndex(dir),
        getFileIndex: () => fileIndex,
        signalChannel: (channel) => signals.push(channel),
      },
    );

    expect(renameResult.status).toBe(200);
    expect(fileIndex.has('docs/index')).toBe(false);
    expect(fileIndex.has('docs/nested/page')).toBe(false);
    expect(fileIndex.has('guides/index')).toBe(true);
    expect(fileIndex.has('guides/nested/page')).toBe(true);
    expect(signals).toEqual(expect.arrayContaining(['files', 'backlinks', 'graph']));

    const pagesResult = await callApi(
      dir,
      '/api/pages',
      'GET',
      {},
      {
        backlinkIndex: buildBacklinkIndex(dir),
        getFileIndex: () => fileIndex,
      },
    );

    expect(pagesResult.status).toBe(200);
    const body = JSON.parse(pagesResult.body) as {
      ok: boolean;
      pages: Array<{ docName: string; title: string }>;
    };
    expect(body.ok).toBeUndefined();
    expect(body.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ docName: 'guides/index', title: 'Docs' }),
        expect.objectContaining({ docName: 'guides/nested/page', title: 'Nested' }),
      ]),
    );
    expect(body.pages.map((page) => page.docName)).not.toContain('docs/index');
    expect(body.pages.map((page) => page.docName)).not.toContain('docs/nested/page');
  });

  test('folder rename uses git mv for tracked files', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'docs/nested'), { recursive: true });
    writeFileSync(join(dir, 'docs/index.md'), '# Docs\n', 'utf-8');
    writeFileSync(join(dir, 'docs/nested/page.md'), '# Nested\n', 'utf-8');

    const git = simpleGit(dir);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@example.com');
    await git.add('.');
    await git.commit('Initial');

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      {
        kind: 'folder',
        fromPath: 'docs',
        toPath: 'guides',
      },
      {
        backlinkIndex: buildBacklinkIndex(dir),
        projectDir: dir,
      },
    );

    expect(result.status).toBe(200);

    const status = await git.raw('status', '--short');
    expect(status).toContain('R  docs/index.md -> guides/index.md');
    expect(status).toContain('R  docs/nested/page.md -> guides/nested/page.md');
    expect(status).not.toContain(' D docs/index.md');
    expect(status).not.toContain('?? guides/');
  });

  test('file rename uses git mv for tracked files', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, 'old-name.md'), '# Doc\\n', 'utf-8');

    const git = simpleGit(dir);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@example.com');
    await git.add('.');
    await git.commit('Initial');

    const result = await callApi(
      dir,
      '/api/rename-path',
      'POST',
      { kind: 'file', fromPath: 'old-name', toPath: 'new-name' },
      { backlinkIndex: buildBacklinkIndex(dir), projectDir: dir },
    );

    expect(result.status).toBe(200);
    const status = await git.raw('status', '--short');
    expect(status).toContain('old-name.md -> new-name.md');
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
    expect(body.ok).toBeUndefined();
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
    expect(body.ok).toBeUndefined();
    expect(body.deletedDocNames).toEqual(['archive/index', 'archive/old/entry']);
  });

  test('creates an empty folder without materializing index.md', async () => {
    const dir = setupTmpDir();

    const result = await callApi(dir, '/api/create-folder', 'POST', {
      path: 'New Folder',
    });

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'New Folder'))).toBe(true);
    expect(existsSync(join(dir, 'New Folder/index.md'))).toBe(false);
    const body = JSON.parse(result.body) as { path: string };
    expect(body.path).toBe('New Folder');
    expect((body as Record<string, unknown>).ok).toBeUndefined();
  });

  test('indexes intermediate folders created recursively', async () => {
    const dir = setupTmpDir();
    const folderIndex = new Map<string, FolderIndexEntry>();
    const getFolderIndex = () => folderIndex;

    const result = await callApi(
      dir,
      '/api/create-folder',
      'POST',
      {
        path: 'a/b/c',
      },
      { getFolderIndex },
    );

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'a/b/c'))).toBe(true);

    const docsResult = await callApi(dir, '/api/documents', 'GET', undefined, { getFolderIndex });
    const body = JSON.parse(docsResult.body) as {
      ok: boolean;
      documents: Array<{ kind: string; path?: string }>;
    };
    const folderPaths = body.documents
      .filter((entry) => entry.kind === 'folder')
      .map((entry) => entry.path);
    expect(folderPaths).toEqual(expect.arrayContaining(['a', 'a/b', 'a/b/c']));
  });

  test('rejects create-folder without a path', async () => {
    const dir = setupTmpDir();

    const result = await callApi(dir, '/api/create-folder', 'POST', {});

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      type: 'urn:ok:error:invalid-request',
      status: 400,
    });
  });

  test('rejects create-folder traversal paths', async () => {
    const dir = setupTmpDir();

    const result = await callApi(dir, '/api/create-folder', 'POST', {
      path: '../outside',
    });

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      type: 'urn:ok:error:invalid-request',
      title: 'path must be a relative content path.',
      status: 400,
    });
  });

  test('rejects create-folder destinations inside .ok even without content filter', async () => {
    const dir = setupTmpDir();

    const result = await callApi(dir, '/api/create-folder', 'POST', {
      path: '.ok/local/cache',
    });

    expect(result.status).toBe(400);
    expect(existsSync(join(dir, '.ok/local/cache'))).toBe(false);
    expect(JSON.parse(result.body)).toMatchObject({
      type: 'urn:ok:error:reserved-doc-name',
      title: "'.ok' is a reserved directory.",
      status: 400,
    });
  });

  test('rejects create-folder requests with non-string summary', async () => {
    const dir = setupTmpDir();

    const result = await callApi(dir, '/api/create-folder', 'POST', {
      path: 'notes',
      summary: 42,
    });

    expect(result.status).toBe(400);
    expect(existsSync(join(dir, 'notes'))).toBe(false);
    expect(JSON.parse(result.body)).toMatchObject({
      type: 'urn:ok:error:invalid-request',
      status: 400,
    });
  });

  test('rejects create-folder destinations excluded by content config', async () => {
    const dir = setupTmpDir();
    writeFileSync(join(dir, '.okignore'), 'ignored/\n', 'utf-8');
    const contentFilter = createContentFilter({ projectDir: dir, contentDir: dir });

    const result = await callApi(
      dir,
      '/api/create-folder',
      'POST',
      {
        path: 'ignored/new',
      },
      { contentFilter },
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      type: 'urn:ok:error:invalid-request',
      title: 'Destination folder is excluded by the workspace content config.',
      status: 400,
    });
  });

  test('rejects create-folder collisions', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'existing'), { recursive: true });

    const result = await callApi(dir, '/api/create-folder', 'POST', {
      path: 'existing',
    });

    expect(result.status).toBe(409);
    expect(JSON.parse(result.body)).toMatchObject({
      type: 'urn:ok:error:doc-already-exists',
      title: 'Folder already exists.',
      status: 409,
    });
  });

  test('lists empty folders from /api/documents', async () => {
    const dir = setupTmpDir();
    const folderIndex = new Map<string, FolderIndexEntry>([
      [
        'empty',
        {
          size: 0,
          modified: '2026-01-01T00:00:00.000Z',
          canonicalPath: join(dir, 'empty'),
          inode: 1,
        },
      ],
    ]);

    const result = await callApi(dir, '/api/documents', 'GET', undefined, {
      getFolderIndex: () => folderIndex,
    });

    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      documents: Array<{ kind: string; path?: string }>;
    };
    expect((body as Record<string, unknown>).ok).toBeUndefined();
    expect(body.documents).toContainEqual(
      expect.objectContaining({ kind: 'folder', path: 'empty' }),
    );
  });

  test('renames an empty folder on disk', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'empty'), { recursive: true });

    const result = await callApi(dir, '/api/rename-path', 'POST', {
      kind: 'folder',
      fromPath: 'empty',
      toPath: 'renamed',
    });

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'empty'))).toBe(false);
    expect(existsSync(join(dir, 'renamed'))).toBe(true);
    const body = JSON.parse(result.body) as { renamed: unknown[] };
    expect((body as Record<string, unknown>).ok).toBeUndefined();
    expect(body.renamed).toEqual([]);
  });

  test('deletes an empty folder and reports no deleted docs', async () => {
    const dir = setupTmpDir();
    mkdirSync(join(dir, 'empty'), { recursive: true });

    const result = await callApi(dir, '/api/delete-path', 'POST', {
      kind: 'folder',
      path: 'empty',
    });

    expect(result.status).toBe(200);
    expect(existsSync(join(dir, 'empty'))).toBe(false);
    const body = JSON.parse(result.body) as { deletedDocNames: string[] };
    expect((body as Record<string, unknown>).ok).toBeUndefined();
    expect(body.deletedDocNames).toEqual([]);
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
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.type).toBe('urn:ok:error:invalid-request');
    expect(body.title).toContain('relative content paths');
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

      expect(result.status).toBe(400);
      expect(readFileSync(join(contentDir, 'safe.md'), 'utf-8')).toBe('# Safe\n');
      expect(existsSync(join(outside, 'captured.md'))).toBe(false);
    },
  );
});
