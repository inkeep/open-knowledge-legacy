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
  backlinkIndex: BacklinkIndex,
): Promise<CapturedResponse> {
  const ext = createApiExtension({
    hocuspocus: {} as never,
    sessionManager: {} as never,
    contentDir,
    getFileIndex: () => fileIndex,
    backlinkIndex,
  });
  const req = makeReq(url);
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

describe('graph endpoints', () => {
  test('serve backlinks, forward links, orphans, and hubs', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-graph-api-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      writeFileSync(join(contentDir, 'alpha.md'), '# Alpha\n\nLinks to [[beta]].\n', 'utf-8');
      writeFileSync(join(contentDir, 'beta.md'), '# Beta\n\nBody.\n', 'utf-8');
      writeFileSync(join(contentDir, 'gamma.md'), '# Gamma\n\nNo links.\n', 'utf-8');

      const fileIndex = new Map<string, FileIndexEntry>([
        ['alpha', { size: 10, modified: new Date(0).toISOString() }],
        ['beta', { size: 10, modified: new Date(0).toISOString() }],
        ['gamma', { size: 10, modified: new Date(0).toISOString() }],
      ]);
      const backlinkIndex = new BacklinkIndex({ projectDir, contentDir });
      backlinkIndex.rebuildFromDisk();

      const backlinks = JSON.parse(
        (await callRoute(contentDir, '/api/backlinks?docName=beta', fileIndex, backlinkIndex)).body,
      ) as { backlinks: Array<{ source: string; title: string; snippet: string | null }> };
      expect(backlinks.backlinks).toEqual([
        {
          source: 'alpha',
          title: 'Alpha',
          snippet: 'Links to beta.',
        },
      ]);

      const forward = JSON.parse(
        (await callRoute(contentDir, '/api/forward-links?docName=alpha', fileIndex, backlinkIndex))
          .body,
      ) as { links: string[] };
      expect(forward.links).toEqual(['beta']);

      const orphans = JSON.parse(
        (await callRoute(contentDir, '/api/orphans', fileIndex, backlinkIndex)).body,
      ) as { orphans: Array<{ docName: string }> };
      expect(orphans.orphans.map((entry) => entry.docName)).toEqual(['alpha', 'gamma']);

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
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
