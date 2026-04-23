/**
 * Vite plugin that integrates Hocuspocus for dev mode.
 *
 * Uses @inkeep/open-knowledge-server for the core server logic.
 * This plugin wires Hocuspocus into Vite's HTTP/WS server so that
 * `bun run dev` starts everything in a single process.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { Hocuspocus } from '@hocuspocus/server';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import {
  AgentFocusBroadcaster,
  AgentPresenceBroadcaster,
  AgentSessionManager,
  acquireServerLock,
  BacklinkIndex,
  CC1Broadcaster,
  createApiExtension,
  createContentFilter,
  createExternalChangeHandler,
  createLiveDerivedIndexExtension,
  createPersistenceExtension,
  createServerObserverExtension,
  handleCollabSocketError,
  loadPrincipal,
  type Principal,
  readBranchFromHead,
  releaseServerLock,
  type ShadowRef,
  SYSTEM_DOC_NAME,
  startWatcher,
  updateServerLockPort,
  type WatcherHandle,
} from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import sirv from 'sirv';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { parse as parseYaml } from 'yaml';
import { computeDevApiConfigResponse } from './api-config-handler.ts';
import { runDevShadowInit } from './dev-shadow-init.ts';

// Module-level watcher subscription — survives Vite HMR restarts so we can
// unsubscribe the previous instance before starting a new one.
let activeWatcher: WatcherHandle | null = null;

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

// When test isolation is active (OK_TEST_CONTENT_DIR set), persistence and
// the shadow repo operate against the per-worker tmpdir rather than the
// developer's checkout. See dev-shadow-init.ts for init-error handling.
const isTestIsolated = Boolean(process.env.OK_TEST_CONTENT_DIR);

// Single binding for every `PROJECT_ROOT`-derived call site in this module
// (D12 in specs/2026-04-22-per-worker-shadow-repo-test-harness/). Under
// isolation, points at the tmpdir so shadow repo, backlink cache, branch
// reads, server-lock metadata, and save-version all land in the per-worker
// sandbox — never in the developer's actual checkout. Adding a new
// PROJECT_ROOT consumer elsewhere is an obviously wrong pattern; thread
// through `projectRoot` instead.
const projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT;

const CONTENT_ROOT = relative(projectRoot, CONTENT_DIR);

// Ensure content dir exists before hocuspocus/persistence/watcher touches it.
// Without this, fresh clones and worktrees crash on first write.
mkdirSync(CONTENT_DIR, { recursive: true });

// V0-1: server-level lock. Acquire BEFORE spinning up Hocuspocus, watcher, etc.
// Same contract as `createServer` uses in the CLI — collides fast with a running
// `open-knowledge start` in the same contentDir. Port is rewritten in
// `configureServer` once Vite tells us what port the dev server bound to.
// HMR restarts in the same process are idempotent (same pid).
const LOCK_DIR = resolve(CONTENT_DIR, '.open-knowledge');
try {
  acquireServerLock(LOCK_DIR, { port: 0, worktreeRoot: projectRoot });
} catch (err) {
  console.error(`\n[hocuspocus] ${err instanceof Error ? err.message : String(err)}\n`);
  throw err;
}

// Release on process exit even if Vite's shutdown path doesn't call the plugin's
// close hook. `releaseServerLock` is ownership-guarded — only removes our lock.
// Registered BEFORE any throwable init below so the exit event covers module-load
// crashes too; the init block additionally releases explicitly in its catch.
let vitePluginShuttingDown = false;
const viteShutdownHandler = () => {
  if (vitePluginShuttingDown) return;
  vitePluginShuttingDown = true;
  try {
    releaseServerLock(LOCK_DIR);
  } catch (err) {
    console.error('[hocuspocus] Failed to release server lock:', err);
  }
};
process.once('SIGINT', viteShutdownHandler);
process.once('SIGTERM', viteShutdownHandler);
process.once('exit', viteShutdownHandler);

console.log(`[hocuspocus] content dir: ${CONTENT_DIR}`);

// Shadow repo — initialized lazily. Deferred ref pattern matches standalone.ts.
// SPEC 2026-04-21-shadow-repo-single-mode R2 / D12: ensureProjectGit runs BEFORE
// initShadowRepo so a missing `git` binary fails the dev server fast instead of
// leaving the shadow in a degraded state. Core pipeline + error dispatch live in
// `./dev-shadow-init.ts` so the fail-fast / degraded branches are unit-tested.
//
// Shadow init runs UNCONDITIONALLY now (per specs/2026-04-22-per-worker-shadow-
// repo-test-harness D2 Playwright default-on) — every worker's tmpdir gets a
// real shadow at `<tmpdir>/.git/open-knowledge/`. Under isolation, all
// shadow-init errors (not just ProjectGitInitError) fail-fast via D13 so
// silent shadow gaps never hide coverage regressions.
const shadowRef: ShadowRef = { current: undefined };
void runDevShadowInit(
  projectRoot,
  (shadow) => {
    shadowRef.current = shadow;
  },
  { isTestIsolated },
);

// All throwable module-scope init runs inside this try. If anything fails we
// release the lock synchronously before re-throwing, so a subsequent `bun run
// dev` doesn't collide with an orphaned lock. Bindings are declared `let` so
// consumers downstream in this module (and the exported `hocuspocus`) can read
// them post-init.
let contentFilter: ReturnType<typeof createContentFilter>;
let backlinkIndex: BacklinkIndex;
let hocuspocus: Hocuspocus;
let sessionManager: AgentSessionManager;
let persistence: ReturnType<typeof createPersistenceExtension>;
let systemDocConnection: Awaited<ReturnType<Hocuspocus['openDirectConnection']>> | null = null;
let cc1Broadcaster: CC1Broadcaster;

// Loaded async after init; Vite dev / Playwright must hit /api/principal
// without 404 so the browser tab-identity fetch in main.tsx can resolve.
// Initial value is null so the getter returns null until the async load
// completes (within tens of ms of module init).
let loadedPrincipal: Principal | null = null;

function signalChannel(channel: 'files' | 'backlinks' | 'graph'): void {
  cc1Broadcaster.signal(channel);
}

try {
  contentFilter = createContentFilter({
    projectDir: projectRoot,
    contentDir: CONTENT_DIR,
    includePatterns: contentConfig.include,
    excludePatterns: contentConfig.exclude,
  });
  backlinkIndex = new BacklinkIndex({
    projectDir: projectRoot,
    contentDir: CONTENT_DIR,
    contentFilter,
  });

  persistence = createPersistenceExtension({
    contentDir: CONTENT_DIR,
    projectDir: projectRoot,
    contentRoot: isTestIsolated ? '' : CONTENT_ROOT,
    gitEnabled: true,
    shadowRef,
    backlinkIndex,
    getCurrentBranch: () => readBranchFromHead(resolve(projectRoot, '.git')),
    getPrincipal: () => loadedPrincipal,
  });

  hocuspocus = new Hocuspocus({
    quiet: true,
    debounce: 2000,
    maxDebounce: 10000,
    extensions: [persistence.extension],
  });

  sessionManager = new AgentSessionManager(hocuspocus);
  cc1Broadcaster = new CC1Broadcaster(hocuspocus);
  // Agent focus + presence broadcasters — both must be wired in dev-mode too,
  // otherwise the browser receives no agentFocus (identity-attribution spec)
  // or agentPresence (multi-agent-presence SPEC FR-2/FR-3) updates when agents
  // POST /api/agent-write-md. Both primitives coexist on __system__ awareness
  // (different map slots).
  const agentFocusBroadcaster = new AgentFocusBroadcaster(hocuspocus);
  const agentPresenceBroadcaster = new AgentPresenceBroadcaster(hocuspocus);
  const liveDerivedIndexExtension = createLiveDerivedIndexExtension({
    backlinkIndex,
    signalChannel,
  });
  hocuspocus.configuration.extensions.push(liveDerivedIndexExtension);

  hocuspocus.configuration.extensions.push(
    createApiExtension({
      hocuspocus,
      sessionManager,
      contentDir: CONTENT_DIR,
      getFileIndex: () => (activeWatcher ? activeWatcher.getFileIndex() : new Map()),
      getAliasMap: () => (activeWatcher ? activeWatcher.getAliasMap() : new Map()),
      enableTestRoutes: true,
      contentRoot: isTestIsolated ? '' : CONTENT_ROOT,
      shadowRef,
      flushGitCommit: () => persistence.flushPendingGitCommit(),
      getCurrentBranch: () => readBranchFromHead(resolve(projectRoot, '.git')),
      backlinkIndex,
      signalChannel,
      agentFocusBroadcaster,
      agentPresenceBroadcaster,
      projectDir: projectRoot,
      getPrincipal: () => loadedPrincipal,
    }),
  );

  // Load principal asynchronously so /api/principal returns 200 in dev and
  // Playwright, mirroring the CLI path in standalone.ts:931. We do not block
  // extension wiring on this — the endpoint returns 404 for the brief window
  // before load, matching production behavior.
  void loadPrincipal(CONTENT_DIR)
    .then((p) => {
      loadedPrincipal = p;
    })
    .catch((err) => {
      console.warn('[hocuspocus] principal load failed:', err);
    });

  const pluginMdManager = new MarkdownManager({ extensions: sharedExtensions });
  const pluginSchema = getSchema(sharedExtensions);
  hocuspocus.configuration.extensions.push(
    createServerObserverExtension({
      mdManager: pluginMdManager,
      schema: pluginSchema,
      shadowRef,
      contentRoot: isTestIsolated ? '' : CONTENT_ROOT,
      getCurrentBranch: () => readBranchFromHead(resolve(projectRoot, '.git')),
    }),
  );
} catch (err) {
  try {
    releaseServerLock(LOCK_DIR);
  } catch (releaseErr) {
    console.error('[hocuspocus] Failed to release server lock during init rollback:', releaseErr);
  }
  throw err;
}

export function hocuspocusPlugin(): Plugin {
  return {
    name: 'hocuspocus',
    configureServer(server) {
      configureServerInvocations += 1;
      if (configureServerInvocations > 1) {
        // Detected: Vite called `configureServer` a second time within the
        // same module lifetime. Not expected under `bun run dev` — log loud
        // so a stuck-WS report that correlates with this line points straight
        // at the re-invocation path.
        console.warn(
          `[collab] configureServer invoked ${configureServerInvocations}× — previous upgrade listener is orphaned. Filing this means Vite restarted without reloading the plugin module.`,
        );
      } else {
        console.info(`[collab] configureServer invocation=1 pid=${process.pid}`);
      }

      // V0-1: record the Vite dev-server port in the lock file so MCP discovery
      // can connect. httpServer.address() is only valid after bind, so we wait
      // for the 'listening' event.
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        if (typeof addr === 'object' && addr !== null) {
          updateServerLockPort(LOCK_DIR, addr.port);
        }
      });

      const wss = new WebSocketServer({ noServer: true });

      // Prevent wss-level errors from bubbling up as unhandled.
      wss.on('error', (err) => {
        console.error('[collab] WebSocketServer error:', err);
      });

      // Use prependListener to intercept /collab BEFORE Vite's HMR handler.
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

        // Attach error handler on the raw TCP socket BEFORE handleUpgrade.
        // Without this, an ECONNRESET during/after upgrade emits an 'error'
        // event with no listener, which crashes the entire Node process.
        //
        // EPIPE/ECONNRESET are kernel-level TCP-teardown signals that
        // surface asynchronously after ws.send()/socket.write() has already
        // returned — no userspace pre-check can prevent them (see
        // websockets/ws#1017). Hocuspocus already filters by readyState in
        // Connection.send (packages/server/src/Connection.ts), so the only
        // remaining visibility is catching + classifying the async emission
        // here. Drop the expected codes; surface everything else.
        socket.on('error', (err: NodeJS.ErrnoException) => {
          if (handleCollabSocketError(err)) return;
          console.error('[collab] Upgrade socket error:', err);
        });

        // D-034 — MCP keep-alive channel. `ok mcp` holds a persistent WS to
        // `/collab/keepalive?pid=<mcp-pid>` so idle-shutdown counts the MCP
        // session as an active client (see packages/cli/src/mcp/keepalive.ts
        // + packages/server/src/boot.ts:210-235 for the prod mirror). The WS
        // carries no traffic — its sole purpose is to register as an upgrade.
        //
        // MUST be routed as a bare WS (no hocuspocus.handleConnection) because
        // MCP never sends the sync-step-1 message Hocuspocus waits for. Before
        // this branch, dev routed the keepalive into Hocuspocus, which left the
        // MCP socket in a half-initialized state in Hocuspocus's connection
        // registry — load-bearing for Dima's stuck-/collab-WS report where a
        // real browser connect coexisted with a Claude-Code-spawned MCP
        // process's keepalive. Matches the prod branch exactly so dev/prod
        // parity holds for anyone testing `ok mcp` against the dev server.
        if (req.url.startsWith('/collab/keepalive')) {
          console.info(`[collab] keepalive handleUpgrade starting for ${req.url}`);
          try {
            wss.handleUpgrade(req, socket, head, (ws) => {
              console.info(`[collab] keepalive handshake complete for ${req.url}`);
              const pingTimer = setInterval(() => {
                try {
                  ws.ping();
                } catch {
                  // best-effort — a dead socket will fire 'close' + 'error'
                  // which the handlers below clean up.
                }
              }, 30_000);
              pingTimer.unref?.();
              ws.on('close', () => clearInterval(pingTimer));
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

        console.info(`[collab] handleUpgrade starting for ${req.url}`);

        // `wss.handleUpgrade` throws synchronously if the socket was already
        // upgraded by another listener (ws library check at
        // websockets/ws#2.8+ L15893 / "handleUpgrade called more than once").
        // Previously the throw propagated out of the listener callback —
        // Node's EventEmitter surfaces that as an uncaught error. Guarding
        // here so a repeat-upgrade scenario logs the cause + tears down the
        // socket cleanly instead of leaving it half-attached and pending.
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
            // already-destroyed sockets throw on destroy; swallow — the log
            // above already captured the underlying issue.
          }
        }
      });

      // Wire up API endpoints via Vite middleware.
      //
      // Unknown `/api/*` routes must NOT fall through to Vite's SPA
      // fallback (which would return index.html with a 200, confusing API
      // clients like MCP stdio that expect JSON). Any `/api/*` request that
      // no Hocuspocus onRequest handler consumed returns 404 JSON here.
      // Production behavior (packages/cli/src/commands/start.ts) naturally
      // 404s on unknown routes because there's no SPA fallback; this aligns
      // dev-mode with production.
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url?.startsWith('/api/')) {
          // `/api/config` — served directly by the dev plugin. In prod this
          // lives in `ok ui` (see packages/cli/src/commands/ui.ts); here the
          // dev server IS the UI host, so we answer with the same shape using
          // our own bound port. Must run before the Hocuspocus onRequest
          // dispatch so a mid-boot race (client fetch arrives before any
          // extension has claimed routes) still resolves a valid collabUrl
          // for the first `useCollabUrl` tick.
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
          // Let the Hocuspocus onRequest extensions handle API routes
          // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
          await hocuspocus.hooks('onRequest', { request: req, response: res } as any);
          // A streaming handler (e.g. `/api/local-op/auth/login` NDJSON) calls
          // `res.writeHead(200)` and returns before `res.end()` runs, so
          // `writableEnded` is still false here while `headersSent` is already
          // true. Treat either as "a handler owns the response" and skip the
          // 404 fallback — otherwise `setHeader()` throws ERR_HTTP_HEADERS_SENT.
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

      // --- Filter-aware asset serving over contentDir (D9) ---
      const contentSirv = sirv(CONTENT_DIR, { dev: true, dotfiles: false });
      server.middlewares.use((req, res, next) => {
        const rel = decodeURIComponent(req.url?.split('?')[0]?.replace(/^\//, '') ?? '');
        if (!rel || contentFilter.isExcluded(rel)) return next();
        res.setHeader('X-Content-Type-Options', 'nosniff');
        contentSirv(req, res, next);
      });

      // --- Disk bridge: watch content directory for external .md changes ---
      const handleExternalChange = createExternalChangeHandler(hocuspocus);

      (async () => {
        try {
          if (!systemDocConnection) {
            try {
              systemDocConnection = await hocuspocus.openDirectConnection(SYSTEM_DOC_NAME);
            } catch (err) {
              console.error('[hocuspocus] Failed to open __system__ direct connection:', err);
            }
          }
          if (activeWatcher) {
            console.log('[hocuspocus] Unsubscribing previous file watcher (HMR restart)');
            const prev = activeWatcher;
            activeWatcher = null;
            await prev.unsubscribe();
          }
          activeWatcher = await startWatcher(
            CONTENT_DIR,
            async (event) => {
              if (event.kind === 'update' || event.kind === 'create') {
                backlinkIndex.updateDocumentFromMarkdown(event.docName, event.content);
                if (event.kind === 'create') {
                  signalChannel('files');
                  signalChannel('backlinks');
                  signalChannel('graph');
                } else {
                  signalChannel('backlinks');
                  signalChannel('graph');
                }
                await handleExternalChange(event.docName, event.content);
              } else if (event.kind === 'delete') {
                backlinkIndex.deleteDocument(event.docName);
                signalChannel('files');
                signalChannel('backlinks');
                signalChannel('graph');
              } else if (event.kind === 'rename') {
                backlinkIndex.renameDocument(event.oldDocName, event.newDocName, event.content);
                signalChannel('files');
                signalChannel('backlinks');
                signalChannel('graph');
              } else if (event.kind === 'conflict') {
                backlinkIndex.updateDocumentFromMarkdown(event.docName, event.content);
                signalChannel('backlinks');
                signalChannel('graph');
              }
              void backlinkIndex.saveToDisk().catch((err: unknown) => {
                console.warn('[hocuspocus] Failed to persist backlink cache:', err);
              });
            },
            contentFilter,
          );
          backlinkIndex.rebuildFromDisk();
          void backlinkIndex.saveToDisk().catch((err: unknown) => {
            console.warn('[hocuspocus] Failed to persist startup backlink cache:', err);
          });
          server.httpServer?.on('close', async () => {
            if (activeWatcher) {
              await activeWatcher.unsubscribe();
              activeWatcher = null;
            }
            cc1Broadcaster.destroy();
            if (systemDocConnection) {
              await systemDocConnection.disconnect();
              systemDocConnection = null;
            }
          });
        } catch (err) {
          console.error('[hocuspocus] Disk bridge watcher failed to start:', err);
        }
      })();

      console.log('[hocuspocus] WebSocket server ready on /collab');
      console.log('[hocuspocus] Agent write API at POST /api/agent-write');
      console.log('[hocuspocus] Agent markdown write API at POST /api/agent-write-md');
    },
  };
}
