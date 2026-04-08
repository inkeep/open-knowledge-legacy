import { resolve } from 'node:path';
import { Hocuspocus, type LocalTransactionOrigin } from '@hocuspocus/server';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment } from '@tiptap/y-tiptap';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { stripFrontmatter } from '../editor/extensions/frontmatter';
import { sharedExtensions } from '../editor/extensions/shared';
import { startWatcher } from './file-watcher';
import { createPersistenceExtension } from './persistence';

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
      server.middlewares.use('/api/agent-write', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }

        try {
          const conn = await hocuspocus.openDirectConnection('test-doc');
          const timestamp = new Date().toISOString();

          try {
            await conn.transact((doc) => {
              const fragment = doc.getXmlFragment('default');
              const paragraph = new Y.XmlElement('paragraph');
              const text = new Y.XmlText();
              text.applyDelta([{ insert: `Hello from the agent! ${timestamp}` }]);
              paragraph.insert(0, [text]);
              fragment.push([paragraph]);
            });
          } finally {
            await conn.disconnect();
          }

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
          const conn = await hocuspocus.openDirectConnection('test-doc');
          const timestamp = new Date().toISOString();

          try {
            // Direct Y.Text insertion — Observer B handles the tree update.
            // Simpler than serialize→splice→parse→updateYFragment, and preserves
            // per-character CRDT IDs in the inserted text.
            await conn.transact((doc) => {
              const ytext = doc.getText('source');
              const currentText = ytext.toString();

              if (position === 'prepend') {
                ytext.insert(0, `${markdown.trim()}\n\n`);
              } else {
                const insertAt = currentText.length;
                const separator = currentText.trim() ? '\n\n' : '';
                ytext.insert(insertAt, `${separator}${markdown.trim()}\n`);
              }
            });
          } finally {
            await conn.disconnect();
          }

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

      startWatcher(CONTENT_DIR, handleExternalChange).then((subscription) => {
        server.httpServer?.on('close', () => subscription.unsubscribe());
      }).catch((err) => {
        console.error('[hocuspocus] Disk bridge watcher failed to start:', err);
      });

      console.log('[hocuspocus] WebSocket server ready on /collab');
      console.log('[hocuspocus] Agent write API at POST /api/agent-write');
      console.log('[hocuspocus] Agent markdown write API at POST /api/agent-write-md');
    },
  };
}
