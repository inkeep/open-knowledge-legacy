/**
 * Vite plugin that integrates Hocuspocus for dev mode.
 *
 * Delegates to `createServer()` from @inkeep/open-knowledge-server so
 * `bun run dev` runs the same server-wiring as `ok start` — reconciliation,
 * principal-auth, HEAD watcher, managed-rename recovery, SyncEngine, CC1
 * push. Plugin retains only Vite-specific wiring: config.yml resolution,
 * `OK_TEST_CONTENT_DIR` override, `/api/config` synthesis, sirv filter-aware
 * asset serving, `/collab` + `/collab/keepalive` upgrade routing on Vite's
 * HTTP server via `prependListener('upgrade', ...)`.
 *
 * SPEC: specs/2026-04-23-vite-plugin-createserver-dedup/SPEC.md
 *
 * **D8 amendment (2026-04-23, post-implementation):** The original spec
 * LOCKED D8 at "module-load" invocation. In practice, `createServer()`'s
 * async init starts a @parcel/watcher subscription that keeps the Node
 * event loop alive — causing `vite build` (which loads this module but
 * never invokes `configureServer` or `httpServer.on('close')`) to hang
 * after the bundle is produced. Invoking `createServer()` lazily inside
 * `configureServer` (which only fires for `vite` / `vite dev`, not for
 * `vite build`) fixes this regression while preserving every other spec
 * guarantee. A module-scope singleton gate (`let srv: ServerInstance | null`)
 * handles HMR re-invocation of `configureServer` — same-pid lock acquisition
 * is idempotent (process-lock.ts:138-143) so the gate is belt-and-suspenders.
 * This matches DC-M4's challenger finding from the audit.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  createServer,
  ensureProjectGit,
  handleCollabSocketError,
  parseKeepaliveConnectionId,
  releaseServerLock,
  type ServerInstance,
  toBroadcasterKey,
  updateServerLockPort,
} from '@inkeep/open-knowledge-server';
import sirv from 'sirv';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { parse as parseYaml } from 'yaml';
import { computeDevApiConfigResponse } from './api-config-handler.ts';

// `configureServer` is expected to run exactly once per dev-server lifetime.
// Counting invocations lets us detect (via log) any unexpected re-run that
// would orphan the previous `wss`/upgrade-listener. Referenced in the
// `[collab]` diagnostic logs — see the `Investigating a stuck /collab WS`
// section of packages/app/src/server/README.md.
let configureServerInvocations = 0;

// Resolve project root (directory containing .open-knowledge/)
const PLUGIN_DIR = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
const PROJECT_ROOT = resolve(PLUGIN_DIR, '../../../..');

interface ContentConfig {
  dir: string;
  include: string[];
  exclude: string[];
}

/**
 * Read content config from .open-knowledge/config.yml.
 * Falls back to defaults (PROJECT_ROOT + all-markdown include + empty exclude) if no
 * config exists or fields are unspecified.
 */
function resolveContentConfig(): ContentConfig {
  const defaults: ContentConfig = { dir: PROJECT_ROOT, include: ['**/*.md'], exclude: [] };
  const configPath = resolve(PROJECT_ROOT, '.open-knowledge/config.yml');
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(raw) as Record<string, unknown> | null;
      const content = parsed?.content as Record<string, unknown> | undefined;
      if (typeof content?.dir === 'string') {
        defaults.dir = resolve(PROJECT_ROOT, content.dir);
      }
      if (Array.isArray(content?.include)) {
        const valid = (content.include as unknown[]).filter(
          (p): p is string => typeof p === 'string',
        );
        if (valid.length > 0) defaults.include = valid;
      }
      if (Array.isArray(content?.exclude)) {
        const valid = (content.exclude as unknown[]).filter(
          (p): p is string => typeof p === 'string',
        );
        if (valid.length > 0) defaults.exclude = valid;
      }
    } catch (err) {
      console.warn('[hocuspocus] Failed to parse config:', err);
    }
  }
  return defaults;
}

