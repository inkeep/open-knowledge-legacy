/**
 * `open-knowledge start` command — launches standalone Hocuspocus server
 * with optional static React app serving.
 */
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';

export function startCommand(getConfig: () => Config): Command {
  const cmd = new Command('start')
    .description('Start the knowledge base server')
    .option('-p, --port <port>', 'Server port', undefined)
    .option('-H, --host <host>', 'Server host', undefined)
    .option('--open', 'Open browser after start')
    .option('--no-init', 'Skip auto-scaffolding of .open-knowledge/')
    .action(async (opts) => {
      // Lazy imports — avoids loading TipTap/Hocuspocus for other commands
      const { existsSync } = await import('node:fs');
      const { createServer: createHttpServer } = await import('node:http');
      const { resolve } = await import('node:path');
      const { createServer, getLogger } = await import('@inkeep/open-knowledge-server');
      const { default: sirv } = await import('sirv');
      const { WebSocketServer } = await import('ws');
      const { renderBanner } = await import('../ui/banner.ts');
      const { dim, error, info, warning } = await import('../ui/colors.ts');

      const { mkdirSync } = await import('node:fs');

      const log = getLogger('start');
      const config = getConfig();
      const cwd = process.cwd();

      // Auto-init: scaffold .open-knowledge/ on first run (unless --no-init)
      let didAutoInit = false;
      const okDir = resolve(cwd, '.open-knowledge');
      if (!existsSync(okDir) && opts.init !== false) {
        try {
          const { runInit } = await import('./init.ts');
          const result = runInit({ cwd, mcp: false });
          if (result.mcpAction === 'failed') {
            console.warn(`Auto-init: ${result.mcpError ?? 'unknown error'}`);
          } else {
            didAutoInit = true;
          }
        } catch (err) {
          console.warn('Auto-init failed:', err instanceof Error ? err.message : err);
        }
      }

      // Ensure content directory exists (for non-default content.dir)
      const contentDir = resolve(cwd, config.content.dir);
      if (!existsSync(contentDir)) {
        mkdirSync(contentDir, { recursive: true });
        log.info({ contentDir }, 'Created content directory');
      }

      const { hocuspocus, destroy, ready, degraded } = createServer({
        contentDir,
        projectDir: cwd,
        contentRoot: config.content.dir,
        port: config.server.port,
        host: config.server.host,
        quiet: false,
        debounce: config.persistence.debounceMs,
        maxDebounce: config.persistence.maxDebounceMs,
        includePatterns: config.content.include,
        excludePatterns: config.content.exclude,
      });

      // Graceful shutdown
      const shutdown = async () => {
        console.log(dim('\nShutting down...'));
        await destroy();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Static asset serving — locate built React app.
      // Priority: (1) dist/public/ for npm-installed CLI, (2-3) monorepo dev paths.
      const cliDir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
      const assetPaths = [
        resolve(cliDir, 'public'), // npm install: dist/public/ (bundled assets)
        resolve(cliDir, '../../app/dist'), // monorepo dev from src/
        resolve(cliDir, '../../../app/dist'), // monorepo dev from dist/
      ];
      const assetDir = assetPaths.find((p) => existsSync(p));
      const staticHandler = assetDir
        ? sirv(assetDir, { single: true, gzip: true, immutable: true })
        : null;

      if (assetDir) {
        log.info({ assetDir }, 'Serving static assets');
      } else {
        log.warn({}, 'No React app assets found — browser UI will not be available');
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
      wss.on('error', (err) => {
        log.error({ err }, 'WebSocketServer error');
      });
      httpServer.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/collab')) {
          socket.on('error', (err: Error) => {
            log.error({ err }, 'Upgrade socket error');
          });
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
        if (didAutoInit) {
          console.log(`  ${info('\u2713')} Scaffolded .open-knowledge/ (first run)`);
          console.log(
            `  ${dim('Tip: Run `open-knowledge init` to register MCP tools for Claude Code')}\n`,
          );
        }

        // Surface degraded-boot warnings after the banner. The ready promise
        // resolves when all subsystem init attempts complete — each failed
        // subsystem is recorded in the degraded array.
        const DEGRADED_IMPACTS: Record<string, string> = {
          'shadow-repo': 'Version history and branch-switch safety unavailable',
          'file-watcher': 'External file changes will not sync to the editor',
          'head-watcher': 'Git branch switches may cause document inconsistency',
        };
        ready
          .then(() => {
            if (degraded.length === 0) return;
            console.log();
            for (const id of degraded) {
              const impact = DEGRADED_IMPACTS[id] ?? `${id} (check server logs for details)`;
              console.warn(`  ${warning('\u26a0')} ${warning(id)}: ${dim(impact)}`);
            }
            console.log();
          })
          .catch((err) => {
            console.error(
              `  ${error('Server initialization failed:')} ${err instanceof Error ? err.message : String(err)}`,
            );
          });
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
