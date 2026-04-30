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
import {
  ASSET_EXTENSIONS,
  defaultScheduler,
  EXECUTABLE_BLOCKLIST_EXTENSIONS,
  INLINE_RENDERABLE_EXTENSIONS,
  type Scheduler,
} from '@inkeep/open-knowledge-core';
import type { Config } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { type ProxyServerHandle, proxyRequest, startProxyServer } from './ui-proxy.ts';

/** 12 hours — D-025 default safety-net interval. */
export const DEFAULT_UI_SAFETY_NET_MS = 12 * 60 * 60 * 1000;

export interface UiServerHandle {
  /**
   * All bound HTTP servers. In two-socket-loopback mode (default, per D-033)
   * this has length 2 — one IPv6 loopback (`[::1]`), one IPv4 loopback
   * (`127.0.0.1`). When a caller passes an explicit `host`, length is 1.
   * Callers that want to close the listener must close ALL servers; use the
   * exported `closeHttpServers` helper.
   */
  httpServers: HttpServer[];
  port: number;
  /** Release the lock + cancel the safety-net timer. Idempotent. */
  release: () => void;
  /** Cancel only the safety-net timer (release() also calls this). Idempotent. */
  detachSafetyNet: () => void;
  /** Reset the safety-net timer as if activity just occurred. Called on every
   *  `/api/config` hit so an actively-used UI doesn't disconnect at 12h. */
  nudgeSafetyNet: () => void;
}

/**
 * Close every HTTP server in a `UiServerHandle` and resolve when all have
 * fully released their listening sockets. Use instead of touching
 * `handle.httpServers` directly so the two-socket lifecycle is centralized.
 */
export async function closeHttpServers(servers: HttpServer[]): Promise<void> {
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((done) => {
          s.close(() => done());
        }),
    ),
  );
}

interface StartUiServerOptions {
  config: Config;
  cwd: string;
  port: number;
  /**
   * Bind host. Undefined (default) triggers D-033 two-socket loopback mode:
   * the server is bound twice on the same port — once on `[::1]` (IPv6
   * loopback) and once on `127.0.0.1` (IPv4 loopback). Any subsequent bind
   * attempt on the same port from either family fails loud with EADDRINUSE.
   *
   * Passing an explicit host (e.g. `'127.0.0.1'`, `'::1'`, `'0.0.0.0'`, `'::'`)
   * degrades to single-socket binding on that host. Tests and operator
   * overrides can still target a specific family.
   */
  host?: string;
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
  const {
    acquireUiLock,
    createAssetServeMiddleware,
    createContentFilter,
    readServerLock,
    releaseUiLock,
    updateUiLockPort,
  } = await import('@inkeep/open-knowledge-server');
  const { default: sirv } = await import('sirv');
  const { resolveContentDir, resolveLockDir } = await import('@inkeep/open-knowledge-server');

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
    ? sirv(assetDir, { single: true, gzip: true, immutable: true, extensions: [] })
    : null;

  // Filter-aware content asset serving — shared `createAssetServeMiddleware`
  // applies the same Content-Disposition policy + 404 fail-closed guard the
  // dev-plugin path uses, so dev and prod cannot diverge on serve semantics.
  //
  // Use `dev: true` so sirv resolves files lazily instead of recursively
  // crawling the entire content root at boot. Repo-root content dirs often
  // include huge trees (`node_modules`, build artifacts) and can contain
  // broken links from package-manager swaps; eager traversal makes UI boot
  // fail before it has served a single request.
  //
  // `dotfiles: false` still keeps `.open-knowledge/` out of reach.
  // `extensions: []` disables sirv's default `['html', 'htm']` fallback —
  // without this, a request to `/docs/evil` transparently resolves
  // `docs/evil.html` and serves it as `text/html`, bypassing the
  // Content-Disposition dispatch (which matches on the requested URL's
  // extension). Refusing extension inference confines lookup to the
  // literal requested URL.
  //
  // The asset-serve middleware itself only fires when `contentSirv` is
  // present; if `contentDir` is missing we skip filter construction and
  // route everything through the SPA static handler (matches the
  // pre-middleware behavior for missing-contentDir setups).
  const assetServeMiddleware = existsSync(contentDir)
    ? createAssetServeMiddleware({
        contentFilter: createContentFilter({
          projectDir: opts.cwd,
          contentDir,
          includePatterns: opts.config.content.include,
          excludePatterns: opts.config.content.exclude,
        }),
        contentSirv: sirv(contentDir, { dotfiles: false, dev: true, extensions: [] }),
        inlineExtensions: INLINE_RENDERABLE_EXTENSIONS,
        assetExtensions: ASSET_EXTENSIONS,
        blocklistExtensions: EXECUTABLE_BLOCKLIST_EXTENSIONS,
      })
    : null;

