/**
 * `open-knowledge ui` — serves the React editor UI as a sibling to `ok start`.
 *
 * Default port 3000; `PORT` env (set by Claude Code's `autoPort:true`) and
 * `--port` flag override. Acquires `<lockDir>/ui.lock` so MCP tools can
 * advertise preview URLs pointing at this process.
 *
 * Exposes `GET /api/config` with `{collabUrl, previewUrl, port}`, derived
 * from the `ok start` lockfile. The React app reads it on mount to bootstrap
 * HocuspocusProvider.
 *
 * Static-asset serving — app bundle from `dist/public` (published CLI) or
 * `packages/app/dist` (monorepo dev), plus filter-aware content serving over
 * `contentDir` — mirrors `start.ts` verbatim so asset-path precedence does
 * not change post-split.
 *
 * Lock-collision handling (US-005) is intentionally out of scope for this
 * story — a `ProcessLockCollisionError` propagates. The proxy-mode handler
 * lands in a follow-up commit.
 */
import type { Server as HttpServer, ServerResponse } from 'node:http';
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';

export interface UiServerHandle {
  httpServer: HttpServer;
  port: number;
  release: () => void;
}

export interface StartUiServerOptions {
  config: Config;
  cwd: string;
  port: number;
  host: string;
}

/**
 * Boot the UI server. Exposed for tests so they can drive the HTTP surface
 * without having to go through Commander.
 */
export async function startUiServer(opts: StartUiServerOptions): Promise<UiServerHandle> {
  const { existsSync } = await import('node:fs');
  const { createServer: createHttpServer } = await import('node:http');
  const { resolve } = await import('node:path');
  const { acquireUiLock, readServerLock, releaseUiLock, updateUiLockPort } = await import(
    '@inkeep/open-knowledge-server'
  );
  const { default: sirv } = await import('sirv');
  const { resolveContentDir, resolveLockDir } = await import('../config/paths.ts');

  const contentDir = resolveContentDir(opts.config, opts.cwd);
  const lockDir = resolveLockDir(contentDir);

  // Acquire lock before any side effects. `port: 0` is the sentinel while
  // the server is binding; `updateUiLockPort` rewrites after `listen()`.
  acquireUiLock(lockDir, { port: 0, worktreeRoot: opts.cwd });

  // Locate the built React app. Priority mirrors `start.ts` so dev + published
  // CLI both work from a single code path (DRY with start.ts pending its own
  // cleanup in US-006).
  const cliDir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
  const assetPaths = [
    resolve(cliDir, 'public'), // npm install: dist/public/ (bundled)
    resolve(cliDir, '../../app/dist'), // monorepo dev from src/
    resolve(cliDir, '../../../app/dist'), // monorepo dev from dist/
  ];
  const assetDir = assetPaths.find((p) => existsSync(p));
  const staticHandler = assetDir
    ? sirv(assetDir, { single: true, gzip: true, immutable: true })
    : null;

  // Filter-aware content asset serving (matches start.ts behavior pre-split).
  // `sirv` with `dotfiles: false` keeps `.open-knowledge/` out of reach.
  const contentSirv = existsSync(contentDir) ? sirv(contentDir, { dotfiles: false }) : null;

  // Resolved port — filled in after listen(). /api/config reads from this so
  // the advertised `port` matches what the kernel actually bound (matters
  // when opts.port is 0).
  let resolvedPort = opts.port;

  const httpServer: HttpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];

    // GET /api/config — zero-ceremony bootstrap for the React app. Reads the
    // collab server.lock on demand so a later `ok start` shows up without
    // requiring a UI restart.
    if (url === '/api/config' && (req.method === 'GET' || req.method === 'HEAD')) {
      const lock = readServerLock(lockDir);
      const collabUrl = lock && lock.port > 0 ? `ws://localhost:${lock.port}/collab` : null;
      const body = JSON.stringify({ collabUrl, previewUrl: null, port: resolvedPort });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(body);
      }
      return;
    }

    // Content files (markdown etc.) served via filter-aware sirv.
    const rel = decodeURIComponent(url?.replace(/^\//, '') ?? '');
    if (rel && contentSirv) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      contentSirv(req, res, () => {
        if (staticHandler) {
          staticHandler(req, res);
        } else {
          notFound(res);
        }
      });
      return;
    }

    // SPA fallback.
    if (staticHandler) {
      staticHandler(req, res);
      return;
    }

    notFound(res);
  });

  await new Promise<void>((done, fail) => {
    const onError = (err: Error) => {
      try {
        releaseUiLock(lockDir);
      } catch {
        // Release is best-effort; the primary failure is more informative.
      }
      fail(err);
    };
    httpServer.once('error', onError);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.off('error', onError);
      done();
    });
  });

  const addr = httpServer.address();
  const realPort = typeof addr === 'object' && addr !== null ? addr.port : opts.port;
  resolvedPort = realPort;
  updateUiLockPort(lockDir, realPort);

  return {
    httpServer,
    port: realPort,
    release: () => {
      try {
        releaseUiLock(lockDir);
      } catch {
        // Release is best-effort — another cleanup may have raced us.
      }
    },
  };
}

function notFound(res: ServerResponse): void {
  res.writeHead(404);
  res.end('Not found');
}

function resolveRequestedPort(optsPort: string | undefined, envPort: string | undefined): number {
  if (optsPort !== undefined) {
    const parsed = Number.parseInt(optsPort, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 65535) {
      throw new Error(`Invalid --port value '${optsPort}'`);
    }
    return parsed;
  }
  if (envPort !== undefined && envPort !== '') {
    const parsed = Number.parseInt(envPort, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 65535) {
      throw new Error(`Invalid PORT env value '${envPort}'`);
    }
    return parsed;
  }
  return 3000;
}

export function uiCommand(getConfig: () => Config): Command {
  return new Command('ui')
    .description('Serve the Open Knowledge React editor UI')
    .option('-p, --port <port>', 'UI port (default: $PORT env or 3000)')
    .option('-H, --host <host>', 'UI host', 'localhost')
    .action(async (opts: { port?: string; host?: string }) => {
      const { dim } = await import('../ui/colors.ts');
      const config = getConfig();

      let requestedPort: number;
      try {
        requestedPort = resolveRequestedPort(opts.port, process.env.PORT);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }

      const handle = await startUiServer({
        config,
        cwd: process.cwd(),
        port: requestedPort,
        host: opts.host ?? 'localhost',
      });

      console.log(`${dim('[ui]')} listening on http://${opts.host ?? 'localhost'}:${handle.port}`);

      let shuttingDown = false;
      const shutdown = (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(dim(`\n[ui] Shutting down (${signal})...`));
        handle.release();
        handle.httpServer.close(() => {
          process.exit(process.exitCode ?? 0);
        });
        // Safety timeout — close() may hang on keepalive sockets.
        setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    });
}

// Exported for tests.
export { resolveRequestedPort };