const contentConfig = resolveContentConfig();
// Resolution priority: OK_TEST_CONTENT_DIR env var (for isolated test runs —
// realpathSync resolves symlinks like /tmp → /private/tmp on macOS so the
// watcher and persistence layer agree on canonical paths) falls back to the
// config-driven workspace default.
const CONTENT_DIR = process.env.OK_TEST_CONTENT_DIR
  ? realpathSync(process.env.OK_TEST_CONTENT_DIR)
  : contentConfig.dir;
const CONTENT_ROOT = relative(PROJECT_ROOT, CONTENT_DIR);

// Ensure content dir exists before createServer/persistence/watcher touches it.
// Without this, fresh clones and worktrees crash on first write.
mkdirSync(CONTENT_DIR, { recursive: true });

// When test isolation is active, persistence's git integration is a liability —
// it tries to `git add <contentRoot>` in the worktree's .git, but contentRoot
// is an external tmpdir path starting with `../../..` which git refuses. Tests
// don't need git tracking of their throwaway content, so disable it outright.
// Also skip `ensureProjectGit` because Playwright worker tmpdirs have no
// `.git/` (seedRequiredFixtureFiles seeds only .md files); createServer's
// internal `initShadowRepo` will fail gracefully and push 'shadow-repo' into
// the `degraded` list.
const isTestIsolated = Boolean(process.env.OK_TEST_CONTENT_DIR);

// Singleton gate for lazy `createServer()` invocation. Instantiated on first
// `configureServer` call; reused on subsequent HMR re-invocations. Module-load
// is deliberately kept side-effect-free (beyond config resolution + mkdir) so
// `vite build` can load the plugin module without starting a file watcher
// that would keep the event loop alive past the bundle step.
let srv: ServerInstance | null = null;

// Keepalive grace-period threshold. Copied verbatim from boot.ts:244-396 per
// SPEC D5 LOCKED (copy, not extract — NG2 is the extraction vehicle). The
// const stays module-scope because it's not per-instance state; the mutable
// companions (timers, in-flight set, shuttingDown) are closure-scoped inside
// `configureServer` so each Vite dev-server instance gets fresh state
// (matches boot.ts's bootServer closure shape).
const KEEPALIVE_GRACE_MS = 10_000;

