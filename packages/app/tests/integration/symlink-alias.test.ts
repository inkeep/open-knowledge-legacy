import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { createServer } from '@inkeep/open-knowledge-server';
import { WebSocketServer } from 'ws';
import { agentPatch, agentWriteMd, type TestServer } from './test-harness';

let server: TestServer;

async function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-symlink-test-')));
  writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
  writeFileSync(join(contentDir, 'target.md'), '# Target\n', 'utf-8');
  symlinkSync('target.md', join(contentDir, 'foo.md'));

  const port = await getFreePort();
  const srv = createServer({
    contentDir,
    quiet: true,
    debounce: 200,
    maxDebounce: 1000,
    gitEnabled: false,
    enableTestRoutes: true,
  });
  await srv.ready;

  const httpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url?.startsWith('/api/')) {
      srv.hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
        if (!res.writableEnded) {
          res.writeHead(500);
          res.end('Internal server error');
        }
      });
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/collab')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        const clientConnection = srv.hocuspocus.handleConnection(
          ws as unknown as WebSocket,
          req as unknown as Request,
        );
        ws.on('message', (data: ArrayBuffer | Buffer) => {
          clientConnection.handleMessage(
            data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data),
          );
        });
        ws.on('close', (code: number, reason: Buffer) => {
          clientConnection.handleClose({ code, reason: reason.toString() });
        });
        ws.on('error', () => ws.terminate());
      });
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, () => resolve()));

  server = {
    port,
    contentDir,
    cleanup: async () => {
      await srv.destroy();
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      rmSync(contentDir, { recursive: true, force: true });
    },
  };
});

afterAll(async () => {
  await server.cleanup();
});


describe('QA-009: /api/documents symlink metadata', () => {
  test('returns canonical entry with isSymlink=false and alias entry with correct metadata', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/documents`);
    const body = (await res.json()) as {
      ok: boolean;
      documents: Array<{
        docName: string;
        size: number;
        modified: string;
        isSymlink: boolean;
        canonicalDocName: string | null;
        targetPath: string | null;
      }>;
    };
    expect(body.ok).toBe(true);

    const target = body.documents.find((d) => d.docName === 'target');
    const foo = body.documents.find((d) => d.docName === 'foo');

    expect(target).toBeDefined();
    expect(target?.isSymlink).toBe(false);
    expect(target?.canonicalDocName).toBeNull();
    expect(target?.targetPath).toBeNull();
    expect(typeof target?.size).toBe('number');
    expect(typeof target?.modified).toBe('string');

    expect(foo).toBeDefined();
    expect(foo?.isSymlink).toBe(true);
    expect(foo?.canonicalDocName).toBe('target');
    expect(foo?.targetPath).toBe('target.md');
    expect(foo?.size).toBe(target?.size);
  });
});


describe('QA-010: document read via alias', () => {
  test('reading via alias returns same content as reading via canonical', async () => {
    await agentWriteMd(server.port, '# Canonical Content', {
      docName: 'target',
      position: 'replace',
    });
    await wait(300);

    const [viaCan, viaAlias] = await Promise.all([
      fetch(`http://localhost:${server.port}/api/document?docName=target`).then(
        (r) => r.json() as Promise<{ ok: boolean; content: string }>,
      ),
      fetch(`http://localhost:${server.port}/api/document?docName=foo`).then(
        (r) => r.json() as Promise<{ ok: boolean; content: string }>,
      ),
    ]);

    expect(viaCan.ok).toBe(true);
    expect(viaAlias.ok).toBe(true);
    expect(viaAlias.content).toBe(viaCan.content);
    expect(viaCan.content).toContain('Canonical Content');
  });
});


describe('QA-012: agent-write-md via alias', () => {
  test('writing via alias docName modifies canonical document', async () => {
    await agentWriteMd(server.port, '# Via Alias', { docName: 'foo', position: 'replace' });
    await wait(300);

    const res = await fetch(`http://localhost:${server.port}/api/document?docName=target`);
    const body = (await res.json()) as { ok: boolean; content: string };
    expect(body.ok).toBe(true);
    expect(body.content).toContain('Via Alias');

    const aliasRes = await fetch(`http://localhost:${server.port}/api/document?docName=foo`);
    const aliasBody = (await aliasRes.json()) as { ok: boolean; content: string };
    expect(aliasBody.content).toBe(body.content);
  });
});


