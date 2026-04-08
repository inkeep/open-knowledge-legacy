/**
 * `open-knowledge start` command — launches standalone Hocuspocus server.
 */
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { createServer } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { WebSocketServer } from 'ws';
import type { Config } from '../config/schema';

export function startCommand(getConfig: () => Config): Command {
  const cmd = new Command('start')
    .description('Start the knowledge base server')
    .option('-p, --port <port>', 'Server port', undefined)
    .option('-H, --host <host>', 'Server host', undefined)
    .option('--open', 'Open browser after start')
    .action(async (opts) => {
      const config = getConfig();
      const cwd = process.cwd();
      const contentDir = resolve(cwd, config.content.dir);

      const { hocuspocus, destroy } = createServer({
        contentDir,
        projectDir: cwd,
        port: config.server.port,
        host: config.server.host,
        quiet: false,
        debounce: config.persistence.debounceMs,
        maxDebounce: config.persistence.maxDebounceMs,
        gitEnabled: config.git.enabled,
        commitDebounceMs: config.git.commitDebounceMs,
        wipRef: config.git.wipRef,
      });

      // Graceful shutdown
      const shutdown = async () => {
        console.log('\nShutting down...');
        await destroy();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Create HTTP server and wire up Hocuspocus
      const httpServer = createHttpServer((req, res) => {
        // Let Hocuspocus handle onRequest extensions (API routes)
        hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
          if (!res.writableEnded) {
            res.writeHead(404);
            res.end('Not found');
          }
        });
      });

      const wss = new WebSocketServer({ noServer: true });
      httpServer.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/collab')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            const clientConnection = hocuspocus.handleConnection(
              ws as unknown as WebSocket,
              req as unknown as Request,
            );
            ws.on('message', (data: ArrayBuffer | Buffer) => {
              clientConnection.handleMessage(
                data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data),
              );
            });
            ws.on('close', (code: number, reason: Buffer) => {
              clientConnection.handleClose({ code, reason: reason.toString() });
            });
            ws.on('error', (err: Error) => {
              console.error('[collab] WebSocket error:', err);
              ws.terminate();
            });
          });
        }
      });

      httpServer.listen(config.server.port, config.server.host, () => {
        const localUrl = `http://${config.server.host}:${config.server.port}`;
        console.log();
        console.log('  open-knowledge v0.0.1');
        console.log();
        console.log(`  Local:   ${localUrl}`);
        if (config.server.host === '0.0.0.0' || config.server.host === '::') {
          console.log(`  Network: http://0.0.0.0:${config.server.port}`);
        }
        console.log();
        console.log('  Press Ctrl+C to stop');
        console.log();
      });

      if (opts.open) {
        const { exec } = await import('node:child_process');
        exec(`open http://${config.server.host}:${config.server.port}`);
      }
    });

  return cmd;
}
