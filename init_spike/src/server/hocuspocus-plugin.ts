import { Hocuspocus } from '@hocuspocus/server';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
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
          const message = e instanceof Error ? e.message : String(e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });

      console.log('[hocuspocus] WebSocket server ready on /collab');
      console.log('[hocuspocus] Agent write API at POST /api/agent-write');
    },
  };
}