export function hocuspocusPlugin(): Plugin {
  return {
    name: 'hocuspocus',
    async configureServer(server) {
      // Per-invocation keepalive state. If Vite restarts the dev server
      // in-process (e.g. vite.config.ts edit), the OLD close handler sets
      // its own `shuttingDown = true` on its OWN binding; the NEW
      // configureServer call gets fresh `shuttingDown = false` so new
      // keepalive-grace timers on the new httpServer don't short-circuit
      // against a stale flag from the previous lifecycle. Matches boot.ts's
      // closure-scoped pattern (boot.ts:244-254).
      const keepaliveGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
      const keepaliveGraceInflight = new Set<Promise<void>>();
      let shuttingDown = false;

      configureServerInvocations += 1;
      if (configureServerInvocations > 1) {
        // Vite called `configureServer` a second time within the same module
        // lifetime. Not expected under `bun run dev` — log loud so a stuck-WS
        // report that correlates with this line points straight at the
        // re-invocation path. The singleton gate below reuses the existing
        // `srv` — we don't construct a second one.
        console.warn(
          `[collab] configureServer invoked ${configureServerInvocations}× — previous upgrade listener is orphaned. Filing this means Vite restarted without reloading the plugin module.`,
        );
      } else {
        console.info(`[collab] configureServer invocation=1 pid=${process.pid}`);
      }

      // SPEC D8 (amended): lazy init on first `configureServer` call. Guards
      // against (a) `vite build` loading the module and starting an event-loop-
      // keeping watcher, and (b) any other tool that imports this module for
      // factory inspection without running a dev server. HMR re-invocation
      // reuses the existing `srv`.
      if (!srv) {
        // SPEC D8 / D12: `ensureProjectGit` runs BEFORE `createServer()` so a
        // missing `git` binary or broken `.git/` fails `bun run dev` fast.
        // `createServer()` does NOT call `ensureProjectGit` internally — every
        // consumer (bootServer, integration test harness) calls it upstream.
        if (!isTestIsolated) {
          await ensureProjectGit(PROJECT_ROOT);
        }

        // SPEC D8 LOCKED: factory invoked lazily on first dev-server start
        // (amended from "module-load" per the D8 amendment in this file's
        // header). Same-pid lock acquisition is idempotent, so HMR re-entry
        // of this block would be safe — but the singleton gate above prevents
        // that anyway. Replaces ~11 primitives worth of hand-rolled wiring —
        // session manager, focus/presence/CC1 broadcasters, backlink index,
        // content filter, persistence/API/observer/live-derived-index
        // extensions, file watcher — plus four subsystems the old plugin was
        // missing entirely (principal auth, HEAD watcher, managed-rename
        // recovery, SyncEngine). See SPEC §1 for the full enumeration.
        srv = createServer({
          contentDir: CONTENT_DIR,
          projectDir: isTestIsolated ? CONTENT_DIR : PROJECT_ROOT,
          contentRoot: isTestIsolated ? '' : CONTENT_ROOT,
          gitEnabled: !isTestIsolated,
          includePatterns: contentConfig.include,
          excludePatterns: contentConfig.exclude,
          enableTestRoutes: true,
          quiet: true,
        });

        // SPEC D9 defense-in-depth: release the server lock on process exit
        // even if graceful `httpServer.close` never fires (crash, SIGKILL).
        // `srv.destroy()` releases the lock in its Phase 6; this sync handler
        // covers non-graceful exits. `releaseServerLock` is ownership-guarded.
        const lockDir = srv.lockDir;
        process.once('exit', () => {
          try {
            releaseServerLock(lockDir);
          } catch {
            // best-effort — most common cause is lock already released by
            // srv.destroy()
          }
        });

        console.log(`[hocuspocus] content dir: ${CONTENT_DIR}`);
        console.info(
          '[hocuspocus] using @inkeep/open-knowledge-server createServer() — dev-mode parity active',
        );
      }

      // Record the Vite dev-server port in the lock file so MCP discovery
      // can connect. `httpServer.address()` is only valid after bind, so we
      // wait for the `listening` event.
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        if (typeof addr === 'object' && addr !== null && srv) {
          updateServerLockPort(srv.lockDir, addr.port);
        }
      });

      const { hocuspocus, sessionManager, agentFocusBroadcaster, agentPresenceBroadcaster } = srv;

      const wss = new WebSocketServer({ noServer: true });
      wss.on('error', (err) => {
        console.error('[collab] WebSocketServer error:', err);
      });

      // Use prependListener to intercept /collab and /collab/keepalive BEFORE
      // Vite's HMR handler (which also processes upgrades).
      //
      // Instrumented because the `/collab` upgrade path is load-bearing for
      // the editor and has reported-but-non-reproducible failure modes where
      // the HTTP Upgrade handshake never completes (Chrome DevTools shows
      // Status: `(pending)` with 0 B received). The logs below pinpoint WHERE
      // in the chain a stuck connection halted:
      //
      //   `[collab] upgrade received …`     — event reached our listener.
      //   `[collab] handleUpgrade starting` — path matched, pre-ws handoff.
      //   `[collab] handleUpgrade threw …`  — sync throw (e.g. "handleUpgrade
      //                                      called twice with same socket")
      //                                      before the 101 response lands.
      //   `[collab] handshake complete …`   — 101 sent; hocuspocus takes over.
      //
      // If a user reports a stuck WS and none of these lines appear for the
      // offending connection, the upgrade never reached our listener (Vite
      // routing / token check / a listener installed earlier consumed it).
      server.httpServer?.prependListener('upgrade', (req, socket, head) => {
        if (!req.url?.startsWith('/collab')) return;

        console.info(
          `[collab] upgrade received url=${req.url} protocol=${req.headers['sec-websocket-protocol'] ?? 'none'} host=${req.headers.host ?? 'none'} origin=${req.headers.origin ?? 'none'}`,
        );

        // D-034 — MCP keep-alive channel. `ok mcp` holds a persistent WS to
        // `/collab/keepalive?connectionId=<id>` to register as an active
        // client (see packages/cli/src/mcp/keepalive.ts + boot.ts:255-396
        // for the prod mirror). Keepalive WS carries no traffic — its sole
        // purpose is to register an upgrade, and its close triggers the
        // grace-timer → session-cleanup flow (D28).
        //
        // MUST be routed as a bare WS (no hocuspocus.handleConnection)
        // because MCP never sends the sync-step-1 message Hocuspocus waits
        // for. Routing through hocuspocus would leave the MCP socket
        // half-initialized in the connection registry. This block mirrors
        // boot.ts's handler verbatim (SPEC D5 LOCKED — copy, not extract).
        if (req.url.startsWith('/collab/keepalive')) {
          socket.on('error', (err: NodeJS.ErrnoException) => {
            if (handleCollabSocketError(err)) return;
            console.error('[collab] MCP keepalive socket error:', err);
          });
          console.info(`[collab] keepalive handleUpgrade starting for ${req.url}`);
          try {
            wss.handleUpgrade(req, socket, head, (ws) => {
              // D27/D28: parse connectionId from URL query params. This id
              // drives identity-attribution session cleanup
              // (`closeAllForAgent` + `clearFocus`) and multi-agent-presence
              // cleanup (`clearPresence`). Legacy MCP clients that don't
              // send `connectionId` fall through to TTL-only cleanup (5s
              // filter on the client). Malformed URLs → null → no-op. The
              // parser enforces `AGENT_ID_RE` so CR/LF bytes or other
              // attacker-controlled chars never reach log fields or
              // broadcaster keys.
              const connectionId = parseKeepaliveConnectionId(req.url);

              // D28: if reconnecting within grace period, cancel the timer.
              if (connectionId) {
                const existing = keepaliveGraceTimers.get(connectionId);
                if (existing !== undefined) {
                  clearTimeout(existing);
                  keepaliveGraceTimers.delete(connectionId);
                  console.info(
                    `[keepalive] reconnect during grace — timer cancelled connectionId=${connectionId}`,
                  );
                }
              }

              console.info(`[collab] keepalive handshake complete for ${req.url}`);

              const pingTimer = setInterval(() => {
                try {
                  ws.ping();
                } catch {
                  // best-effort — a dead socket fires 'close' + 'error' which
                  // the handlers below clean up.
                }
              }, 30_000);
              pingTimer.unref?.();

              // Presence-ts refresh timer — tied to this WS's lifetime. The
              // client-side TTL filter hides entries with `now - ts >= 5s`.
              // Write-path calls (setPresence/touchMode) only fire on MCP
              // edits, so agents between tool calls (LLM thinking for 10-30s)
              // would otherwise have their badge disappear mid-session even
              // though the keepalive WS is still open. A 3s bump cadence
              // consistently beats the 5s filter. No-op if connectionId is
              // null (legacy MCP client — TTL-only path still works).
              //
              // `toBroadcasterKey(connectionId)` translates the raw URL id
              // to the `agent-<id>` map key used by HTTP write handlers.
              // Without this translation `bumpPresenceTs` would no-op because
              // no entry exists under the raw key — see the STOP rule in
              // AGENTS.md "the `agent-` prefix convention".
              const tsRefreshTimer = connectionId
                ? setInterval(() => {
                    agentPresenceBroadcaster?.bumpPresenceTs(toBroadcasterKey(connectionId));
                  }, 3_000)
                : null;
              tsRefreshTimer?.unref?.();

              ws.on('close', () => {
                clearInterval(pingTimer);
                if (tsRefreshTimer !== null) clearInterval(tsRefreshTimer);
                if (!connectionId) return;
                // D28: start grace timer. Reconnect within the window cancels above.
                const timer = setTimeout(() => {
                  keepaliveGraceTimers.delete(connectionId);
                  // If destroy already ran, skip — the sessionManager and
                  // broadcasters may be mid-teardown and calling into them
                  // would race (TOCTOU: timer fires between destroy's
                  // clearTimeout loop and the Hocuspocus teardown awaiting
                  // completion).
                  if (shuttingDown) return;
                  const work = (async () => {
                    console.info(
                      `[keepalive] grace expired — cleaning up sessions connectionId=${connectionId}`,
                    );
                    try {
                      await sessionManager.closeAllForAgent(connectionId);
                    } catch (err) {
                      console.error(
                        `[keepalive] closeAllForAgent failed connectionId=${connectionId}`,
                        err,
                      );
                    }
                    try {
                      agentFocusBroadcaster?.clearFocus(connectionId);
                    } catch (err) {
                      console.error(
                        `[keepalive] clearFocus failed connectionId=${connectionId}`,
                        err,
                      );
                    }
                    try {
                      // `toBroadcasterKey` matches the `agent-<id>` map key
                      // written by HTTP handlers via `extractAgentIdentity`
                      // — without this translation `clearPresence` no-ops
                      // because the raw URL id never matches the stored
                      // entry. See AGENTS.md "the `agent-` prefix convention".
                      agentPresenceBroadcaster?.clearPresence(toBroadcasterKey(connectionId));
                    } catch (err) {
                      console.error(
                        `[keepalive] clearPresence failed connectionId=${connectionId}`,
                        err,
                      );
                    }
                  })();
                  keepaliveGraceInflight.add(work);
                  work.finally(() => keepaliveGraceInflight.delete(work));
                }, KEEPALIVE_GRACE_MS);
                timer.unref?.();
                keepaliveGraceTimers.set(connectionId, timer);
                console.info(
                  `[keepalive] disconnected — grace timer started connectionId=${connectionId} graceMs=${KEEPALIVE_GRACE_MS}`,
                );
              });
              ws.on('error', (err: NodeJS.ErrnoException) => {
                if (!handleCollabSocketError(err)) {
                  console.error('[collab] keepalive WS error:', err);
                }
                ws.terminate();
              });
            });
          } catch (err) {
            console.error(`[collab] keepalive handleUpgrade threw for ${req.url}:`, err);
            try {
              socket.destroy();
            } catch {
              // already-destroyed sockets throw on destroy; swallow.
            }
          }
          return;
        }

        // /collab — regular browser HocuspocusProvider connections.
        //
        // Attach error handler on the raw TCP socket BEFORE handleUpgrade.
        // Without this, an ECONNRESET during/after upgrade emits an 'error'
        // event with no listener, which crashes the entire Node process.
        //
        // EPIPE/ECONNRESET are kernel-level TCP-teardown signals that
        // surface asynchronously after ws.send()/socket.write() has already
        // returned — no userspace pre-check can prevent them (see
        // websockets/ws#1017). Hocuspocus already filters by readyState in
        // Connection.send, so the only remaining visibility is catching +
        // classifying the async emission here. Drop the expected codes;
        // surface everything else.
        socket.on('error', (err: NodeJS.ErrnoException) => {
          if (handleCollabSocketError(err)) return;
          console.error('[collab] Upgrade socket error:', err);
        });

        console.info(`[collab] handleUpgrade starting for ${req.url}`);

        // `wss.handleUpgrade` throws synchronously if the socket was already
        // upgraded by another listener. Guard here so a repeat-upgrade
        // scenario logs the cause + tears down the socket cleanly instead
        // of leaving it half-attached and pending.
        try {
          wss.handleUpgrade(req, socket, head, (ws) => {
            const beforeCount = hocuspocus.getConnectionsCount?.() ?? -1;
            console.info(
              `[collab] handshake complete for ${req.url} (connections before=${beforeCount})`,
            );
            const clientConnection = hocuspocus.handleConnection(ws, req);
            ws.on('message', (data: ArrayBuffer | Buffer) => {
              clientConnection.handleMessage(
                data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data),
              );
            });
            ws.on('close', (code: number, reason: Buffer) => {
              clientConnection.handleClose({ code, reason: reason.toString() });
            });
            ws.on('error', (err: NodeJS.ErrnoException) => {
              if (!handleCollabSocketError(err)) {
                console.error('[collab] WebSocket error:', err);
              }
              ws.terminate();
            });
          });
        } catch (err) {
          console.error(`[collab] handleUpgrade threw for ${req.url}:`, err);
          try {
            socket.destroy();
          } catch {
            // already-destroyed sockets throw on destroy; swallow.
          }
        }
      });

      // Wire up API endpoints via Vite middleware.
      //
      // Unknown `/api/*` routes must NOT fall through to Vite's SPA fallback
      // (which would return index.html with a 200, confusing API clients
      // like MCP stdio that expect JSON). Any `/api/*` request that no
      // Hocuspocus onRequest handler consumed returns 404 JSON here.
      // Production behavior (packages/cli/src/commands/start.ts) naturally
      // 404s on unknown routes because there's no SPA fallback; this aligns
      // dev-mode with production.
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url?.startsWith('/api/')) {
          // `/api/config` — served directly by the dev plugin. In prod this
          // lives in `ok ui` (see packages/cli/src/commands/ui.ts); here the
          // dev server IS the UI host, so we answer with the same shape
          // using our own bound port. Must run before the Hocuspocus
          // onRequest dispatch so a mid-boot race (client fetch arrives
          // before any extension has claimed routes) still resolves a valid
          // collabUrl for the first `useCollabUrl` tick.
          if (url === '/api/config') {
            const addr = server.httpServer?.address();
            const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
            const response = computeDevApiConfigResponse(req.method, port);
            if (response) {
              for (const [name, value] of Object.entries(response.headers)) {
                res.setHeader(name, value);
              }
              res.statusCode = response.status;
              if (response.omitBody) {
                res.end();
              } else {
                res.end(response.body);
              }
              return;
            }
            // Method not GET/HEAD — fall through to the 404 JSON below.
          }
          // Let the Hocuspocus onRequest extensions handle API routes.
          // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
          await hocuspocus.hooks('onRequest', { request: req, response: res } as any);
          // A streaming handler (e.g. `/api/local-op/auth/login` NDJSON)
          // calls `res.writeHead(200)` and returns before `res.end()` runs,
          // so `writableEnded` is still false here while `headersSent` is
          // already true. Treat either as "a handler owns the response" and
          // skip the 404 fallback — otherwise `setHeader()` throws
          // ERR_HTTP_HEADERS_SENT.
          if (res.writableEnded || res.headersSent) return;
          // Unhandled /api/* route — return 404 JSON, do NOT fall through
          // to the SPA fallback which would return index.html.
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'API route not found', path: url }));
          return;
        }
        next();
      });

      // Filter-aware asset serving over contentDir. `srv.contentFilter` is
      // the same filter `createServer()` passes to the file watcher, so the
      // HTTP asset surface and the CRDT-loaded surface agree on what's
      // excluded.
      const contentFilter = srv.contentFilter;
      const contentSirv = sirv(CONTENT_DIR, { dev: true, dotfiles: false });
      server.middlewares.use((req, res, next) => {
        const rel = decodeURIComponent(req.url?.split('?')[0]?.replace(/^\//, '') ?? '');
        if (!rel || contentFilter.isExcluded(rel)) return next();
        res.setHeader('X-Content-Type-Options', 'nosniff');
        contentSirv(req, res, next);
      });

      // SPEC D9: tear down the full ServerInstance (watchers, CC1, agent
      // sessions, L1/L2 flush, shadow repo, server lock) when Vite closes
      // its HTTP server. Replaces the old per-subsystem cleanup (watcher
      // unsubscribe + cc1Broadcaster.destroy + systemDocConnection.disconnect)
      // which left Hocuspocus partially alive. `srv.destroy()` is idempotent.
      server.httpServer?.on('close', async () => {
        shuttingDown = true;
        // Cancel pending keepalive-grace timers so they don't fire against
        // a disposed sessionManager / broadcasters after destroy.
        for (const timer of keepaliveGraceTimers.values()) {
          clearTimeout(timer);
        }
        keepaliveGraceTimers.clear();
        if (keepaliveGraceInflight.size > 0) {
          await Promise.allSettled([...keepaliveGraceInflight]);
        }
        try {
          if (srv) {
            await srv.destroy();
          }
        } catch (err) {
          console.error('[hocuspocus] srv.destroy() failed:', err);
        }
      });

      console.log('[hocuspocus] WebSocket server ready on /collab');
      console.log('[hocuspocus] Agent write API at POST /api/agent-write');
      console.log('[hocuspocus] Agent markdown write API at POST /api/agent-write-md');
    },
  };
}
