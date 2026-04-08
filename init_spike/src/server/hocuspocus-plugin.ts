import { resolve } from 'node:path';
import {
  type DirectConnection,
  type Document,
  Hocuspocus,
  type LocalTransactionOrigin,
} from '@hocuspocus/server';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment } from '@tiptap/y-tiptap';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { stripFrontmatter } from '../editor/extensions/frontmatter';
import { sharedExtensions } from '../editor/extensions/shared';
import { startWatcher } from './file-watcher';
import { createPersistenceExtension } from './persistence';

/**
 * The DirectConnection class exposes `.document` at runtime but the exported
 * interface only declares `transact()` and `disconnect()`. We extend the
 * interface so we can access `document` (needed for `dc.document.transact()`
 * with a custom origin string and for awareness).
 */
interface AgentDirectConnection extends DirectConnection {
  document: Document;
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB
const CONTENT_DIR = resolve(
  import.meta.dirname ?? new URL('.', import.meta.url).pathname,
  '../../content',
);

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

export const hocuspocus = new Hocuspocus({
  quiet: true,
  debounce: 2000,
  maxDebounce: 10000,
  extensions: [createPersistenceExtension()],
});

// --- Persistent agent session model ---
// DirectConnections stay open for the agent's session lifetime.
// Awareness persists between transactions.
const agentSessions = new Map<string, AgentDirectConnection>();

/** Agent write origin — tracked by server-side UndoManager (US-007). */
export const AGENT_WRITE_ORIGIN = 'agent-write';

/**
 * Get or create a persistent agent DirectConnection for a document.
 * Sets agent awareness (name, color, type) on first open.
 */
async function getAgentSession(docName: string): Promise<AgentDirectConnection> {
  let dc = agentSessions.get(docName);
  if (!dc) {
    // Cast: the runtime DirectConnection class has `.document` but the
    // exported interface doesn't declare it. See AgentDirectConnection type above.
    dc = (await hocuspocus.openDirectConnection(docName)) as AgentDirectConnection;
    // Set agent presence (persists across transactions)
    dc.document.awareness.setLocalState({
      user: {
        name: 'Claude',
        color: '#D97757',
        type: 'agent',
        icon: 'claude',
        tabId: `agent-${Date.now()}`,
      },
      mode: 'idle',
    });
    agentSessions.set(docName, dc);
    console.log(`[agent-session] Created persistent session for: ${docName}`);
  }
  return dc;
}

/**
 * Disconnect and remove an agent session. Clears awareness before disconnect.
 */
async function closeAgentSession(docName: string): Promise<void> {
  const dc = agentSessions.get(docName);
  if (dc) {
    dc.document.awareness.setLocalState(null);
    await dc.disconnect();
    agentSessions.delete(docName);
    console.log(`[agent-session] Closed session for: ${docName}`);
  }
}

/**
 * Close all agent sessions. Used during test reset.
 */
async function closeAllAgentSessions(): Promise<void> {
  const entries = [...agentSessions.keys()];
  for (const docName of entries) {
    await closeAgentSession(docName);
  }
}

export function hocuspocusPlugin(): Plugin {
  return {
    name: 'hocuspocus',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });

