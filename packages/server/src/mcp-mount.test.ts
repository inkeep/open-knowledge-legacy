import { afterEach, describe, expect, test } from 'bun:test';
import { createServer, type Server as HttpServer, request as httpRequest } from 'node:http';
import {
  type AddressInfo,
  connect as createNetConnection,
  createServer as createNetServer,
} from 'node:net';
import type { Hocuspocus } from '@hocuspocus/server';
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
    expect(await res.json()).toEqual({ ok: false, error: 'origin-not-allowed' });
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
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'host-header-not-allowed' });
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
