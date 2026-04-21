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
  initShadowRepo,
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

// Module-level watcher subscription — survives Vite HMR restarts so we can
// unsubscribe the previous instance before starting a new one.
let activeWatcher: WatcherHandle | null = null;

// Resolve project root (directory containing .open-knowledge/)
const PLUGIN_DIR = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
const PROJECT_ROOT = resolve(PLUGIN_DIR, '../../../..');

// Vite evaluates this module during both `vite dev` and `vite build`. The
// `configureServer` hook below only fires in dev, so during build every
// module-scope side effect is waste — most are harmless (new Hocuspocus
// doesn't bind a port, watcher starts lazily in configureServer) but the
// server-lock acquisition actively collides with any running dev server
// that holds the lock in the same contentDir, breaking `turbo run test`
// when `app#build` runs as a dependency. Gate the lock specifically.
const IS_BUILD_MODE = process.argv.some((a) => a === 'build');

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

// Ensure content dir exists before hocuspocus/persistence/watcher touches it.
// Without this, fresh clones and worktrees crash on first write.
mkdirSync(CONTENT_DIR, { recursive: true });

// V0-1: server-level lock. Acquire BEFORE spinning up Hocuspocus, watcher, etc.
// Same contract as `createServer` uses in the CLI — collides fast with a running
// `open-knowledge start` in the same contentDir. Port is rewritten in
// `configureServer` once Vite tells us what port the dev server bound to.
// HMR restarts in the same process are idempotent (same pid).
const LOCK_DIR = resolve(CONTENT_DIR, '.open-knowledge');
if (!IS_BUILD_MODE) {
  try {
    acquireServerLock(LOCK_DIR, { port: 0, worktreeRoot: PROJECT_ROOT });
  } catch (err) {
    console.error(`\n[hocuspocus] ${err instanceof Error ? err.message : String(err)}\n`);
    throw err;
  }
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

// When test isolation is active, persistence's git integration is a liability —
// it tries to `git add <contentRoot>` in the worktree's .git, but contentRoot is
// an external tmpdir path starting with `../../..` which git refuses. Tests don't
// need git tracking of their throwaway content, so disable it outright.
const isTestIsolated = Boolean(process.env.OK_TEST_CONTENT_DIR);

// Shadow repo — initialized lazily. Deferred ref pattern matches standalone.ts.
const shadowRef: ShadowRef = { current: undefined };
if (!isTestIsolated) {
  initShadowRepo(PROJECT_ROOT)
    .then((shadow) => {
      shadowRef.current = shadow;
      console.log(`[dev] Shadow repo initialized at ${shadow.gitDir}`);
    })
    .catch((e) => {
      console.warn('[dev] Shadow repo init failed (timeline features unavailable):', e);
    });
}

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

function signalChannel(channel: 'files' | 'backlinks' | 'graph'): void {
  cc1Broadcaster.signal(channel);
}

try {
  contentFilter = createContentFilter({
    projectDir: process.env.OK_TEST_CONTENT_DIR ? CONTENT_DIR : PROJECT_ROOT,
    contentDir: CONTENT_DIR,
    includePatterns: contentConfig.include,
    excludePatterns: contentConfig.exclude,
  });
  backlinkIndex = new BacklinkIndex({
    projectDir: PROJECT_ROOT,
    contentDir: CONTENT_DIR,
    contentFilter,
  });

  persistence = createPersistenceExtension({
    contentDir: CONTENT_DIR,
    projectDir: isTestIsolated ? CONTENT_DIR : PROJECT_ROOT,
    contentRoot: isTestIsolated ? '' : CONTENT_ROOT,
    gitEnabled: !isTestIsolated,
    shadowRef,
    backlinkIndex,
    getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git')),
  });

  hocuspocus = new Hocuspocus({
    quiet: true,
    debounce: 2000,
    maxDebounce: 10000,
    extensions: [persistence.extension],
  });

  sessionManager = new AgentSessionManager(hocuspocus);
  cc1Broadcaster = new CC1Broadcaster(hocuspocus);
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
      getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git')),
      backlinkIndex,
      signalChannel,
    }),
  );

  const pluginMdManager = new MarkdownManager({ extensions: sharedExtensions });
  const pluginSchema = getSchema(sharedExtensions);
  hocuspocus.configuration.extensions.push(
    createServerObserverExtension({
      mdManager: pluginMdManager,
      schema: pluginSchema,
      shadowRef,
      contentRoot: isTestIsolated ? '' : CONTENT_ROOT,
      getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git')),
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
      server.httpServer?.prependListener('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/collab')) {
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

          wss.handleUpgrade(req, socket, head, (ws) => {
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
