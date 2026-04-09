/**
 * Vite plugin that integrates Hocuspocus for dev mode.
 *
 * Uses @inkeep/open-knowledge-server for the core server logic.
 * This plugin wires Hocuspocus into Vite's HTTP/WS server so that
 * `bun run dev` starts everything in a single process.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hocuspocus, type LocalTransactionOrigin } from '@hocuspocus/server';
import { sharedExtensions, stripFrontmatter } from '@inkeep/open-knowledge-core';
import {
  AgentSessionManager,
  type AsyncSubscription,
  createApiExtension,
  createPersistenceExtension,
  startWatcher,
} from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment } from '@tiptap/y-tiptap';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';

// Module-level watcher subscription — survives Vite HMR restarts so we can
// unsubscribe the previous instance before starting a new one.
let activeWatcher: AsyncSubscription | null = null;

const CONTENT_DIR = resolve(
  import.meta.dirname ?? new URL('.', import.meta.url).pathname,
  '../../../content',
);

// Ensure content dir exists before hocuspocus/persistence/watcher touches it.
// Without this, fresh clones and worktrees crash on first write.
mkdirSync(CONTENT_DIR, { recursive: true });

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

export const hocuspocus = new Hocuspocus({
  quiet: true,
  debounce: 2000,
  maxDebounce: 10000,
  extensions: [
    createPersistenceExtension({
      contentDir: CONTENT_DIR,
      projectDir: resolve(CONTENT_DIR, '..'),
    }),
  ],
});

const sessionManager = new AgentSessionManager(hocuspocus);

// Add API extension for HTTP endpoints
hocuspocus.configure({
  extensions: [
    createApiExtension({
      hocuspocus,
      sessionManager,
      contentDir: CONTENT_DIR,
    }),
  ],
});

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
      async function handleExternalChange(docName: string, content: string): Promise<void> {
        try {
          const document = hocuspocus.documents.get(docName);
          if (!document) return;
          const { frontmatter, body } = stripFrontmatter(content);
          const parsedJson = mdManager.parse(body);
          const pmNode = schema.nodeFromJSON(parsedJson);
          const xmlFragment = document.getXmlFragment('default');

          document.transact(
            () => {
              const meta = { mapping: new Map(), isOMark: new Map() };
              updateYFragment(document, xmlFragment, pmNode, meta);
              const metaMap = document.getMap('metadata');
              metaMap.set('frontmatter', frontmatter);

              const ytext = document.getText('source');
              const currentText = ytext.toString();
              if (currentText !== content) {
                ytext.delete(0, currentText.length);
                ytext.insert(0, content);
              }
            },
            {
              source: 'local',
              skipStoreHooks: true,
              context: { origin: 'file-watcher' },
            } satisfies LocalTransactionOrigin,
          );

          console.log(`[file-watcher] Applied external change: ${docName}`);
        } catch (err) {
          console.error(`[file-watcher] Failed to apply external change for ${docName}:`, err);
        }
      }

      (async () => {
        if (activeWatcher) {
          console.log('[hocuspocus] Unsubscribing previous file watcher (HMR restart)');
          await activeWatcher.unsubscribe();
          activeWatcher = null;
        }
        try {
          activeWatcher = await startWatcher(CONTENT_DIR, handleExternalChange);
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
