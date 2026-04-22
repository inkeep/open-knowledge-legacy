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
 *
 * The Commander action is a thin wrapper around `bootStartServer` — that
 * boot function returns a `BootedStartServer` handle (`{httpServer, destroy,
 * port, ready, ...}`) so integration tests can drive the same composed boot
 * path the CLI uses, without process-level signal coupling.
 */
import {
  type ChildProcess,
  type spawn as NativeSpawn,
  spawn as nativeSpawn,
} from 'node:child_process';
import { closeSync, existsSync as fsExistsSync, mkdirSync as fsMkdirSync, openSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import type { BootedServer, PinoLogger } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';
import { OK_DIR, PACKAGE_VERSION } from '../constants.ts';
import { resolveSelfSpawn } from './self-spawn.ts';

/** 30 minutes — matches SPEC §9 default threshold. */
const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

export type UiSpawnDecision =
  | { action: 'spawn'; reason: 'absent' }
  | { action: 'spawn'; reason: 'stale'; stalePid: number }
  | { action: 'skip'; reason: 'alive'; pid: number; port: number };

interface DecideUiSpawnInput {
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

interface SpawnOkUiOptions {
  lockDir: string;
  cwd: string;
  /** Override for tests — defaults to `node:child_process#spawn`. */
  spawn?: typeof NativeSpawn;
  /** Args to pass after the CLI entry — defaults to `['ui']`. */
  args?: string[];
}

/**
 * Spawn `ok ui` as a detached sibling. Child's stderr is redirected at the
 * kernel layer to `<lockDir>/last-spawn-error.log` — matches the MCP spawn
 * template in SPEC §9 / FR-1.4 so the same log consumer can surface failures.
 *
 * Re-execs the current CLI binary rather than shelling out via
 * `npx @inkeep/open-knowledge` to avoid cross-version lockfile-ABI drift and
 * the live-registry-fetch / supply-chain surface. See `self-spawn.ts`.
 *
 * **PORT env hygiene (QA-007; D-033):** the child `ok ui` resolves its bind
 * port via `PORT` env > `--port` flag > default 0 (kernel-allocated per
 * D-033). When `ok start` itself was invoked with `PORT=<X>` (e.g. operator
 * override), we must NOT inherit that to the child — both processes would
 * try to bind the same port. Stripping `PORT` means the child falls through
 * to its default, which (post-D-033) is kernel-allocation — each auto-
 * spawned UI gets a unique port and G4 (multi-project concurrency) is
 * mechanically true, not just aspirational. If the caller needs a specific
 * UI port, they should invoke `ok ui --port <X>` directly.
 */
export function spawnOkUi(opts: SpawnOkUiOptions): ChildProcess {
  if (!fsExistsSync(opts.lockDir)) fsMkdirSync(opts.lockDir, { recursive: true });
  const stderrPath = join(opts.lockDir, 'last-spawn-error.log');
  const stderrFd = openSync(stderrPath, 'w');
  const spawnFn = opts.spawn ?? nativeSpawn;
  const { PORT: _strippedPort, ...childEnv } = process.env;
  const self = resolveSelfSpawn();
  try {
    const child = spawnFn(self.command, [...self.prefixArgs, ...(opts.args ?? ['ui'])], {
      detached: true,
      stdio: ['ignore', 'ignore', stderrFd],
      cwd: opts.cwd,
      env: childEnv,
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

interface BuildIdleShutdownHandlerInput {
  readUiLock: () => { pid: number; port: number } | null;
  isAlive: (pid: number) => boolean;
  killPid: (pid: number, signal: NodeJS.Signals) => void;
  destroy: () => Promise<void>;
  /** Poll `isAlive(pid)` every this many ms while waiting for SIGTERM to take. */
  sigtermPollIntervalMs?: number;
  /** Abandon SIGTERM and escalate to SIGKILL after this wall-clock elapses. */
  sigtermGraceMs?: number;
  /** Injectable sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  log?: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  };
}

/** 10s grace before SIGKILL escalation — long enough for a healthy UI to
 * release its lock + close sockets; short enough that a wedged UI (GC
 * pause, downstream fetch hang) doesn't stall idle-shutdown indefinitely. */
const DEFAULT_SIGTERM_GRACE_MS = 10_000;
const DEFAULT_SIGTERM_POLL_MS = 200;

/**
 * Build the idle-shutdown `onShutdown` closure. On fire:
 *   (1) look up `ui.lock`; SIGTERM the sibling if it's still alive;
 *   (2) poll its liveness up to `sigtermGraceMs` (default 10s);
 *   (3) if still alive after the grace window, escalate to SIGKILL;
 *   (4) await `destroy()`, which releases `server.lock` as its final step.
 *
 * Escalation matters because a hung `ok ui` (stuck in a GC pause or a
 * downstream fetch in `/api/config`) would otherwise block idle-shutdown
 * indefinitely. Escalation is logged at WARN so the operator sees that a
 * non-standard path ran.
 *
 * Extracted so tests can exercise each branch (no UI, live UI, stale UI,
 * SIGTERM-takes, SIGKILL-escalation) without standing up Hocuspocus.
 */
export function buildIdleShutdownHandler(
  input: BuildIdleShutdownHandlerInput,
): () => Promise<void> {
  const graceMs = input.sigtermGraceMs ?? DEFAULT_SIGTERM_GRACE_MS;
  const pollMs = input.sigtermPollIntervalMs ?? DEFAULT_SIGTERM_POLL_MS;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return async () => {
    try {
      const lock = input.readUiLock();
      if (lock && input.isAlive(lock.pid)) {
        try {
          input.killPid(lock.pid, 'SIGTERM');
          input.log?.info({ pid: lock.pid, port: lock.port }, 'idle-shutdown: SIGTERM UI sibling');
          // Wait up to graceMs for the UI process to exit under SIGTERM.
          const deadline = Date.now() + graceMs;
          while (Date.now() < deadline) {
            if (!input.isAlive(lock.pid)) break;
            await sleep(pollMs);
          }
          if (input.isAlive(lock.pid)) {
            // Grace expired — escalate to SIGKILL. Operators see this at WARN.
            try {
              input.killPid(lock.pid, 'SIGKILL');
              input.log?.warn(
                { pid: lock.pid, graceMs },
                'idle-shutdown: SIGTERM grace expired — escalated to SIGKILL',
              );
            } catch (err) {
              input.log?.error(
                { pid: lock.pid, err: err instanceof Error ? err.message : String(err) },
                'idle-shutdown: SIGKILL failed',
              );
            }
          }
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

interface BootStartServerOptions {
  config: Config;
  cwd: string;
  /** Skip auto-init scaffolding of `<cwd>/.open-knowledge/` (tests usually want this). */
  skipAutoInit?: boolean;
  /** Skip the auto-spawn-of-ok-ui-sibling step entirely (does not call `spawnOkUi`). */
  skipUiAutoSpawn?: boolean;
  /** Override for `spawnOkUi`'s underlying spawn — passed through to it. */
  spawn?: typeof NativeSpawn;
  /** Override idle-shutdown threshold; default 30 min. Tests use small values. */
  idleThresholdMs?: number;
  /**
   * Logger override — defaults to `getLogger('start')`. PinoLogger is
   * already silent in test mode (`NODE_ENV === 'test'` → level: 'silent'),
   * so tests typically don't need to override; this hook exists for any
   * future caller that wants to pipe logs elsewhere.
   */
  log?: PinoLogger;
}

export interface BootedStartServer {
  /** The bound HTTP server listening on `port`. */
  httpServer: HttpServer;
  /** Composite shutdown — closes httpServer, detaches idle-shutdown, destroys the Hocuspocus server (which releases server.lock). */
  destroy: () => Promise<void>;
  /** Absolute path to `<contentDir>/.open-knowledge`. */
  lockDir: string;
  /** Resolved content directory (`resolveContentDir(config, cwd)`). */
  contentDir: string;
  /** The kernel-assigned port `httpServer` is bound to (or the config-requested port if non-zero). */
  port: number;
  /** Resolves when async server init (shadow repo, file watcher subscription) completes. */
  ready: Promise<void>;
  /** Subsystems that failed to initialize — read AFTER `ready` for a stable list. */
  degraded: readonly string[];
  /** What we decided about the UI sibling at boot — for tests + status output. */
  uiSpawnDecision: UiSpawnDecision;
  /** `true` if `runInit` scaffolded `.open-knowledge/` during this boot. */
  didAutoInit: boolean;
}

/**
 * Boot the collab server end-to-end and return a handle. Pure of process-level
 * concerns (signal handlers, banner, browser-open, exit codes) so integration
 * tests can drive it directly. The Commander action layers signals + UX on top.
 *
 * D35 extraction: the HTTP + WebSocket + listen + lock + idle-shutdown plumbing
 * lives in `@inkeep/open-knowledge-server`'s `bootServer()`; this wrapper adds
 * CLI-specific concerns (auto-init via `initContent`, resolveContentDir, UI-
 * sibling spawn via `spawnOkUi`, open-browser-on-first-agent-edit).
 */
export async function bootStartServer(opts: BootStartServerOptions): Promise<BootedStartServer> {
  const { config, cwd } = opts;
  const skipAutoInit = opts.skipAutoInit ?? false;
  const skipUiAutoSpawn = opts.skipUiAutoSpawn ?? false;
  const idleThresholdMs = opts.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;

  const { existsSync, mkdirSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { resolveUploadConfig } = await import('@inkeep/open-knowledge-core');
  const { bootServer, detectObsidianVault, getLogger, isProcessAlive, readUiLock } = await import(
    '@inkeep/open-knowledge-server'
  );
  const { resolveContentDir } = await import('../config/paths.ts');

  const log = opts.log ?? getLogger('start');

  // Resolve content directory before bootServer (CLI reads it from Config;
  // bootServer takes a resolved contentDir as input).
  const contentDir = resolveContentDir(config, cwd);
  if (!existsSync(contentDir)) {
    mkdirSync(contentDir, { recursive: true });
    log.info({ contentDir }, 'Created content directory');
  }

  // SPEC §6 FR-4 + US-018: non-destructive Obsidian vault detection with
  // **user-wins precedence** (user > vault > default). `config.upload`
  // is the YAML-derived partial; Zod leaves `attachmentFolderPath` and
  // `emitFormat` undefined when the user didn't set them so the vault
  // partial can fill the gap. The canonical resolver lives in core so
  // the Vite dev plugin reaches the same result without duplicating the
  // merge logic.
  const vaultPartial = detectObsidianVault(contentDir);
  const uploadConfig = resolveUploadConfig(config.upload, vaultPartial);
  if (vaultPartial) {
    log.info(
      { vault: vaultPartial, resolved: uploadConfig },
      '[start] detected Obsidian vault — filled upload defaults (user config wins)',
    );
  }

  // Track whether the upcoming auto-init actually scaffolded anything — the
  // CLI banner branches on this (first-run tip, content preview).
  const okDir = resolve(cwd, OK_DIR);
  const needsScaffold = !existsSync(okDir);
  const autoInitFn = skipAutoInit
    ? undefined
    : async () => {
        try {
          const { initContent } = await import('../content/init.ts');
          const result = initContent(cwd);
          return needsScaffold || result.created.length > 0;
        } catch (err) {
          console.warn('Auto-init failed:', err instanceof Error ? err.message : err);
          return false;
        }
      };

  // First-agent-edit auto-open points at the UI sibling when we can find one,
  // so the browser lands on the editor rather than the bare collab endpoint.
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

  // Capture uiSpawnDecision from inside the spawnUiSiblingFn callback so we
  // can return it on the BootedStartServer handle for tests + status output.
  let uiSpawnDecision: UiSpawnDecision | null = null;
  const spawnUiSiblingFn = async ({
    lockDir: resolvedLockDir,
  }: {
    lockDir: string;
    log: PinoLogger;
  }) => {
    const uiLockBefore = readUiLock(resolvedLockDir);
    uiSpawnDecision = decideUiSpawn({
      uiLock: uiLockBefore,
      isAlive: isProcessAlive,
    });
    if (uiSpawnDecision.action === 'spawn' && !skipUiAutoSpawn) {
      try {
        spawnOkUi({ lockDir: resolvedLockDir, cwd, spawn: opts.spawn });
        log.info({ reason: uiSpawnDecision.reason }, '[start] auto-spawned ok ui sibling');
      } catch (err) {
        console.warn(
          `[start] failed to auto-spawn ok ui: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (uiSpawnDecision.action === 'skip') {
      log.info(
        { port: uiSpawnDecision.port, pid: uiSpawnDecision.pid },
        `UI already running at port ${uiSpawnDecision.port}`,
      );
    }
  };

  const booted: BootedServer = await bootServer({
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
    uploadConfig,
    onAgentWrite,
    // Pass the exact runtime that started this server so /api/local-op/* can
    // spawn additional CLI processes without needing open-knowledge on PATH.
    localOpCliArgs: [process.execPath, process.argv[1]],
    // CLI-specific opt-ins
    attachUiSibling: true,
    idleShutdownMs: idleThresholdMs,
    skipAutoInit,
    autoInitFn,
    spawnUiSiblingFn,
    idleShutdownHandler: (destroyServer) =>
      buildIdleShutdownHandler({
        readUiLock: () => readUiLock(booted.lockDir),
        isAlive: isProcessAlive,
        killPid: (pid, signal) => {
          process.kill(pid, signal);
        },
        destroy: destroyServer,
        log,
      }),
    log,
  });

  if (!uiSpawnDecision) {
    // bootServer skipped the UI-sibling callback (attachUiSibling=false is
    // never set here, so this path is unreachable under CLI — included for
    // type exhaustiveness).
    uiSpawnDecision = { action: 'skip', reason: 'alive', pid: 0, port: 0 };
  }

  return {
    httpServer: booted.httpServer,
    destroy: booted.destroy,
    lockDir: booted.lockDir,
    contentDir,
    port: booted.port,
    ready: booted.ready,
    degraded: booted.degraded,
    uiSpawnDecision,
    didAutoInit: booted.didAutoInit,
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
      const { renderBanner } = await import('../ui/banner.ts');
      const { dim, error, info, warning } = await import('../ui/colors.ts');

      const config = getConfig();
      const cwd = process.cwd();

      if (opts.port !== undefined) config.server.port = Number(opts.port);
      if (opts.host !== undefined) config.server.host = opts.host;

      let booted: BootedStartServer;
      try {
        booted = await bootStartServer({
          config,
          cwd,
          skipAutoInit: opts.init === false,
        });
      } catch (err) {
        console.error(
          `${error('Failed to start:')} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
        );
        process.exit(1);
      }

      // Graceful shutdown — idempotent, fires `booted.destroy()` exactly once
      // even if multiple signals arrive (SIGINT then SIGTERM).
      let shuttingDown = false;
      const shutdown = async (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(dim(`\nShutting down (${signal})...`));
        try {
          await booted.destroy();
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

      const apiUrl = `http://${config.server.host}:${booted.port}`;
      const networkUrl =
        config.server.host === '0.0.0.0' || config.server.host === '::'
          ? `http://0.0.0.0:${booted.port}`
          : undefined;

      // Post-lifecycle-split: the user-facing URL is the `ok ui` sibling, not
      // the collab/API port. Prefer the UI URL in the banner when we know one
      // — either the sibling is already live (skip-spawn case), or we just
      // spawned it and the known default is 3000. Fall back to the API URL
      // when we couldn't find a plausible UI port.
      const uiDecision = booted.uiSpawnDecision;
      const uiPort = uiDecision.action === 'skip' ? uiDecision.port : 3000;
      const localUrl = uiPort > 0 ? `http://${config.server.host}:${uiPort}` : apiUrl;

      console.log(
        renderBanner({
          name: 'open-knowledge',
          version: PACKAGE_VERSION,
          localUrl,
          apiUrl: localUrl !== apiUrl ? apiUrl : undefined,
          networkUrl,
        }),
      );
      if (booted.didAutoInit) {
        console.log(`  ${info('\u2713')} Scaffolded ${OK_DIR}/ (first run)`);
        console.log(
          `  ${dim('Tip: Run `open-knowledge init` to register MCP tools for Claude Code')}\n`,
        );
      }

      // Surface degraded-boot warnings + first-run preview + opt-open after
      // the ready promise resolves.
      const DEGRADED_IMPACTS: Record<string, string> = {
        'shadow-repo': 'Version history and branch-switch safety unavailable',
        'file-watcher': 'External file changes will not sync to the editor',
        'head-watcher': 'Git branch switches may cause document inconsistency',
      };
      booted.ready
        .then(async () => {
          if (booted.degraded.length > 0) {
            console.log();
            for (const id of booted.degraded) {
              const impact = DEGRADED_IMPACTS[id] ?? `${id} (check server logs for details)`;
              console.warn(`  ${warning('\u26a0')} ${warning(id)}: ${dim(impact)}`);
            }
            console.log();
          }

          if (booted.didAutoInit) {
            try {
              const { previewContent, formatPreviewBlock } = await import('../content/preview.ts');
              const preview = previewContent({
                projectDir: cwd,
                contentDir: booted.contentDir,
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

  return cmd;
}
