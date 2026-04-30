import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApiExtension } from './api-extension.ts';
import { BacklinkIndex } from './backlink-index.ts';
import type { FileIndexEntry } from './file-watcher.ts';

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function makeReq(url: string, method = 'GET'): IncomingMessage {
  const readable = Readable.from(Buffer.from('')) as unknown as IncomingMessage;
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

async function callRoute(
  contentDir: string,
  url: string,
  fileIndex: ReadonlyMap<string, FileIndexEntry>,
  backlinkIndex?: BacklinkIndex,
  options?: { method?: string; enableTestRoutes?: boolean },
): Promise<CapturedResponse> {
  const ext = createApiExtension({
    hocuspocus: {} as never,
    sessionManager: {} as never,
    contentDir,
    getFileIndex: () => fileIndex,
    backlinkIndex,
    enableTestRoutes: options?.enableTestRoutes,
  });
  const req = makeReq(url, options?.method ?? 'GET');
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

describe('graph endpoints', () => {
  test('serve backlinks, forward links, mode-based orphans, and hubs', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-graph-api-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      writeFileSync(
        join(contentDir, 'alpha.md'),
        '# Alpha\n\nLinks to [[beta#install]].\n',
        'utf-8',
      );
      writeFileSync(join(contentDir, 'beta.md'), '# Beta\n\nBody.\n', 'utf-8');
      writeFileSync(join(contentDir, 'gamma.md'), '# Gamma\n\nNo links.\n', 'utf-8');

      const fileIndex = new Map<string, FileIndexEntry>([
        [
          'alpha',
          {
            size: 10,
            modified: new Date(0).toISOString(),
            canonicalPath: '',
            inode: 0,
            aliases: [],
          },
        ],
        [
          'beta',
          {
            size: 10,
            modified: new Date(0).toISOString(),
            canonicalPath: '',
            inode: 0,
            aliases: [],
          },
        ],
        [
          'gamma',
          {
            size: 10,
            modified: new Date(0).toISOString(),
            canonicalPath: '',
            inode: 0,
            aliases: [],
          },
        ],
      ]);
      const backlinkIndex = new BacklinkIndex({ projectDir, contentDir });
      backlinkIndex.rebuildFromDisk();

      const backlinks = JSON.parse(
        (await callRoute(contentDir, '/api/backlinks?docName=beta', fileIndex, backlinkIndex)).body,
      ) as {
        backlinks: Array<{
          source: string;
          anchor: string | null;
          title: string;
          snippet: string | null;
        }>;
      };
      expect(backlinks.backlinks).toEqual([
        {
          source: 'alpha',
          anchor: 'install',
          title: 'Alpha',
          snippet: 'Links to beta#install.',
        },
      ]);

      // Bulk backlink-count lookup for slim enrichment (exec ls/grep/find).
      const counts = JSON.parse(
        (
          await callRoute(
            contentDir,
            '/api/backlink-counts?docNames=alpha,beta,gamma,unknown',
            fileIndex,
            backlinkIndex,
          )
        ).body,
      ) as { counts: Record<string, number> };
      expect(counts.counts).toEqual({ alpha: 0, beta: 1, gamma: 0, unknown: 0 });

      const countsMissing = JSON.parse(
        (await callRoute(contentDir, '/api/backlink-counts', fileIndex, backlinkIndex)).body,
      ) as { type: string; title: string };
      expect(countsMissing.type).toBe('urn:ok:error:invalid-request');
      expect(countsMissing.title).toContain('Missing docNames');

      const forward = JSON.parse(
        (await callRoute(contentDir, '/api/forward-links?docName=alpha', fileIndex, backlinkIndex))
          .body,
      ) as {
        forwardLinks: Array<{
          kind: 'doc';
          docName: string;
          anchor: string | null;
          title: string;
          snippet: string | null;
        }>;
      };
      expect(forward.forwardLinks).toEqual([
        {
          kind: 'doc',
          docName: 'beta',
          anchor: 'install',
          title: 'Beta',
          snippet: 'Links to beta#install.',
        },
      ]);

      const orphans = JSON.parse(
        (await callRoute(contentDir, '/api/orphans', fileIndex, backlinkIndex)).body,
      ) as { orphans: Array<{ docName: string }> };
      expect(orphans.orphans.map((entry) => entry.docName)).toEqual(['gamma']);

      const incomingOrphans = JSON.parse(
        (await callRoute(contentDir, '/api/orphans?mode=incoming', fileIndex, backlinkIndex)).body,
      ) as { orphans: Array<{ docName: string }> };
      expect(incomingOrphans.orphans.map((entry) => entry.docName)).toEqual(['alpha', 'gamma']);

      const outgoingOrphans = JSON.parse(
        (await callRoute(contentDir, '/api/orphans?mode=outgoing', fileIndex, backlinkIndex)).body,
      ) as { orphans: Array<{ docName: string }> };
      expect(outgoingOrphans.orphans.map((entry) => entry.docName)).toEqual(['beta', 'gamma']);

      const hubs = JSON.parse(
        (await callRoute(contentDir, '/api/hubs?limit=1', fileIndex, backlinkIndex)).body,
      ) as { hubs: Array<{ docName: string; title: string; count: number }> };
      expect(hubs.hubs).toEqual([{ docName: 'beta', title: 'Beta', count: 1 }]);

      const hubsNegativeLimit = JSON.parse(
        (await callRoute(contentDir, '/api/hubs?limit=-3', fileIndex, backlinkIndex)).body,
      ) as { hubs: Array<{ docName: string; title: string; count: number }> };
      const hubsDefault = JSON.parse(
        (await callRoute(contentDir, '/api/hubs', fileIndex, backlinkIndex)).body,
      ) as { hubs: Array<{ docName: string; title: string; count: number }> };
      expect(hubsNegativeLimit.hubs).toEqual(hubsDefault.hubs);

      const linkGraph = JSON.parse(
        (await callRoute(contentDir, '/api/link-graph', fileIndex, backlinkIndex)).body,
      ) as {
        nodes: Array<{ id: string; label: string; anchor: string | null }>;
        links: Array<{ source: string; target: string }>;
      };

      // Every scanned doc gets a forward entry (possibly empty), so nodes include pages
      // with no outbound wikilinks (e.g. gamma) as well as edge endpoints.
      expect(linkGraph.nodes.map((n) => n.id).sort()).toEqual(['alpha', 'beta', 'gamma']);
      expect(linkGraph.nodes.find((n) => n.id === 'alpha')?.label).toBe('Alpha');
      expect(linkGraph.nodes.find((n) => n.id === 'beta')?.label).toBe('Beta');
      expect(linkGraph.nodes.find((n) => n.id === 'beta')?.anchor).toBe('install');
      expect(linkGraph.links).toContainEqual({ source: 'alpha', target: 'beta' });
      expect(linkGraph.links).toHaveLength(1);

      const oneHopGraph = JSON.parse(
        (
          await callRoute(
            contentDir,
            '/api/link-graph?docName=beta&degrees=1',
            fileIndex,
            backlinkIndex,
          )
        ).body,
      ) as {
        nodes: Array<{ id: string; label: string }>;
        links: Array<{ source: string; target: string }>;
      };

      expect(oneHopGraph.nodes.map((n) => n.id).sort()).toEqual(['alpha', 'beta']);
      expect(oneHopGraph.links).toEqual([{ source: 'alpha', target: 'beta' }]);

      const missingDocName = await callRoute(
        contentDir,
        '/api/link-graph?degrees=1',
        fileIndex,
        backlinkIndex,
      );
      expect(missingDocName.status).toBe(400);
      const missingDocNameBody = JSON.parse(missingDocName.body) as { type: string; title: string };
      expect(missingDocNameBody.type).toBe('urn:ok:error:invalid-request');
      expect(missingDocNameBody.title).toContain('docName is required');

      const invalidDegrees = await callRoute(
        contentDir,
        '/api/link-graph?docName=beta&degrees=-1',
        fileIndex,
        backlinkIndex,
      );
      expect(invalidDegrees.status).toBe(400);
      const invalidDegreesBody = JSON.parse(invalidDegrees.body) as { type: string; title: string };
      expect(invalidDegreesBody.type).toBe('urn:ok:error:invalid-request');
      expect(invalidDegreesBody.title).toContain('degrees must be');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('serve dead links globally and with source-doc scoping', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-dead-links-api-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      writeFileSync(
        join(contentDir, 'alpha.md'),
        '# Alpha\n\nSee [[missing-target]].\nAlso [missing markdown](./missing-markdown.md).\nSee [[existing]].\n',
        'utf-8',
      );
      writeFileSync(join(contentDir, 'beta.md'), '# Beta\n\nSee [[missing-target]].\n', 'utf-8');
      writeFileSync(join(contentDir, 'gamma.md'), '# Gamma\n\nSee [[other-missing]].\n', 'utf-8');
      writeFileSync(join(contentDir, 'existing.md'), '# Existing\n\nBody.\n', 'utf-8');

      const fileIndex = new Map<string, FileIndexEntry>([
        [
          'alpha',
          {
            size: 10,
            modified: new Date(0).toISOString(),
            canonicalPath: '',
            inode: 0,
            aliases: [],
          },
        ],
        [
          'beta',
          {
            size: 10,
            modified: new Date(0).toISOString(),
            canonicalPath: '',
            inode: 0,
            aliases: [],
          },
        ],
        [
          'gamma',
          {
            size: 10,
            modified: new Date(0).toISOString(),
            canonicalPath: '',
            inode: 0,
            aliases: [],
          },
        ],
        [
          'existing',
          {
            size: 10,
            modified: new Date(0).toISOString(),
            canonicalPath: '',
            inode: 0,
            aliases: [],
          },
        ],
      ]);
      const backlinkIndex = new BacklinkIndex({ projectDir, contentDir });
      backlinkIndex.rebuildFromDisk();

      const globalResponse = await callRoute(
        contentDir,
        '/api/dead-links',
        fileIndex,
        backlinkIndex,
      );
      expect(globalResponse.status).toBe(200);
      const globalBody = JSON.parse(globalResponse.body) as {
        deadLinks: Array<{
          target: string;
          sources: Array<{ source: string; title: string; snippet: string | null }>;
        }>;
      };
      expect(globalBody.deadLinks).toEqual([
        {
          target: 'missing-target',
          sources: [
            { source: 'alpha', title: 'Alpha', snippet: 'See missing-target.' },
            { source: 'beta', title: 'Beta', snippet: 'See missing-target.' },
          ],
        },
        {
          target: 'missing-markdown',
          sources: [{ source: 'alpha', title: 'Alpha', snippet: 'Also missing markdown.' }],
        },
        {
          target: 'other-missing',
          sources: [{ source: 'gamma', title: 'Gamma', snippet: 'See other-missing.' }],
        },
      ]);

      const scopedResponse = await callRoute(
        contentDir,
        '/api/dead-links?sourceDocName=alpha&sourceDocName=beta',
        fileIndex,
        backlinkIndex,
      );
      expect(scopedResponse.status).toBe(200);
      const scopedBody = JSON.parse(scopedResponse.body) as {
        deadLinks: Array<{
          target: string;
          sources: Array<{ source: string; title: string; snippet: string | null }>;
        }>;
      };
      expect(scopedBody.deadLinks).toEqual([
        {
          target: 'missing-target',
          sources: [
            { source: 'alpha', title: 'Alpha', snippet: 'See missing-target.' },
            { source: 'beta', title: 'Beta', snippet: 'See missing-target.' },
          ],
        },
        {
          target: 'missing-markdown',
          sources: [{ source: 'alpha', title: 'Alpha', snippet: 'Also missing markdown.' }],
        },
      ]);

      const emptyResponse = await callRoute(
        contentDir,
        '/api/dead-links?sourceDocName=missing-source',
        fileIndex,
        backlinkIndex,
      );
      expect(emptyResponse.status).toBe(200);
      expect(JSON.parse(emptyResponse.body)).toEqual({ deadLinks: [] });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('returns 503 when the backlink index is unavailable', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-dead-links-unavailable-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const fileIndex = new Map<string, FileIndexEntry>();
      const response = await callRoute(contentDir, '/api/dead-links', fileIndex);
      expect(response.status).toBe(503);
      const body = JSON.parse(response.body) as { type: string; title: string; status: number };
      expect(body.type).toBe('urn:ok:error:backlink-index-not-configured');
      expect(body.status).toBe(503);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('reject invalid orphan mode query values', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-graph-api-invalid-mode-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      writeFileSync(join(contentDir, 'alpha.md'), '# Alpha\n', 'utf-8');

      const fileIndex = new Map<string, FileIndexEntry>([
        ['alpha', { size: 10, modified: new Date(0).toISOString() }],
      ]);
      const backlinkIndex = new BacklinkIndex({ projectDir, contentDir });
      backlinkIndex.rebuildFromDisk();

      const response = await callRoute(
        contentDir,
        '/api/orphans?mode=sideways',
        fileIndex,
        backlinkIndex,
      );

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body) as { type: string; title: string };
      expect(body.type).toBe('urn:ok:error:invalid-request');
      expect(body.title).toContain('Invalid orphan mode');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe('POST /api/test-rescan-backlinks', () => {
  test('rebuilds the backlink index from disk when enableTestRoutes=true', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-rescan-api-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      // Simulate the "dropped create event" case: files are on disk but the
      // backlink index hasn't observed them yet (no rebuildFromDisk / no
      // file-watcher dispatch).
      writeFileSync(join(contentDir, 'alpha.md'), '# Alpha\n\nLinks to [[beta]].\n', 'utf-8');
      writeFileSync(join(contentDir, 'beta.md'), '# Beta\n\nBody.\n', 'utf-8');

      const fileIndex = new Map<string, FileIndexEntry>();
      const backlinkIndex = new BacklinkIndex({ projectDir, contentDir });
      // Intentionally do NOT call rebuildFromDisk — mirrors the dropped-event state.
      expect(backlinkIndex.getBacklinks('beta')).toEqual([]);

      const rescanResp = await callRoute(
        contentDir,
        '/api/test-rescan-backlinks',
        fileIndex,
        backlinkIndex,
        {
          method: 'POST',
          enableTestRoutes: true,
        },
      );
      expect(rescanResp.status).toBe(200);
      expect(JSON.parse(rescanResp.body)).toEqual({});

      // Backlink index now reflects disk state.
      const backlinks = backlinkIndex.getBacklinks('beta');
      expect(backlinks.map((b) => b.source)).toEqual(['alpha']);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('returns 404 when enableTestRoutes is not set (default)', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-rescan-gate-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      const fileIndex = new Map<string, FileIndexEntry>();
      const backlinkIndex = new BacklinkIndex({ projectDir, contentDir });

      const resp = await callRoute(
        contentDir,
        '/api/test-rescan-backlinks',
        fileIndex,
        backlinkIndex,
        {
          method: 'POST',
        },
      );
      // Unregistered route → falls through past the onRequest handler → captured
      // status remains 0 since writeHead was never called on the mock.
      expect(resp.status).toBe(0);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('405s on non-POST methods', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-rescan-method-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      const fileIndex = new Map<string, FileIndexEntry>();
      const backlinkIndex = new BacklinkIndex({ projectDir, contentDir });

      const resp = await callRoute(
        contentDir,
        '/api/test-rescan-backlinks',
        fileIndex,
        backlinkIndex,
        {
          method: 'GET',
          enableTestRoutes: true,
        },
      );
      expect(resp.status).toBe(405);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
