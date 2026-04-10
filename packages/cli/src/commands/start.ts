/**
 * `open-knowledge start` command — launches standalone Hocuspocus server
 * with optional static React app serving.
 */
import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { createServer, getLogger } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import sirv from 'sirv';
import { WebSocketServer } from 'ws';
import type { Config } from '../config/schema.ts';
import { renderBanner } from '../ui/banner.ts';
import { dim, error, info } from '../ui/colors.ts';

const log = getLogger('start');

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

      if (!existsSync(contentDir)) {
        const configPath = resolve(cwd, '.open-knowledge', 'config.yml');
        const hasConfig = existsSync(configPath);
        console.error(`\n  ${error('Error:')} Content directory not found: ${info(contentDir)}\n`);
        if (!hasConfig) {
          console.error(`  ${dim('No config file found. Create one at:')}`);
          console.error(`    ${info(configPath)}\n`);
          console.error(`  ${dim('Example .open-knowledge/config.yml:')}`);
          console.error(`  ${dim('  content:')}`);
          console.error(`  ${dim('    dir: ./content')}\n`);
        } else {
          console.error(`  ${dim('Check "content.dir" in')} ${info(configPath)}`);
          console.error(`  ${dim('Or create the directory:')} mkdir ${config.content.dir}\n`);
        }
        process.exit(1);
      }

      const { hocuspocus, destroy } = createServer({
        contentDir,
        projectDir: cwd,
        port: config.server.port,
        host: config.server.host,
        quiet: false,
        debounce: config.persistence.debounceMs,
        maxDebounce: config.persistence.maxDebounceMs,
      });

      // Graceful shutdown
      const shutdown = async () => {
        console.log(dim('\nShutting down...'));
        await destroy();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Static asset serving — locate built React app
      // Convention: ../app/dist/ relative to CLI package, or search common locations
      const assetPaths = [resolve(cwd, 'packages/app/dist'), resolve(cwd, 'dist')];
      const assetDir = assetPaths.find((p) => existsSync(p));
      const staticHandler = assetDir
        ? sirv(assetDir, { single: true, gzip: true, immutable: true })
        : null;

      if (assetDir) {
        log.info({ assetDir }, 'Serving static assets');
      }

      // Create HTTP server and wire up Hocuspocus
      const httpServer = createHttpServer((req, res) => {
        // Priority 1: API routes via Hocuspocus onRequest extensions
        const url = req.url?.split('?')[0];
        if (url?.startsWith('/api/')) {
          // biome-ignore lint/suspicious/noExplicitAny: HTTP server types don't match Hocuspocus hook signature
          hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
            if (!res.writableEnded) {
              res.writeHead(500);
              res.end('Internal server error');
            }
          });
          return;
        }

        // Priority 2: Static file serving (SPA fallback)
        if (staticHandler) {
          staticHandler(req, res);
          return;
        }

        res.writeHead(404);
        res.end('Not found');
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
              log.error({ err }, 'WebSocket error');
              ws.terminate();
            });
          });
        }
      });

      httpServer.listen(config.server.port, config.server.host, () => {
        const localUrl = `http://${config.server.host}:${config.server.port}`;
        const networkUrl =
          config.server.host === '0.0.0.0' || config.server.host === '::'
            ? `http://0.0.0.0:${config.server.port}`
            : undefined;
        console.log(
          renderBanner({
            name: 'open-knowledge',
            version: '0.0.1',
            localUrl,
            networkUrl,
          }),
        );
      });

      if (opts.open) {
        const { execFile } = await import('node:child_process');
        const url = `http://${config.server.host}:${config.server.port}`;
        execFile('open', [url], (err) => {
          if (err) console.error(`${error('Failed to open browser:')} ${err.message}`);
        });
      }
    });

  return cmd;
}
