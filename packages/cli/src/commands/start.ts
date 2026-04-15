/**
 * `open-knowledge start` command — launches standalone Hocuspocus server
 * with optional static React app serving.
 */
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';
import { OK_DIR, PACKAGE_VERSION } from '../constants.ts';

export function startCommand(getConfig: () => Config): Command {
  const cmd = new Command('start')
    .description('Start the knowledge base server')
    .option('-p, --port <port>', 'Server port', undefined)
    .option('-H, --host <host>', 'Server host', undefined)
    .option('--open', 'Open browser after start')
    .option('--no-init', `Skip auto-scaffolding of ${OK_DIR}/`)
    .action(async (opts) => {
      // Lazy imports — avoids loading TipTap/Hocuspocus for other commands
      const { existsSync, mkdirSync } = await import('node:fs');
      const { createServer: createHttpServer } = await import('node:http');
      const { resolve } = await import('node:path');
      const { createServer, getLogger, updateServerLockPort } = await import(
        '@inkeep/open-knowledge-server'
      );
      const { resolveContentDir } = await import('../config/paths.ts');
      const { default: sirv } = await import('sirv');
      const { WebSocketServer } = await import('ws');
      const { renderBanner } = await import('../ui/banner.ts');
      const { dim, error, info, warning } = await import('../ui/colors.ts');

      const log = getLogger('start');
      const config = getConfig();
      const cwd = process.cwd();

      // Auto-init: scaffold .open-knowledge/ on first run (unless --no-init)
      let didAutoInit = false;
      const okDir = resolve(cwd, OK_DIR);
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
      const contentDir = resolveContentDir(config, cwd);
      if (!existsSync(contentDir)) {
        mkdirSync(contentDir, { recursive: true });
        log.info({ contentDir }, 'Created content directory');
      }

      const { hocuspocus, contentFilter, destroy, ready, degraded, lockDir } = createServer({
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

      // Graceful shutdown — idempotent, fires `destroy()` exactly once even
      // if multiple signals arrive (SIGINT then SIGTERM). Ensures `releaseServerLock`
      // runs as the final step in `destroy()`.
      let shuttingDown = false;
      const shutdown = async (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(dim(`\nShutting down (${signal})...`));
        try {
          await destroy();
        } catch (err) {
          console.error(
            `${error('destroy() failed:')} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
          );
          process.exitCode = 1;
        }
        process.exit(process.exitCode ?? 0);
      };
      process.once('SIGINT', () => {
        void shutdown('SIGINT');
      });
      process.once('SIGTERM', () => {
        void shutdown('SIGTERM');
      });

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

      // Filter-aware asset serving over contentDir (D9)
      const contentSirv = sirv(contentDir, { dotfiles: false });

      // Create HTTP server and wire up Hocuspocus
      const httpServer = createHttpServer((req, res) => {
        // Priority 1: API routes via Hocuspocus onRequest extensions
        const url = req.url?.split('?')[0];
        if (url?.startsWith('/api/')) {
          // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
          hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
            if (!res.writableEnded) {
              res.writeHead(500);
              res.end('Internal server error');
            }
          });
          return;
        }

        // Priority 2: Content assets via filter-aware sirv
        const rel = decodeURIComponent(url?.replace(/^\//, '') ?? '');
        if (rel && !contentFilter.isExcluded(rel)) {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          contentSirv(req, res, () => {
            // Asset not found on disk — fall through to SPA
            if (staticHandler) {
              staticHandler(req, res);
            } else {
              res.writeHead(404);
              res.end('Not found');
            }
          });
          return;
        }

        // Priority 3: Static file serving (SPA fallback)
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
        // Update the lock file with the kernel-assigned port (or confirm the
        // configured one). MCP discovery reads this field to connect.
        const addr = httpServer.address();
        const realPort = typeof addr === 'object' && addr !== null ? addr.port : config.server.port;
        updateServerLockPort(lockDir, realPort);

        const localUrl = `http://${config.server.host}:${realPort}`;
        const networkUrl =
          config.server.host === '0.0.0.0' || config.server.host === '::'
            ? `http://0.0.0.0:${realPort}`
            : undefined;
        console.log(
          renderBanner({
            name: 'open-knowledge',
            version: PACKAGE_VERSION,
            localUrl,
            networkUrl,
          }),
        );
        if (didAutoInit) {
          console.log(`  ${info('\u2713')} Scaffolded ${OK_DIR}/ (first run)`);
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
          .then(async () => {
            if (degraded.length > 0) {
              console.log();
              for (const id of degraded) {
                const impact = DEGRADED_IMPACTS[id] ?? `${id} (check server logs for details)`;
                console.warn(`  ${warning('\u26a0')} ${warning(id)}: ${dim(impact)}`);
              }
              console.log();
            }

            if (didAutoInit) {
              try {
                const { previewContent, formatPreviewBlock } = await import(
                  '../content/preview.ts'
                );
                const preview = previewContent({
                  projectDir: cwd,
                  contentDir,
                  include: config.content.include,
                  exclude: config.content.exclude,
                });
                console.log(`\n${formatPreviewBlock(preview, cwd)}\n`);
              } catch (e) {
                console.warn(
                  `Content preview unavailable: ${e instanceof Error ? e.message : String(e)}`,
                );
              }
            }

            if (opts.open) {
              const { openBrowser } = await import('../utils/open-browser.ts');
              openBrowser(localUrl);
            }
          })
          .catch((err) => {
            console.error(
              `  ${error('Server initialization failed:')} ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      });
    });

  return cmd;
}
