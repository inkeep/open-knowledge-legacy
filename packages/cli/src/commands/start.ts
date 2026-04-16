/**
 * `open-knowledge start` — collab server only (Hocuspocus + /api/*).
 *
 * Lifecycle split (SPEC §9, FR-1.2 / FR-1.9):
 * - `ok start` owns the WebSocket (/collab) + HTTP API (/api/*) and advertises
 *   its port via `server.lock`. Static React assets are served by `ok ui`.
 * - On startup we auto-spawn `ok ui` as a detached sibling when `ui.lock` is
 *   absent or stale. A pre-existing live UI is left alone.
 * - Idle-shutdown (FR-1.6) counts WebSocket upgrades at `/collab` only; it is
 *   blind to DirectConnections by design (D-017). When the threshold fires we
 *   SIGTERM the UI sibling before releasing our own lock.
 */
import { type ChildProcess, spawn as nativeSpawn } from 'node:child_process';
import { closeSync, existsSync as fsExistsSync, mkdirSync as fsMkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';
import { OK_DIR, PACKAGE_VERSION } from '../constants.ts';

/** 30 minutes — matches SPEC §9 default threshold. */
const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

export type UiSpawnDecision =
  | { action: 'spawn'; reason: 'absent' }
  | { action: 'spawn'; reason: 'stale'; stalePid: number }
  | { action: 'skip'; reason: 'alive'; pid: number; port: number };

export interface DecideUiSpawnInput {
  uiLock: { pid: number; port: number } | null;
  isAlive: (pid: number) => boolean;
}

/**
 * Pure decision function. The caller feeds the current `ui.lock` contents
 * (or null) and an `isProcessAlive` probe; we return one of three verdicts.
 * No side effects — tests drive it directly without a filesystem.
 */
export function decideUiSpawn(input: DecideUiSpawnInput): UiSpawnDecision {
  if (!input.uiLock) return { action: 'spawn', reason: 'absent' };
  if (!input.isAlive(input.uiLock.pid)) {
    return { action: 'spawn', reason: 'stale', stalePid: input.uiLock.pid };
  }
  return { action: 'skip', reason: 'alive', pid: input.uiLock.pid, port: input.uiLock.port };
}

export interface SpawnOkUiOptions {
  lockDir: string;
  cwd: string;
  /** Override for tests — defaults to `node:child_process#spawn`. */
  spawn?: typeof nativeSpawn;
  /** Args to pass after `npx @inkeep/open-knowledge` — defaults to `['ui']`. */
  args?: string[];
}

/**
 * Spawn `ok ui` as a detached sibling. Child's stderr is redirected at the
 * kernel layer to `<lockDir>/last-spawn-error.log` — matches the MCP spawn
 * template in SPEC §9 / FR-1.4 so the same log consumer can surface failures.
 */
export function spawnOkUi(opts: SpawnOkUiOptions): ChildProcess {
  if (!fsExistsSync(opts.lockDir)) fsMkdirSync(opts.lockDir, { recursive: true });
  const stderrPath = join(opts.lockDir, 'last-spawn-error.log');
  const stderrFd = openSync(stderrPath, 'w');
  const spawnFn = opts.spawn ?? nativeSpawn;
  try {
    const child = spawnFn('npx', ['@inkeep/open-knowledge', ...(opts.args ?? ['ui'])], {
      detached: true,
      stdio: ['ignore', 'ignore', stderrFd],
      cwd: opts.cwd,
    });
    child.unref();
    return child;
  } finally {
    // Child now owns the fd — close our copy so the parent does not keep it open.
    try {
      closeSync(stderrFd);
    } catch {
      // Best-effort: some mocks may not hand back a real fd.
    }
  }
}

export interface BuildIdleShutdownHandlerInput {
  readUiLock: () => { pid: number; port: number } | null;
  isAlive: (pid: number) => boolean;
  killPid: (pid: number, signal: NodeJS.Signals) => void;
  destroy: () => Promise<void>;
  log?: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  };
}

/**
 * Build the idle-shutdown `onShutdown` closure. On fire:
 *   (1) look up `ui.lock`; SIGTERM the sibling if it's still alive;
 *   (2) await `destroy()`, which releases `server.lock` as its final step.
 *
 * Extracted so tests can exercise each branch (no UI, live UI, stale UI) and
 * assert kill / destroy ordering without standing up Hocuspocus.
 */
export function buildIdleShutdownHandler(
  input: BuildIdleShutdownHandlerInput,
): () => Promise<void> {
  return async () => {
    try {
      const lock = input.readUiLock();
      if (lock && input.isAlive(lock.pid)) {
        try {
          input.killPid(lock.pid, 'SIGTERM');
          input.log?.info({ pid: lock.pid, port: lock.port }, 'idle-shutdown: SIGTERM UI sibling');
        } catch (err) {
          input.log?.warn(
            { pid: lock.pid, err: err instanceof Error ? err.message : String(err) },
            'idle-shutdown: failed to SIGTERM UI sibling',
          );
        }
      }
    } catch (err) {
      input.log?.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'idle-shutdown: UI lookup failed; proceeding with destroy',
      );
    }
    await input.destroy();
  };
}

