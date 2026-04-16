/**
 * Minimal reverse HTTP proxy for `ok ui` lock-collision fallback (US-005).
 *
 * When `ok ui` starts on a port but discovers another `ok ui` already holds
 * `ui.lock` with a different port (e.g. Claude Code's `autoPort:true` picked a
 * free port different from our lock holder's), this module starts a transparent
 * proxy that forwards to the lock-holder's port. Claude Code's preview pane
 * connects to the proxy and sees the live React app behind it.
 *
 * Uses only `node:http` — no new 3P dependency (FR-1.1b / D-032).
 */
import type {
  Server as HttpServer,
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';

export interface ProxyServerHandle {
  httpServer: HttpServer;
  port: number;
  close: () => Promise<void>;
}

export interface StartProxyOptions {
  listenPort: number;
  host: string;
  upstreamHost: string;
  upstreamPort: number;
}

export async function startProxyServer(opts: StartProxyOptions): Promise<ProxyServerHandle> {
  const httpServer: HttpServer = createHttpServer((req, res) => {
    forwardRequest(req, res, opts.upstreamHost, opts.upstreamPort);
  });

  await new Promise<void>((done, fail) => {
    const onError = (err: Error) => fail(err);
    httpServer.once('error', onError);
    httpServer.listen(opts.listenPort, opts.host, () => {
      httpServer.off('error', onError);
      done();
    });
  });

  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : opts.listenPort;

  return {
    httpServer,
    port,
    close: () =>
      new Promise<void>((done) => {
        httpServer.close(() => done());
      }),
  };
}

function forwardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamHost: string,
  upstreamPort: number,
): void {
  // Drop the inbound Host header — we'll set our own. Keeping it would surface
  // the proxy's listen port in upstream logs, which is only confusing.
  const headers: IncomingHttpHeaders = { ...req.headers };
  delete headers.host;

  const upstreamReq = httpRequest(
    {
      host: upstreamHost,
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: { ...headers, host: `${upstreamHost}:${upstreamPort}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
      upstreamRes.once('error', () => {
        try {
          res.end();
        } catch {
          // Already closed — nothing to do.
        }
      });
    },
  );

  upstreamReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    } else {
      try {
        res.end();
      } catch {
        // Already closed.
      }
    }
  });

  // Propagate client aborts so we don't leak an upstream socket.
  req.on('error', () => {
    upstreamReq.destroy();
  });

  req.pipe(upstreamReq);
}