      // Use prependListener to intercept /collab BEFORE Vite's HMR handler.
      server.httpServer?.prependListener('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/collab')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            // Hocuspocus v4: handleConnection returns a ClientConnection.
            // The caller must route WebSocket events to it.
            const clientConnection = hocuspocus.handleConnection(ws, req);
            ws.on('message', (data: ArrayBuffer | Buffer) => {
              clientConnection.handleMessage(
                data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data),
              );
            });
            ws.on('close', (code: number, reason: Buffer) => {
              clientConnection.handleClose({ code, reason: reason.toString() });
            });
          });
        }
      });

      // HTTP API for agent-sim DirectConnection writes
      // Migrated: XmlFragment → Y.Text writes (audit C2), conn.transact → dc.document.transact
      server.middlewares.use('/api/agent-write', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }

        try {
          const dc = await getAgentSession('test-doc');
          const timestamp = new Date().toISOString();
          const content = `Hello from the agent! ${timestamp}`;

          // Set awareness to 'editing' during write
          dc.document.awareness.setLocalStateField('mode', 'editing');

          // Use dc.document.transact() with 'agent-write' origin — NOT conn.transact()
          // which hardcodes origin to { source: 'local' }.
          // Write to Y.Text (not XmlFragment) — Observer B propagates to tree.
          dc.document.transact(() => {
            const ytext = dc.document.getText('source');
            const currentText = ytext.toString();
            const insertAt = currentText.length;
            const separator = currentText.trim() ? '\n\n' : '';
            ytext.insert(insertAt, `${separator}${content}\n`);

            // Activity map write INSIDE the same transaction (F1/C3 fix)
            const activityMap = dc.document.getMap('activity');
            activityMap.set('agent-1', {
              agentId: 'agent-1',
              timestamp: Date.now(),
              type: 'insert',
              description: `Added: ${content.slice(0, 50)}`,
            });
          }, AGENT_WRITE_ORIGIN);

          // Set awareness back to 'idle' after write
          dc.document.awareness.setLocalStateField('mode', 'idle');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, timestamp }));
        } catch (e) {
          console.error('[agent-write]', e);
          const message = e instanceof Error ? e.message : String(e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });

      // HTTP API for agent-sim markdown writes (unified write path)
      // Migrated: conn.transact → dc.document.transact with 'agent-write' origin
      server.middlewares.use('/api/agent-write-md', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }

        try {
          // Read request body with size limit
          const chunks: Buffer[] = [];
          let totalBytes = 0;
          for await (const chunk of req) {
            totalBytes += (chunk as Buffer).length;
            if (totalBytes > MAX_BODY_BYTES) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
              return;
            }
            chunks.push(chunk as Buffer);
          }

          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
            return;
          }

          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Body must be a JSON object' }));
            return;
          }

          const { markdown, position: pos } = body as Record<string, unknown>;
          if (!markdown || typeof markdown !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'markdown field required' }));
            return;
          }

          const position = pos === 'prepend' ? 'prepend' : 'append';
          const dc = await getAgentSession('test-doc');
          const timestamp = new Date().toISOString();

          // Set awareness to 'editing' during write
          dc.document.awareness.setLocalStateField('mode', 'editing');

          // Use dc.document.transact() with 'agent-write' origin — NOT conn.transact()
          // Direct Y.Text insertion — Observer B handles the tree update.
          dc.document.transact(() => {
            const ytext = dc.document.getText('source');
            const currentText = ytext.toString();

            if (position === 'prepend') {
              ytext.insert(0, `${markdown.trim()}\n\n`);
            } else {
              const insertAt = currentText.length;
              const separator = currentText.trim() ? '\n\n' : '';
              ytext.insert(insertAt, `${separator}${markdown.trim()}\n`);
            }

            // Activity map write INSIDE the same transaction (F1/C3 fix)
            const activityMap = dc.document.getMap('activity');
            activityMap.set('agent-1', {
              agentId: 'agent-1',
              timestamp: Date.now(),
              type: position === 'prepend' ? 'insert' : 'insert',
              description: `Added: ${markdown.trim().slice(0, 50)}`,
            });
          }, AGENT_WRITE_ORIGIN);

          // Set awareness back to 'idle' after write
          dc.document.awareness.setLocalStateField('mode', 'idle');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, timestamp }));
        } catch (e) {
          console.error('[agent-write-md]', e);
          const message = e instanceof Error ? e.message : String(e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });

      // --- Test reset endpoint: unload document for E2E test isolation ---
      server.middlewares.use('/api/test-reset', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }
        try {
          // Close agent sessions before closing connections
          await closeAllAgentSessions();
          hocuspocus.closeConnections('test-doc');
          const doc = hocuspocus.documents.get('test-doc');
          if (doc) await hocuspocus.unloadDocument(doc);
          // Reset the file to known content
          const { writeFileSync } = await import('node:fs');
          writeFileSync(resolve(CONTENT_DIR, 'test-doc.md'), '', 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });

      // --- Disk bridge: watch content directory for external .md changes ---
      async function handleExternalChange(docName: string, content: string): Promise<void> {
        try {
          // Strategy C: only sync documents already open in the browser
          const document = hocuspocus.documents.get(docName);
          if (!document) return;
          const { frontmatter, body } = stripFrontmatter(content);
          const parsedJson = mdManager.parse(body);
          const pmNode = schema.nodeFromJSON(parsedJson);
          const xmlFragment = document.getXmlFragment('default');

          // Layer 2: skipStoreHooks prevents persistence from re-writing the file
          // we just loaded from disk.
          document.transact(
            () => {
              const meta = { mapping: new Map(), isOMark: new Map() };
              updateYFragment(document, xmlFragment, pmNode, meta);
              const metaMap = document.getMap('metadata');
              metaMap.set('frontmatter', frontmatter);
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

      startWatcher(CONTENT_DIR, handleExternalChange)
        .then((subscription) => {
          server.httpServer?.on('close', () => subscription.unsubscribe());
        })
        .catch((err) => {
          console.error('[hocuspocus] Disk bridge watcher failed to start:', err);
        });

      console.log('[hocuspocus] WebSocket server ready on /collab');
      console.log('[hocuspocus] Agent write API at POST /api/agent-write');
      console.log('[hocuspocus] Agent markdown write API at POST /api/agent-write-md');
    },
  };
}
