import { Hocuspocus } from '@hocuspocus/server';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { sharedExtensions } from '../editor/extensions/shared';
import { createPersistenceExtension } from './persistence';

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
            hocuspocus.handleConnection(ws, req);
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

          await conn.transact((doc) => {
            const fragment = doc.getXmlFragment('default');
            const paragraph = new Y.XmlElement('paragraph');
            const text = new Y.XmlText();
            text.applyDelta([{ insert: `Hello from the agent! ${timestamp}` }]);
            paragraph.insert(0, [text]);
            fragment.push([paragraph]);
          });

          await conn.disconnect();

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
          // Read request body
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString()) as {
            markdown: string;
            position?: 'append' | 'prepend';
          };

          if (!body.markdown || typeof body.markdown !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'markdown field required' }));
            return;
          }

          const position = body.position ?? 'append';
          const conn = await hocuspocus.openDirectConnection('test-doc');
          const timestamp = new Date().toISOString();

          const mdManager = new MarkdownManager({ extensions: sharedExtensions });
          const editorSchema = getSchema(sharedExtensions);

          await conn.transact((doc) => {
            const fragment = doc.getXmlFragment('default');

            // Serialize current content to markdown
            const currentJson = yXmlFragmentToProsemirrorJSON(fragment);
            const currentMarkdown = mdManager.serialize(currentJson);

            // Splice agent's markdown at the specified position
            let combined: string;
            if (position === 'prepend') {
              combined = `${body.markdown.trim()}\n\n${currentMarkdown.trim()}\n`;
            } else {
              combined = currentMarkdown.trim()
                ? `${currentMarkdown.trim()}\n\n${body.markdown.trim()}\n`
                : `${body.markdown.trim()}\n`;
            }

            // Parse combined markdown → ProseMirror node → updateYFragment
            const parsedJson = mdManager.parse(combined);
            const pmNode = editorSchema.nodeFromJSON(parsedJson);
            const meta = { mapping: new Map(), isOMark: new Map() };
            updateYFragment(doc, fragment, pmNode, meta);
          });

          await conn.disconnect();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, timestamp }));
        } catch (e) {
          console.error('[agent-write-md]', e);
          const message = e instanceof Error ? e.message : String(e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });

      console.log('[hocuspocus] WebSocket server ready on /collab');
      console.log('[hocuspocus] Agent write API at POST /api/agent-write');
      console.log('[hocuspocus] Agent markdown write API at POST /api/agent-write-md');
    },
  };
}