  // Resolved port — filled in after listen(). /api/config reads from this so
  // the advertised `port` matches what the kernel actually bound (matters
  // when opts.port is 0).
  let resolvedPort = opts.port;

  // Forward-reference for the safety-net nudge (set below after the timer is
  // armed). The HTTP handler closes over this indirection so it picks up the
  // live callback once the timer is in place.
  let apiConfigNudge: (() => void) | null = null;

  // Request handler — the same function services every bound server (both
  // [::1] and 127.0.0.1 in two-socket-loopback mode, or the single socket
  // when a caller passes an explicit host).
  const requestHandler = (req: import('node:http').IncomingMessage, res: ServerResponse) => {
    const url = req.url?.split('?')[0];

    // Bare `/` and the empty path: rewrite to `/index.html` so sirv serves
    // the SPA shell. The static handler is configured with `extensions: []`
    // (a security choice — without it, `/foo` would transparently serve
    // `/foo.html` and bypass the Content-Disposition dispatch which keys
    // off the requested URL's extension). That suppression also disables
    // sirv's implicit directory-index resolution, so `/` ends up as a 404
    // even though `single: true` is set. The cleanest fix is to rewrite
    // the entry path explicitly here, before any middleware runs, rather
    // than re-enabling extension inference globally.
    if (url === '/' || url === '') {
      req.url = '/index.html';
    }

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

    // Content files (markdown + assets) served via the shared asset-serve
    // middleware — same Content-Disposition policy (inline / attachment) +
    // fail-closed 404 guard that the dev plugin uses. Falls through to the
    // SPA static handler when the content filter excludes the path or sirv
    // doesn't recognize it.
    if (assetServeMiddleware) {
      assetServeMiddleware(req, res, () => {
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
  };

  // D-033 — BIND STRATEGY
  //
  // When `opts.host` is undefined (default), we bind two separate HTTP
  // servers on the same port: one on `[::1]` (IPv6 loopback), one on
  // `127.0.0.1` (IPv4 loopback). This is "two-socket loopback" mode.
  //
  // Why not `::` + `ipv6Only:false` (the spec's original wording)? That
  // doesn't enforce EADDRINUSE on macOS — a second `127.0.0.1` bind
  // succeeds even when the IPv6 wildcard is already claimed (verified
  // empirically 2026-04-16). The only way to get cross-family collision-
  // fail-loud on macOS is to bind both families explicitly.
  //
  // When `opts.host` is set (e.g. `-H 127.0.0.1`), we degrade to a
  // single-socket bind so callers opting into a specific family get
  // exactly that behavior.
  //
  // Sequencing: bind IPv6 first (the kernel assigns the port when
  // `opts.port === 0`), then bind IPv4 at the resolved port. If the
  // IPv4 bind fails (EADDRINUSE, EACCES, etc.), close the IPv6 server
  // and release the lock before propagating the error.
  const bindTargets: string[] = opts.host === undefined ? ['::1', '127.0.0.1'] : [opts.host];
  const httpServers: HttpServer[] = [];
  let boundPort = opts.port;

  try {
    for (const host of bindTargets) {
      const server = createHttpServer(requestHandler);
      httpServers.push(server);
      await new Promise<void>((done, fail) => {
        const onError = (err: Error) => fail(err);
        server.once('error', onError);
        server.listen(boundPort, host, () => {
          server.off('error', onError);
          const addr = server.address();
          if (typeof addr === 'object' && addr !== null) {
            // Pin the resolved port so the next bind in the loop uses the
            // same port (matters when opts.port was 0).
            boundPort = addr.port;
          }
          done();
        });
      });
    }
  } catch (err) {
    // Any partial binds need to be torn down before we propagate.
    await Promise.all(
      httpServers.map(
        (s) =>
          new Promise<void>((done) => {
            try {
              s.close(() => done());
            } catch {
              done();
            }
          }),
      ),
    );
    try {
      releaseUiLock(lockDir);
    } catch {
      // Release is best-effort; the primary failure is more informative.
    }
    throw err;
  }

  const realPort = boundPort;
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
      // Close every bound HTTP server (two-socket loopback mode has two).
      for (const server of httpServers) {
        try {
          server.close();
        } catch {
          // best-effort
        }
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
    httpServers,
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
  // D-033: default to kernel-allocation (0) instead of the hardcoded 3000.
  // The previous default caused silent cross-project collisions when two
  // projects' `ok ui` attempted to bind the same port from different address
  // families. MCP preview URLs dereference `ui.lock.port` so no client
  // contract breaks. Claude Code's `launch.json` retains `port: 3000` as the
  // probe target; `autoPort: true` resolves the actual port end-to-end.
  return 0;
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
type UiCollisionResult =
  | { mode: 'already-running'; port: number }
  | { mode: 'proxy'; handle: ProxyServerHandle; upstreamPort: number };

interface ResolveUiLockCollisionOptions {
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
    .option('-p, --port <port>', 'UI port (default: $PORT env or 0 / kernel-allocated)')
    .option(
      '-H, --host <host>',
      'UI host. Default: two-socket loopback bind (`[::1]` + `127.0.0.1`) so cross-family collisions fail loud (D-033). Pass an explicit host (e.g. `127.0.0.1`, `0.0.0.0`) to bind a single socket on that host.',
    )
    .action(async (opts: { port?: string; host?: string }) => {
      const { dim } = await import('../ui/colors.ts');
      const { UiLockCollisionError } = await import('@inkeep/open-knowledge-server');
      const { resolveContentDir, resolveLockDir } = await import('@inkeep/open-knowledge-server');
      const config = getConfig();
      // Undefined `host` triggers the default two-socket loopback mode in
      // startUiServer. Callers who pass `-H` get single-socket bind as-is.
      const host = opts.host;

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
        // Display a clickable URL in the log. Two-socket loopback mode
        // (host === undefined) and wildcard binds don't have a single
        // canonical host string, so default to `localhost` — it resolves
        // to whichever loopback family the browser prefers and both are
        // bound.
        const displayHost =
          host === undefined || host === '::' || host === '0.0.0.0' ? 'localhost' : host;
        console.log(`${dim('[ui]')} listening on http://${displayHost}:${handle.port}`);

        let shuttingDown = false;
        const shutdown = (signal: NodeJS.Signals) => {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log(dim(`\n[ui] Shutting down (${signal})...`));
          // CC8 ordering: release the lock LAST, inside a finally, so a
          // mid-shutdown throw still removes the lockfile. Inverting this
          // (lock first, socket close second) re-introduces the stale-lock
          // + EADDRINUSE race the zero-ceremony design set out to eliminate.
          // Matches the shutdown pattern in `packages/server/src/server-factory.ts`.
          handle.detachSafetyNet();
          const finish = () => {
            try {
              handle.release();
            } finally {
              process.exit(process.exitCode ?? 0);
            }
          };
          // Close every bound server (two in the default two-socket mode)
          // before releasing the lock. If any .close() throws synchronously
          // we still fall through to finish() via the catch.
          closeHttpServers(handle.httpServers).then(finish, finish);
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
        // The proxy + collision code paths expect a concrete host string.
        // When the caller didn't pass `-H`, fall back to `localhost` — the
        // proxy only matters when a SECOND `ok ui` races against a live
        // lock (Scenario B in the SPEC), and that proxy's single-socket
        // loopback is acceptable (unlike the primary server, which does
        // two-socket for collision-fail-loud).
        const proxyHost = host ?? 'localhost';
        let result: UiCollisionResult;
        try {
          result = await resolveUiLockCollision({
            requestedPort,
            host: proxyHost,
            lockDir,
          });
        } catch (collisionErr) {
          console.error(
            collisionErr instanceof Error ? collisionErr.message : String(collisionErr),
          );
          process.exit(1);
        }

        if (result.mode === 'already-running') {
          console.log(`UI already running at http://${proxyHost}:${result.port}`);
          process.exit(0);
        }

        console.log(
          `UI running at http://${proxyHost}:${result.upstreamPort}; acting as HTTP proxy on port ${result.handle.port}`,
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
