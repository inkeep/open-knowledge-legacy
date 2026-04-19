/**
 * Minimal reverse HTTP proxy for `ok ui` lock-collision fallback (US-005)
 * and for forwarding `ok ui`'s `/api/*` traffic to the collab server (QA-040).
 *
 * Two modes:
 *   1. **Standalone** — `startProxyServer(opts)` spins up an HTTP listener that
 *      forwards every request to an upstream host:port. Used for Claude
 *      Code's `autoPort:true` lock-collision scenario (the listener holds the
 *      autoPort-resolved port; requests get forwarded to the lock-holder's
 *      port).
 *   2. **Embedded** — `proxyRequest(req, res, opts)` is called directly from
 *      an existing `http.Server` request handler to forward a single request
 *      to an upstream. Used by `ok ui` so that React's same-origin REST
 *      calls (`/api/pages`, `/api/backlinks`, etc.) transparently reach the
 *      collab server on a different port without per-caller URL rewriting.
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

/** Per-request client-side deadline — prevents a malicious/local slow-loris peer
 * from pinning the proxy socket indefinitely. 30s leaves ample margin over the
 * upstream timeout above so we never time out a healthy request. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Hop-by-hop headers per RFC 7230 §6.1 — these MUST NOT be forwarded by a
 * proxy. Additionally we drop `Cookie` / `Set-Cookie` because `ok ui` does
 * not set cookies and there is no legitimate reason for localhost peers to
 * flow cookies through our reverse proxy.
 *
 * `Upgrade` is special-cased: we drop it for plain HTTP but WebSocket upgrade
 * is not currently routed through this proxy (React calls the collab WebSocket
 * directly with the `collabUrl` from `/api/config`, not via the proxy). If
 * that ever changes we'll need a dedicated upgrade handler here.
 */
const HOP_BY_HOP_HEADERS: readonly string[] = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'cookie',
  'set-cookie',
];

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

export interface ProxyRequestOptions {
  upstreamHost: string;
  upstreamPort: number;
  /** Per-request upstream timeout in ms. Default 10_000. 0 disables. */
  upstreamTimeoutMs?: number;
}

/**
 * Forward a single incoming request to an upstream. Shared between
 * `startProxyServer` (which wires it as the request handler) and embedded
 * callers like `ok ui` that thread a targeted `/api/*` proxy into their
 * existing request router without running a second HTTP listener.
 *
 * Handles: header forwarding (minus Host), request-body piping, response
 * status/headers/body piping, 504 on upstream timeout, 502 on upstream
 * error, and client-abort propagation so no upstream sockets leak.
 */
export function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProxyRequestOptions,
): void {
  forwardRequest(
    req,
    res,
    opts.upstreamHost,
    opts.upstreamPort,
    opts.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS,
  );
}

function forwardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamHost: string,
  upstreamPort: number,
  upstreamTimeoutMs: number,
): void {
  // Strip hop-by-hop headers (RFC 7230 §6.1) + Cookie / Set-Cookie. Drop the
  // inbound Host header so we can rewrite it to the upstream authority —
  // keeping the browser's Host would surface the proxy port in upstream logs
  // and confuse vhost-routing upstreams.
  const headers: IncomingHttpHeaders = { ...req.headers };
  delete headers.host;
  for (const name of HOP_BY_HOP_HEADERS) {
    delete headers[name];
  }

  // Per-request deadline — destroy the upstream + response on elapse so a
  // slow-loris client or hung upstream can't pin sockets past DEFAULT_REQUEST_TIMEOUT_MS.
  req.setTimeout(DEFAULT_REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      try {
        res.writeHead(408, { 'Content-Type': 'text/plain' });
        res.end('Request Timeout');
      } catch {
        // already closed
      }
    } else {
      try {
        res.end();
      } catch {
        // already closed
      }
    }
    try {
      req.socket?.destroy();
    } catch {
      // best-effort
    }
  });

  const upstreamReq = httpRequest(
    {
      host: upstreamHost,
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: { ...headers, host: `${upstreamHost}:${upstreamPort}` },
    },
    (upstreamRes) => {
      // Strip hop-by-hop headers + Set-Cookie on the response path too —
      // same rationale as the inbound direction.
      const resHeaders = { ...upstreamRes.headers };
      for (const name of HOP_BY_HOP_HEADERS) {
        delete resHeaders[name];
      }
      res.writeHead(upstreamRes.statusCode ?? 502, resHeaders);
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
