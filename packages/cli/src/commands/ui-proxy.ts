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
  /** Per-request upstream timeout in milliseconds. Default 10_000. Upstream
   * hang past this deadline produces a 504 Gateway Timeout. Set to 0 to
   * disable (not recommended — Node's default is no timeout). */
  upstreamTimeoutMs?: number;
}

/** Default: 10s. Long enough for legitimate slow loads, short enough that a
 * hung upstream doesn't keep browser connections open indefinitely. */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

export async function startProxyServer(opts: StartProxyOptions): Promise<ProxyServerHandle> {
  const timeoutMs = opts.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  const httpServer: HttpServer = createHttpServer((req, res) => {
    forwardRequest(req, res, opts.upstreamHost, opts.upstreamPort, timeoutMs);
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
  upstreamTimeoutMs: number,
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

  // Bounded upstream timeout — without this a hung `ok ui` (GC pause, deadlock,
  // anything non-crashing) leaves browsers waiting indefinitely. On deadline we
  // destroy the upstream socket and respond 504 ourselves (headers-not-sent path
  // is the common case; if upstream already started streaming, we just end).
  if (upstreamTimeoutMs > 0) {
    upstreamReq.setTimeout(upstreamTimeoutMs, () => {
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'text/plain' });
        res.end('Gateway Timeout');
      } else {
        try {
          res.end();
        } catch {
          // Already closed.
        }
      }
      upstreamReq.destroy();
    });
  }

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
