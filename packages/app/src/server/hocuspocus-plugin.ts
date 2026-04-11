/**
 * Vite plugin that integrates Hocuspocus for dev mode.
 *
 * Uses @inkeep/open-knowledge-server for the core server logic.
 * This plugin wires Hocuspocus into Vite's HTTP/WS server so that
 * `bun run dev` starts everything in a single process.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { Hocuspocus } from '@hocuspocus/server';
import {
  AgentSessionManager,
  createApiExtension,
  createContentFilter,
  createExternalChangeHandler,
  createPersistenceExtension,
  startWatcher,
  type WatcherHandle,
} from '@inkeep/open-knowledge-server';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { parse as parseYaml } from 'yaml';

// Module-level watcher subscription — survives Vite HMR restarts so we can
// unsubscribe the previous instance before starting a new one.
let activeWatcher: WatcherHandle | null = null;

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
 * Falls back to defaults if no config exists or fields are unspecified.
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
const CONTENT_DIR = contentConfig.dir;
const CONTENT_ROOT = relative(PROJECT_ROOT, CONTENT_DIR);

// Ensure content dir exists before hocuspocus/persistence/watcher touches it.
// Without this, fresh clones and worktrees crash on first write.
mkdirSync(CONTENT_DIR, { recursive: true });

// Create content filter at module scope — unified exclusion (gitignore + config exclude)
const contentFilter = createContentFilter({
  projectDir: PROJECT_ROOT,
  contentDir: CONTENT_DIR,
  includePatterns: contentConfig.include,
  excludePatterns: contentConfig.exclude,
});

export const hocuspocus = new Hocuspocus({
  quiet: true,
  debounce: 2000,
  maxDebounce: 10000,
  extensions: [
    createPersistenceExtension({
      contentDir: CONTENT_DIR,
      projectDir: PROJECT_ROOT,
      contentRoot: CONTENT_ROOT,
    }).extension,
  ],
});

const sessionManager = new AgentSessionManager(hocuspocus);

// Add API extension — push directly rather than using hocuspocus.configure()
// which replaces the extensions array via spread, losing the persistence extension.
// enableTestRoutes is safe here: this plugin only runs under `vite dev` (local
// development), never in production builds. E2E tests rely on /api/test-reset.
hocuspocus.configuration.extensions.push(
  createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir: CONTENT_DIR,
    getFileIndex: () => (activeWatcher ? activeWatcher.getFileIndex() : new Map()),
    enableTestRoutes: true,
    projectRoot: PROJECT_ROOT,
    contentRoot: CONTENT_ROOT,
  }),
);

export function hocuspocusPlugin(): Plugin {
  return {
    name: 'hocuspocus',
    configureServer(server) {
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
          socket.on('error', (err: Error) => {
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
            ws.on('error', (err) => {
              console.error('[collab] WebSocket error:', err);
              ws.terminate();
            });
          });
        }
      });

      // Wire up API endpoints via Vite middleware
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url?.startsWith('/api/')) {
          // Let the Hocuspocus onRequest extensions handle API routes
          // biome-ignore lint/suspicious/noExplicitAny: Vite middleware types don't match Hocuspocus hook signature
          await hocuspocus.hooks('onRequest', { request: req, response: res } as any);
          if (res.writableEnded) return;
        }
        next();
      });

      // --- Disk bridge: watch content directory for external .md changes ---
      const handleExternalChange = createExternalChangeHandler(hocuspocus);

      (async () => {
        if (activeWatcher) {
          console.log('[hocuspocus] Unsubscribing previous file watcher (HMR restart)');
          await activeWatcher.unsubscribe();
          activeWatcher = null;
        }
        try {
          activeWatcher = await startWatcher(
            CONTENT_DIR,
            async (event) => {
              if (event.kind === 'update' || event.kind === 'create') {
                await handleExternalChange(event.docName, event.content);
              }
            },
            contentFilter,
          );
          server.httpServer?.on('close', async () => {
            if (activeWatcher) {
              await activeWatcher.unsubscribe();
              activeWatcher = null;
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
