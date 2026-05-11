import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server as HttpServer, request as httpRequest } from 'node:http';
import {
  type AddressInfo,
  connect as createNetConnection,
  createServer as createNetServer,
} from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hocuspocus } from '@hocuspocus/server';
import {
  ASSET_EXTENSIONS,
  EXECUTABLE_BLOCKLIST_EXTENSIONS,
  INLINE_RENDERABLE_EXTENSIONS,
} from '@inkeep/open-knowledge-core';
import sirv from 'sirv';
import { createAssetServeMiddleware } from './asset-serve-middleware.ts';
import type { McpHttpHandler } from './mcp-http.ts';
import { type MountMcpAndApiHandle, mountMcpAndApi } from './mcp-mount.ts';

const log = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => log,
} as never;

const hocuspocus = {
  hooks: async () => {},
  handleConnection: () => ({
    handleMessage: () => {},
    handleClose: () => {},
  }),
} as unknown as Hocuspocus;

let servers: Array<{ httpServer: HttpServer; mount: MountMcpAndApiHandle }> = [];

async function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

async function startMountedServer(handler: McpHttpHandler): Promise<{ port: number }> {
  const httpServer = createServer();
  const mount = mountMcpAndApi({
    httpServer,
    hocuspocus,
    mcpHttpHandler: handler,
    log,
  });
  const port = await getFreePort();
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', () => resolve()));
  servers.push({ httpServer, mount });
  return { port };
}

async function postMcpWithHost(
  port: number,
  host: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: { Host: host, 'Content-Type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end('{}');
  });
}

async function requestUnknownUpgrade(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createNetConnection({ host: '127.0.0.1', port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timed out waiting for unknown upgrade socket to close'));
    }, 1000);

    socket.on('connect', () => {
      socket.write(
        [
          'GET /not-a-websocket-route HTTP/1.1',
          'Host: 127.0.0.1',
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Version: 13',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          '',
          '',
        ].join('\r\n'),
      );
    });
    socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
  });
}

afterEach(async () => {
  const active = servers;
  servers = [];
  await Promise.allSettled(
    active.map(async ({ httpServer, mount }) => {
      await mount.shutdown();
      await new Promise<void>((resolve) => mount.wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }),
  );
});

describe('mountMcpAndApi /mcp guard', () => {
  test('rejects non-loopback Origin before the MCP handler runs', async () => {
    let calls = 0;
    const { port } = await startMountedServer({
      handle: async (_req, res) => {
        calls += 1;
        res.writeHead(200);
        res.end('ok');
      },
      close: async () => {},
    });

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = (await res.json()) as { type?: string; title?: string; status?: number };
    expect(body.type).toBe('urn:ok:error:invalid-origin');
    expect(body.title).toBe('Origin not allowed.');
    expect(body.status).toBe(403);
    expect(calls).toBe(0);
  });

  test('rejects non-loopback Host before the MCP handler runs', async () => {
    let calls = 0;
    const { port } = await startMountedServer({
      handle: async (_req, res) => {
        calls += 1;
        res.writeHead(200);
        res.end('ok');
      },
      close: async () => {},
    });

    const res = await postMcpWithHost(port, 'evil.example');

    expect(res.status).toBe(403);
    const body = JSON.parse(res.body) as { type?: string; title?: string; status?: number };
    expect(body.type).toBe('urn:ok:error:host-not-allowed');
    expect(body.title).toBe('Host header not allowed.');
    expect(body.status).toBe(403);
    expect(calls).toBe(0);
  });

  test('answers allowed-origin MCP preflight with MCP headers', async () => {
    let calls = 0;
    const { port } = await startMountedServer({
      handle: async (_req, res) => {
        calls += 1;
        res.writeHead(200);
        res.end('ok');
      },
      close: async () => {},
    });

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-headers')).toContain('mcp-session-id');
    expect(calls).toBe(0);
  });

  test('closes unrecognized WebSocket upgrade paths', async () => {
    let calls = 0;
    const { port } = await startMountedServer({
      handle: async (_req, res) => {
        calls += 1;
        res.writeHead(200);
        res.end('ok');
      },
      close: async () => {},
    });

    const response = await requestUnknownUpgrade(port);

    expect(response).toBe('');
    expect(calls).toBe(0);
  });
});

describe('mountMcpAndApi content-asset middleware', () => {
  const tmpDirs: string[] = [];

  function makeContentDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ok-mcp-mount-assets-'));
    tmpDirs.push(dir);
    return dir;
  }

  async function startWithAssets(contentDir: string): Promise<{ port: number }> {
    const httpServer = createServer();
    const filter = {
      isExcluded: (rel: string) => rel.startsWith('.ok/') || rel === 'excluded.png',
    };
    const mount = mountMcpAndApi({
      httpServer,
      hocuspocus,
      log,
      contentAssetMiddleware: createAssetServeMiddleware({
        contentFilter: filter,
        contentSirv: sirv(contentDir, { dev: true, dotfiles: false }),
        inlineExtensions: INLINE_RENDERABLE_EXTENSIONS,
        assetExtensions: ASSET_EXTENSIONS,
        blocklistExtensions: EXECUTABLE_BLOCKLIST_EXTENSIONS,
      }),
    });
    const port = await getFreePort();
    await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', () => resolve()));
    servers.push({ httpServer, mount });
    return { port };
  }

  test('serves a content asset with inline disposition + nosniff', async () => {
    const contentDir = makeContentDir();
    mkdirSync(join(contentDir, 'assets'));
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic
    writeFileSync(join(contentDir, 'assets', 'x.png'), bytes);
    const { port } = await startWithAssets(contentDir);

    const res = await fetch(`http://127.0.0.1:${port}/assets/x.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const got = Buffer.from(await res.arrayBuffer());
    expect(got.equals(bytes)).toBe(true);
  });

  test('content-filter-excluded path falls through to the problem+json 404', async () => {
    const contentDir = makeContentDir();
    mkdirSync(join(contentDir, 'assets'));
    writeFileSync(join(contentDir, 'excluded.png'), Buffer.from([0]));
    const { port } = await startWithAssets(contentDir);

    const res = await fetch(`http://127.0.0.1:${port}/excluded.png`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = (await res.json()) as { type?: string };
    expect(body.type).toBe('urn:ok:error:not-found');
  });

  test('asset-extension miss returns a bare 404 from the middleware, not the catch-all', async () => {
    const contentDir = makeContentDir();
    const { port } = await startWithAssets(contentDir);

    const res = await fetch(`http://127.0.0.1:${port}/missing.png`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-type')).not.toBe('application/problem+json');
    expect(await res.text()).toBe('');
  });

  test('synchronous throw from middleware returns a 500 problem+json (no hang)', async () => {
    const httpServer = createServer();
    const mount = mountMcpAndApi({
      httpServer,
      hocuspocus,
      log,
      contentAssetMiddleware: () => {
        throw new Error('simulated EMFILE');
      },
    });
    const port = await getFreePort();
    await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', () => resolve()));
    servers.push({ httpServer, mount });

    const res = await fetch(`http://127.0.0.1:${port}/assets/x.png`);
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = (await res.json()) as { type?: string; status?: number };
    expect(body.type).toBe('urn:ok:error:internal-server-error');
    expect(body.status).toBe(500);
  });

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
