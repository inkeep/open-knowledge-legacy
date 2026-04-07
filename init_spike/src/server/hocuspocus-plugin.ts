import { Hocuspocus } from '@hocuspocus/server';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';

export const hocuspocus = new Hocuspocus({
  quiet: true,
});

export function hocuspocusPlugin(): Plugin {
  return {
    name: 'hocuspocus',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/collab')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            hocuspocus.handleConnection(ws, req);
          });
        }
      });

      console.log('[hocuspocus] WebSocket server ready on /collab');
    },
  };
}
