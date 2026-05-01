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

interface StartProxyOptions {
  listenPort: number;
  host: string;
  upstreamHost: string;
  upstreamPort: number;
  upstreamTimeoutMs?: number;
}

const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

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

interface ProxyRequestOptions {
  upstreamHost: string;
  upstreamPort: number;
  upstreamTimeoutMs?: number;
}

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
  const headers: IncomingHttpHeaders = { ...req.headers };
  delete headers.host;
  for (const name of HOP_BY_HOP_HEADERS) {
    delete headers[name];
  }

  req.setTimeout(DEFAULT_REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      try {
        res.writeHead(408, { 'Content-Type': 'text/plain' });
        res.end('Request Timeout');
      } catch {
      }
    } else {
      try {
        res.end();
      } catch {
      }
    }
    try {
      req.socket?.destroy();
    } catch {
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
        }
      });
    },
  );

  if (upstreamTimeoutMs > 0) {
    upstreamReq.setTimeout(upstreamTimeoutMs, () => {
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'text/plain' });
        res.end('Gateway Timeout');
      } else {
        try {
          res.end();
        } catch {
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
      }
    }
  });

  req.on('error', () => {
    upstreamReq.destroy();
  });

  req.pipe(upstreamReq);
}