describe('QA-011: agent-write via alias', () => {
  test('raw agent-write with alias docName modifies canonical Y.Doc', async () => {
    const writeRes = await fetch(`http://localhost:${server.port}/api/agent-write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docName: 'foo', content: 'agent raw write content' }),
    });
    expect(writeRes.ok).toBe(true);
    await wait(300);

    const readRes = await fetch(`http://localhost:${server.port}/api/document?docName=target`);
    const body = (await readRes.json()) as { ok: boolean; content: string };
    expect(body.ok).toBe(true);
    expect(body.content).toContain('agent raw write content');
  });
});


describe('QA-013: agent-patch via alias', () => {
  test('patch via alias docName operates on canonical Y.Doc', async () => {
    await agentWriteMd(server.port, '# Patchable Content\n\nold text here', {
      docName: 'target',
      position: 'replace',
    });
    await wait(300);

    const result = await agentPatch(server.port, 'old text here', 'new text here', 'foo');
    expect(result.ok).toBe(true);
    await wait(300);

    const readRes = await fetch(`http://localhost:${server.port}/api/document?docName=target`);
    const body = (await readRes.json()) as { ok: boolean; content: string };
    expect(body.content).toContain('new text here');
    expect(body.content).not.toContain('old text here');
  });
});



describe('QA-002: alias and canonical API reads resolve to same Y.Doc content', () => {
  test('agent-write via alias is readable via canonical (shared content)', async () => {
    await agentWriteMd(server.port, '# Shared Content', { docName: 'foo', position: 'replace' });
    await wait(300);

    const [viaCan, viaAlias] = await Promise.all([
      fetch(`http://localhost:${server.port}/api/document?docName=target`).then(
        (r) => r.json() as Promise<{ ok: boolean; content: string }>,
      ),
      fetch(`http://localhost:${server.port}/api/document?docName=foo`).then(
        (r) => r.json() as Promise<{ ok: boolean; content: string }>,
      ),
    ]);

    expect(viaCan.content).toBe(viaAlias.content);
    expect(viaCan.content).toContain('Shared Content');
  });

  test('agent-write via canonical is readable via alias', async () => {
    await agentWriteMd(server.port, '# From Canonical', { docName: 'target', position: 'replace' });
    await wait(300);

    const viaAlias = await fetch(`http://localhost:${server.port}/api/document?docName=foo`).then(
      (r) => r.json() as Promise<{ ok: boolean; content: string }>,
    );
    expect(viaAlias.content).toContain('From Canonical');
  });
});


describe('QA-005: persistence preserves symlink', () => {
  test('after CRDT edit persists, symlink remains intact and target has new content', async () => {
    await agentWriteMd(server.port, '# Persisted via Symlink', {
      docName: 'foo',
      position: 'replace',
    });
    await wait(1000);

    const stat = lstatSync(join(server.contentDir, 'foo.md'));
    expect(stat.isSymbolicLink()).toBe(true);

    const targetContent = readFileSync(join(server.contentDir, 'target.md'), 'utf-8');
    expect(targetContent).toContain('Persisted via Symlink');

    const fooContent = readFileSync(join(server.contentDir, 'foo.md'), 'utf-8');
    expect(fooContent).toBe(targetContent);
  });
});


describe('QA-015: self-write detection after symlink resolution', () => {
  test('persistence write does not trigger echo loop via watcher', async () => {
    await agentWriteMd(server.port, '# No Echo', { docName: 'foo', position: 'replace' });
    await wait(1000);

    const res1 = await fetch(`http://localhost:${server.port}/api/document?docName=target`);
    const body1 = (await res1.json()) as { ok: boolean; content: string };

    await wait(1500);

    const res2 = await fetch(`http://localhost:${server.port}/api/document?docName=target`);
    const body2 = (await res2.json()) as { ok: boolean; content: string };
    expect(body2.content).toBe(body1.content);
  });
});
