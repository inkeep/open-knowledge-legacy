import { afterEach, describe, expect, test } from 'bun:test';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { type ProxyServerHandle, startProxyServer } from './ui-proxy.ts';

type UpstreamHandle = { httpServer: HttpServer; port: number; close: () => Promise<void> };

async function startUpstream(
  handler: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => void,
): Promise<UpstreamHandle> {
  const server = createHttpServer(handler);
  await new Promise<void>((done, fail) => {
    const onError = (err: Error) => fail(err);
    server.once('error', onError);
    server.listen(0, 'localhost', () => {
      server.off('error', onError);
      done();
    });
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  return {
    httpServer: server,
    port,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

let proxy: ProxyServerHandle | null = null;
let upstream: UpstreamHandle | null = null;

afterEach(async () => {
  if (proxy) {
    await proxy.close();
    proxy = null;
  }
  if (upstream) {
    await upstream.close();
    upstream = null;
  }
});

describe('startProxyServer', () => {
  test('forwards GET and preserves status + body', async () => {
    upstream = await startUpstream((req, res) => {
      expect(req.method).toBe('GET');
      expect(req.url).toBe('/hello');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello world');
    });

    proxy = await startProxyServer({
      listenPort: 0,
      host: 'localhost',
      upstreamHost: 'localhost',
      upstreamPort: upstream.port,
    });

    const response = await fetch(`http://localhost:${proxy.port}/hello`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello world');
    expect(response.headers.get('content-type')).toContain('text/plain');
  });

  test('forwards POST with body bytes intact', async () => {
    const payload = 'x'.repeat(64 * 1024); // 64 KiB to shake out stream handling
    upstream = await startUpstream(async (req, res) => {
      expect(req.method).toBe('POST');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const got = Buffer.concat(chunks).toString('utf-8');
      expect(got).toBe(payload);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: got.length }));
    });

    proxy = await startProxyServer({
      listenPort: 0,
      host: 'localhost',
      upstreamHost: 'localhost',
      upstreamPort: upstream.port,
    });

    const response = await fetch(`http://localhost:${proxy.port}/echo`, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { received: number };
    expect(body.received).toBe(payload.length);
  });

  test('preserves upstream 404 + headers', async () => {
    upstream = await startUpstream((_req, res) => {
      res.writeHead(404, { 'X-Custom': 'not-found', 'Content-Type': 'text/plain' });
      res.end('nope');
    });

    proxy = await startProxyServer({
      listenPort: 0,
      host: 'localhost',
      upstreamHost: 'localhost',
      upstreamPort: upstream.port,
    });

    const response = await fetch(`http://localhost:${proxy.port}/missing`);
    expect(response.status).toBe(404);
    expect(response.headers.get('x-custom')).toBe('not-found');
    expect(await response.text()).toBe('nope');
  });

  test('HEAD returns status + headers without body', async () => {
    upstream = await startUpstream((req, res) => {
      expect(req.method).toBe('HEAD');
      res.writeHead(200, { 'X-Meta': 'yes' });
      res.end();
    });

    proxy = await startProxyServer({
      listenPort: 0,
      host: 'localhost',
      upstreamHost: 'localhost',
      upstreamPort: upstream.port,
    });

    const response = await fetch(`http://localhost:${proxy.port}/head`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-meta')).toBe('yes');
    expect(await response.text()).toBe('');
  });

  test('returns 502 when upstream refuses connection', async () => {
    // Pick a port unlikely to be bound: start + immediately stop an upstream
    // so we know the port is free but nobody listens anymore.
    upstream = await startUpstream((_req, res) => res.end('ignored'));
    const deadPort = upstream.port;
    await upstream.close();
    upstream = null;

    proxy = await startProxyServer({
      listenPort: 0,
      host: 'localhost',
      upstreamHost: 'localhost',
      upstreamPort: deadPort,
    });

    const response = await fetch(`http://localhost:${proxy.port}/whatever`);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('Bad Gateway');
  });

  test('close() shuts down the listener', async () => {
    upstream = await startUpstream((_req, res) => res.end('ok'));
    proxy = await startProxyServer({
      listenPort: 0,
      host: 'localhost',
      upstreamHost: 'localhost',
      upstreamPort: upstream.port,
    });
    const port = proxy.port;
    await proxy.close();
    proxy = null;

    await expect(fetch(`http://localhost:${port}/`)).rejects.toThrow();
  });

  test('listens on the requested port when nonzero', async () => {
    upstream = await startUpstream((_req, res) => res.end('ok'));

    // Grab a kernel-allocated port via a throwaway server, then close it so
    // the proxy can bind that same port on purpose.
    const pickerSrv = createHttpServer();
    await new Promise<void>((done) => pickerSrv.listen(0, 'localhost', () => done()));
    const requested = (pickerSrv.address() as { port: number }).port;
    await new Promise<void>((done) => pickerSrv.close(() => done()));

    proxy = await startProxyServer({
      listenPort: requested,
      host: 'localhost',
      upstreamHost: 'localhost',
      upstreamPort: upstream.port,
    });
    expect(proxy.port).toBe(requested);
  });
});
