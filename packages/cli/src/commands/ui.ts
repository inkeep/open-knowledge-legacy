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
 * `contentDir`. `ok ui` is the sole server of the React bundle post-split
 * (`ok start` no longer serves static assets — see FR-1.2).
 *
 * Lock-collision handling (US-005): when another `ok ui` already holds
 * `ui.lock`, `resolveUiLockCollision` decides between three modes —
 * silent exit (same port), reverse HTTP proxy (different port with live
 * upstream), or timeout (upstream still binding). The proxy uses only
 * `node:http` (see `ui-proxy.ts`).
 *
 * Safety-net self-shutdown (D-025): a 12-hour timer self-terminates the UI
 * if the parent `ok start` ever crashes silently without sending SIGTERM
 * (idle-shutdown sends SIGTERM as its final pre-exit step, but a hard crash
 * doesn't get there). The default 12h is comfortably longer than any
 * legitimate uninterrupted editing session, and short enough that a
 * forgotten UI doesn't linger overnight. Cancelled by `handle.release()`.
 */
import type { Server as HttpServer, ServerResponse } from 'node:http';
import { defaultScheduler, type Scheduler } from '@inkeep/open-knowledge-core';
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';
import { type ProxyServerHandle, proxyRequest, startProxyServer } from './ui-proxy.ts';

/** 12 hours — D-025 default safety-net interval. */
export const DEFAULT_UI_SAFETY_NET_MS = 12 * 60 * 60 * 1000;

export interface UiServerHandle {
  httpServer: HttpServer;
  port: number;
  /** Release the lock + cancel the safety-net timer. Idempotent. */
  release: () => void;
  /** Cancel only the safety-net timer (release() also calls this). Idempotent. */
  detachSafetyNet: () => void;
  /** Reset the safety-net timer as if activity just occurred. Called on every
   *  `/api/config` hit so an actively-used UI doesn't disconnect at 12h. */
  nudgeSafetyNet: () => void;
}

export interface StartUiServerOptions {
  config: Config;
  cwd: string;
  port: number;
  host: string;
  /** Override the 12h safety-net interval. Tests pass a small value. */
  safetyNetMs?: number;
  /** Scheduler override for tests (precedent #13b — implicit time-coupling is a smell). */
  scheduler?: Scheduler;
  /**
   * Optional callback invoked by the safety-net timer right before it tears
   * down the http listener + lock. Tests use this to assert the safety-net
   * actually fired (rather than coincidentally being shut down by something
   * else). Production use case: future hook for metrics / logging.
   */
  onSafetyNet?: () => void;
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

  // Locate the built React app. Priority: published dist/public (bundled CLI)
  // first, then monorepo dev paths.
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

  // Forward-reference for the safety-net nudge (set below after the timer is
  // armed). The HTTP handler closes over this indirection so it picks up the
  // live callback once the timer is in place.
  let apiConfigNudge: (() => void) | null = null;

  const httpServer: HttpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];

    // GET /api/config — zero-ceremony bootstrap for the React app. Reads the
    // collab server.lock on demand so a later `ok start` shows up without
    // requiring a UI restart.
    if (url === '/api/config' && (req.method === 'GET' || req.method === 'HEAD')) {
      // Nudge the D-025 safety-net so an actively-polling client (the React
      // `useCollabUrl` hook, default ~2s cadence while unresolved) never lets
      // the 12h timer fire mid-session.
      apiConfigNudge?.();
      const lock = readServerLock(lockDir);
      const collabUrl = lock && lock.port > 0 ? `ws://localhost:${lock.port}/collab` : null;
      const body = JSON.stringify({ collabUrl, previewUrl: null, port: resolvedPort });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      // `nosniff` — defense in depth against a misconfigured intermediate or
      // browser that would otherwise content-sniff the response body.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.statusCode = 200;
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(body);
      }
      return;
    }

    // All other /api/* requests: transparently proxy to the collab server
    // (`ok start`). The React app makes same-origin `fetch('/api/pages')`,
    // `/api/backlinks`, `/api/history`, etc.; post-lifecycle-split those
    // endpoints only exist on `ok start`, NOT `ok ui`. Without this proxy
    // the React app fetches would receive the SPA-fallback HTML and fail to
    // JSON.parse (QA-040). When the collab server is absent (no server.lock
    // or port=0), we return a machine-readable 503 so the React app can
    // distinguish "collab down" from "404 not found" — same envelope shape
    // as `ok start`'s own API-route-not-found response.
    if (url?.startsWith('/api/')) {
      apiConfigNudge?.();
      const lock = readServerLock(lockDir);
      if (!lock || lock.port <= 0) {
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Collab server not running. Start `ok start` or run `ok status`.',
            path: url,
          }),
        );
        return;
      }
      proxyRequest(req, res, {
        upstreamHost: 'localhost',
        upstreamPort: lock.port,
      });
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

  // D-025 — schedule the safety-net self-shutdown. The timer is cancelled
  // by `release()` (the canonical "I'm shutting down" signal) so an
  // operator-driven SIGTERM never trips it. Each `/api/config` hit nudges
  // the deadline forward so an actively-used UI never fires the safety-net.
  const scheduler = opts.scheduler ?? defaultScheduler;
  const safetyNetMs = opts.safetyNetMs ?? DEFAULT_UI_SAFETY_NET_MS;
  let safetyNetHandle: ReturnType<typeof scheduler.setTimeout> | null = null;
  let safetyNetCancelled = false;
  let lockReleased = false;

  const detachSafetyNet = (): void => {
    if (safetyNetCancelled) return;
    safetyNetCancelled = true;
    if (safetyNetHandle !== null) {
      scheduler.clearTimeout(safetyNetHandle);
      safetyNetHandle = null;
    }
  };

  const release = (): void => {
    detachSafetyNet();
    if (lockReleased) return;
    lockReleased = true;
    try {
      releaseUiLock(lockDir);
    } catch {
      // Release is best-effort — another cleanup may have raced us.
    }
  };

  const armSafetyNet = (): void => {
    if (safetyNetCancelled || safetyNetMs <= 0) return;
    if (safetyNetHandle !== null) {
      scheduler.clearTimeout(safetyNetHandle);
      safetyNetHandle = null;
    }
    safetyNetHandle = scheduler.setTimeout(() => {
      safetyNetHandle = null;
      // Ensure callbacks see safetyNetCancelled === false at this point —
      // we treat the fire as authoritative shutdown intent.
      console.warn(`[ui] safety-net (${safetyNetMs}ms) reached — shutting down (D-025 backstop)`);
      try {
        opts.onSafetyNet?.();
      } catch {
        // best-effort observer
      }
      try {
        httpServer.close();
      } catch {
        // best-effort
      }
      release();
    }, safetyNetMs);
  };

  const nudgeSafetyNet = (): void => {
    if (safetyNetCancelled || safetyNetMs <= 0) return;
    armSafetyNet();
  };

  // Expose the nudge to the HTTP handler so every /api/config request resets
  // the timer. Without this an actively-used UI disconnects at 12h — the
  // safety-net is meant to catch orphaned siblings, not healthy ones.
  apiConfigNudge = nudgeSafetyNet;

  armSafetyNet();

  return {
    httpServer,
    port: realPort,
    release,
    detachSafetyNet,
    nudgeSafetyNet,
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

/**
 * Decide what to do when another `ok ui` already holds `ui.lock`.
 *
 * - Same requested port as the lock holder → "already running"; caller
 *   logs and exits 0 (no proxy; duplicate attempt).
 * - Different requested port, lock port > 0 → reverse HTTP proxy on the
 *   requested port forwarding to the lock holder.
 * - Different requested port, lock port == 0 → poll the lock for up to
 *   `pollDeadlineMs` (default 2000); throw if still 0 at deadline.
 * - Lock disappears during resolution → throw so the caller can retry
 *   acquiring cleanly.
 *
 * No side effects beyond starting the proxy server on the "proxy" branch.
 * Tests verify each branch directly without driving Commander.
 */
export type UiCollisionResult =
  | { mode: 'already-running'; port: number }
  | { mode: 'proxy'; handle: ProxyServerHandle; upstreamPort: number };

export interface ResolveUiLockCollisionOptions {
  requestedPort: number;
  host: string;
  lockDir: string;
  /** Override for tests. Defaults to `readUiLock` from the server package. */
  readLock?: () =>
    | import('@inkeep/open-knowledge-server').UiLockMetadata
    | null
    | Promise<import('@inkeep/open-knowledge-server').UiLockMetadata | null>;
  pollIntervalMs?: number;
  pollDeadlineMs?: number;
}

export async function resolveUiLockCollision(
  opts: ResolveUiLockCollisionOptions,
): Promise<UiCollisionResult> {
  const readLock =
    opts.readLock ??
    (async () => {
      const { readUiLock } = await import('@inkeep/open-knowledge-server');
      return readUiLock(opts.lockDir);
    });

  const initial = await readLock();
  if (!initial) {
    throw new Error(
      'UI lock collision reported but the lock disappeared before handling — retry acquiring.',
    );
  }

  if (initial.port === opts.requestedPort && initial.port > 0) {
    return { mode: 'already-running', port: initial.port };
  }

  let upstreamPort = initial.port;
  if (upstreamPort === 0) {
    const deadline = Date.now() + (opts.pollDeadlineMs ?? 2000);
    const intervalMs = opts.pollIntervalMs ?? 100;
    while (Date.now() < deadline) {
      await new Promise<void>((done) => {
        setTimeout(done, intervalMs);
      });
      const lock = await readLock();
      if (lock && lock.port > 0) {
        upstreamPort = lock.port;
        break;
      }
    }
    if (upstreamPort === 0) {
      throw new Error('UI did not bind within 2s; run `ok clean`');
    }
    if (upstreamPort === opts.requestedPort) {
      return { mode: 'already-running', port: upstreamPort };
    }
  }

  const handle = await startProxyServer({
    listenPort: opts.requestedPort,
    host: opts.host,
    upstreamHost: 'localhost',
    upstreamPort,
  });
  return { mode: 'proxy', handle, upstreamPort };
}

export function uiCommand(getConfig: () => Config): Command {
  return new Command('ui')
    .description('Serve the Open Knowledge React editor UI')
    .option('-p, --port <port>', 'UI port (default: $PORT env or 3000)')
    .option('-H, --host <host>', 'UI host', 'localhost')
    .action(async (opts: { port?: string; host?: string }) => {
      const { dim } = await import('../ui/colors.ts');
      const { UiLockCollisionError } = await import('@inkeep/open-knowledge-server');
      const { resolveContentDir, resolveLockDir } = await import('../config/paths.ts');
      const config = getConfig();
      const host = opts.host ?? 'localhost';

      let requestedPort: number;
      try {
        requestedPort = resolveRequestedPort(opts.port, process.env.PORT);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }

      try {
        const handle = await startUiServer({
          config,
          cwd: process.cwd(),
          port: requestedPort,
          host,
        });
        console.log(`${dim('[ui]')} listening on http://${host}:${handle.port}`);

        let shuttingDown = false;
        const shutdown = (signal: NodeJS.Signals) => {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log(dim(`\n[ui] Shutting down (${signal})...`));
          // CC8 ordering: release the lock LAST, inside a finally, so a
          // mid-shutdown throw still removes the lockfile. Inverting this
          // (lock first, socket close second) re-introduces the stale-lock
          // + EADDRINUSE race the zero-ceremony design set out to eliminate.
          // Matches the shutdown pattern in `packages/server/src/standalone.ts`.
          handle.detachSafetyNet();
          const finish = () => {
            try {
              handle.release();
            } finally {
              process.exit(process.exitCode ?? 0);
            }
          };
          try {
            handle.httpServer.close(() => finish());
          } catch {
            finish();
          }
          // Hard-deadline fallback — if close() hangs on an in-flight request,
          // we still release the lock and exit rather than stranding a stale
          // lockfile forever.
          setTimeout(finish, 2000).unref();
        };
        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));
        return;
      } catch (err) {
        if (!(err instanceof UiLockCollisionError)) throw err;

        const lockDir = resolveLockDir(resolveContentDir(config, process.cwd()));
        let result: UiCollisionResult;
        try {
          result = await resolveUiLockCollision({
            requestedPort,
            host,
            lockDir,
          });
        } catch (collisionErr) {
          console.error(
            collisionErr instanceof Error ? collisionErr.message : String(collisionErr),
          );
          process.exit(1);
        }

        if (result.mode === 'already-running') {
          console.log(`UI already running at http://${host}:${result.port}`);
          process.exit(0);
        }

        console.log(
          `UI running at http://${host}:${result.upstreamPort}; acting as HTTP proxy on port ${result.handle.port}`,
        );

        let shuttingDown = false;
        const shutdown = (signal: NodeJS.Signals) => {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log(dim(`\n[ui-proxy] Shutting down (${signal})...`));
          result.handle.close().finally(() => process.exit(process.exitCode ?? 0));
          setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
        };
        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));
      }
    });
}

// Exported for tests.
export { resolveRequestedPort };