export function startCommand(getConfig: () => Config): Command {
  const cmd = new Command('start')
    .description('Start the knowledge base collab server')
    .option('-p, --port <port>', 'Server port', undefined)
    .option('-H, --host <host>', 'Server host', undefined)
    .option('--open', 'Open browser after start')
    .option('--no-init', `Skip auto-scaffolding of ${OK_DIR}/`)
    .action(async (opts) => {
      // Lazy imports — avoids loading TipTap/Hocuspocus for other commands
      const { existsSync, mkdirSync } = await import('node:fs');
      const { createServer: createHttpServer } = await import('node:http');
      const { resolve } = await import('node:path');
      const {
        attachIdleShutdown,
        createServer,
        getLogger,
        isProcessAlive,
        readUiLock,
        updateServerLockPort,
      } = await import('@inkeep/open-knowledge-server');
      const { resolveContentDir } = await import('../config/paths.ts');
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

      // First-agent-edit auto-open points at the UI sibling when we can find
      // one, so the browser lands on the editor rather than the bare collab
      // endpoint. Lookup is lazy — the sibling may still be binding on the
      // first agent write; if `ui.lock` isn't usable we skip open silently.
      let agentEditOpened = false;
      const lockDirForUiLookup = resolve(contentDir, OK_DIR);
      const onAgentWrite = config.server.openOnAgentEdit
        ? () => {
            if (agentEditOpened) return;
            const ui = readUiLock(lockDirForUiLookup);
            if (!ui || ui.port <= 0 || !isProcessAlive(ui.pid)) return;
            agentEditOpened = true;
            const uiUrl = `http://localhost:${ui.port}`;
            import('../utils/open-browser.ts')
              .then(({ openBrowser }) => openBrowser(uiUrl))
              .catch(() => {
                // openBrowser already logs a hint on failure; URL is in the banner.
              });
          }
        : undefined;

      const { hocuspocus, destroy, ready, degraded, lockDir } = createServer({
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
        onAgentWrite,
      });

      // Graceful shutdown — idempotent, fires `destroy()` exactly once even
      // if multiple signals arrive (SIGINT then SIGTERM). Ensures `releaseServerLock`
      // runs as the final step in `destroy()`.
      let shuttingDown = false;
      const shutdown = async (signal: NodeJS.Signals | 'idle') => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(dim(`\nShutting down (${signal})...`));
        // Best-effort: SIGTERM the UI sibling so the lifecycle stays paired.
        try {
          const ui = readUiLock(lockDir);
          if (ui && isProcessAlive(ui.pid)) {
            try {
              process.kill(ui.pid, 'SIGTERM');
            } catch {
              // Already exiting; nothing to do.
            }
          }
        } catch {
          // Lock read is best-effort; fall through to destroy.
        }
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

      // Auto-spawn the UI sibling when none is running. Greenfield: we don't
      // try to adopt alien siblings — if another `ok ui` is already live we
      // leave it alone and let it keep serving.
      const uiLockBefore = readUiLock(lockDir);
      const uiSpawnDecision = decideUiSpawn({
        uiLock: uiLockBefore,
        isAlive: isProcessAlive,
      });
      if (uiSpawnDecision.action === 'spawn') {
        try {
          spawnOkUi({ lockDir, cwd });
          log.info({ reason: uiSpawnDecision.reason }, '[start] auto-spawned ok ui sibling');
        } catch (err) {
          console.warn(
            `${warning('[start]')} failed to auto-spawn ok ui: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        log.info(
          { port: uiSpawnDecision.port, pid: uiSpawnDecision.pid },
          `UI already running at port ${uiSpawnDecision.port}`,
        );
      }

      // Create HTTP server — collab + /api/* only. Static React assets are
      // served by `ok ui` after the lifecycle split (SPEC FR-1.2).
      const httpServer = createHttpServer((req, res) => {
        const url = req.url?.split('?')[0];

        // Priority 1: API routes via Hocuspocus onRequest extensions.
        if (url?.startsWith('/api/')) {
          hocuspocus
            // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
            .hooks('onRequest', { request: req, response: res } as any)
            .then(() => {
              if (res.writableEnded) return;
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'API route not found', path: url }));
            })
            .catch((err) => {
              console.error('[api] Unhandled onRequest error:', err);
              if (!res.writableEnded) {
                res.writeHead(500);
                res.end('Internal server error');
              }
            });
          return;
        }

        // Anything else — collab only, no static assets. `ok ui` owns the
        // browser surface; point users there.
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Not found. The React UI is served by `ok ui` (default port 3000).',
            path: url ?? '/',
          }),
        );
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

      // Wire idle-shutdown AFTER upgrade handler so both listeners see the
      // same events (Node fires `upgrade` listeners in registration order).
      // WebSocket-count only — DirectConnections are invisible per D-017.
      attachIdleShutdown({
        httpServer,
        thresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
        log,
        onShutdown: buildIdleShutdownHandler({
          readUiLock: () => readUiLock(lockDir),
          isAlive: isProcessAlive,
          killPid: (pid, signal) => {
            process.kill(pid, signal);
          },
          destroy: async () => {
            await destroy();
          },
          log,
        }),
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

        // Surface degraded-boot warnings after the banner.
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
