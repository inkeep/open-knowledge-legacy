/**
 * `bootServer` — HTTP + WebSocket wrapping layer around `createServer()`.
 *
 * Three consumers share this composed boot path:
 *   1. CLI `ok start` (via `bootStartServer` in packages/cli)
 *   2. Electron utility process (direct import — precedent #14-adjacent, D35)
 *   3. Integration tests
 *
 * Before this extraction (D35) every consumer reimplemented HTTP + WS upgrade
 * + `listen()` + `updateServerLockPort` + idle-shutdown + composite destroy.
 * The extraction consolidates those ~150 LOC here so all three callers share
 * a single tested orchestrator.
 *
 * Opt-outs (D36 — Electron utility uses these):
 *   - `attachUiSibling: false` — suppress UI-sibling spawn flow
 *   - `idleShutdownMs: null` — disable idle-shutdown entirely
 *   - `skipAutoInit: true` — skip the pre-createServer scaffold hook
 *
 * CLI-specific concerns (`initContent`, `spawnOkUi`, banner, signal handlers)
 * are NOT part of bootServer — the CLI wrapper layers them on top via
 * injected callbacks + post-return orchestration.
 */
import type { Server as HttpServer } from 'node:http';
import type { Config } from './config/schema.ts';
import { attachIdleShutdown, type IdleShutdownHandle } from './idle-shutdown.ts';
import { getLogger, type PinoLogger } from './logger.ts';
import { createMcpHttpHandler } from './mcp-http.ts';
import { mountMcpAndApi } from './mcp-mount.ts';
import type { EnsureProjectGitResult } from './project-git.ts';
import { createServer, type ServerInstance, type ServerOptions } from './standalone.ts';
import { initTelemetry, shutdownTelemetry } from './telemetry.ts';

/** 30 minutes — default idle threshold. */
const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;
const DESTROY_STEP_TIMEOUT_MS = 5000;

export interface BootServerOptions
  extends Pick<
    ServerOptions,
    | 'contentDir'
    | 'projectDir'
    | 'contentRoot'
    | 'port'
    | 'host'
    | 'quiet'
    | 'debounce'
    | 'maxDebounce'
    | 'gitEnabled'
    | 'commitDebounceMs'
    | 'wipRef'
    | 'includePatterns'
    | 'excludePatterns'
    | 'destroyTimeoutMs'
    | 'localOpCliArgs'
    | 'onAgentWrite'
    | 'shadowRepo'
    | 'enableTestRoutes'
    | 'lockKind'
  > {
  /**
   * The project's loaded `Config` (parsed from `.open-knowledge/config.yml`,
   * with schema defaults applied). Threaded into `createMcpHttpHandler` so
   * MCP tool handlers see the user-configured values for `historyDepth`,
   * `maxResults`, `folders`, `content.include`/`exclude`, etc. instead of
   * fabricated defaults.
   */
  config: Config;
  /**
   * If false, `bootServer` does NOT run the pre-createServer `autoInitFn` or
   * invoke UI-sibling spawn logic. Default false.
   */
  skipAutoInit?: boolean;
  /**
   * If false, UI-sibling callbacks (`spawnUiSiblingFn` / `onSkipUiSpawn`) are
   * NOT invoked regardless of `spawnUiSiblingFn` presence. Default true —
   * preserves CLI back-compat when the flag is omitted.
   *
   * Electron utility sets this to `false` (D36): the BrowserWindow IS the UI
   * surface; there is no `ok ui` sibling to spawn.
   */
  attachUiSibling?: boolean;
  /**
   * Idle-shutdown threshold in milliseconds. `null` disables idle-shutdown
   * entirely (Electron utility sets this to `null` per D36 — window lifecycle
   * owns utility lifetime). Default 30 * 60 * 1000.
   */
  idleShutdownMs?: number | null;
  /**
   * Pre-createServer scaffolding hook. CLI injects `initContent`; desktop
   * leaves this undefined (no-op). Called only when `skipAutoInit === false`.
   * Returns `true` if any scaffolding occurred during this invocation.
   */
  autoInitFn?: () => boolean | Promise<boolean>;
  /**
   * Pre-createServer fail-fast hook for ensuring the project has a `.git/`
   * directory. CLI + Vite dev plugin + integration test harness inject
   * `ensureProjectGit`; desktop utility passes it through from its own import.
   * Called only when `skipAutoInit === false`. Runs BEFORE `autoInitFn` and
   * BEFORE `httpServer.listen()` so that on failure, `bootServer` rejects
   * before any port is bound (SPEC D12 — no degraded fallback).
   */
  ensureProjectGitFn?: () => Promise<EnsureProjectGitResult>;
  /**
   * CLI-specific UI-sibling spawn orchestration. Called once after the server
   * has bound a port IF `attachUiSibling !== false`. Receives `lockDir` so the
   * CLI's spawn helper can read the current ui.lock + decide whether to spawn.
   */
  spawnUiSiblingFn?: (ctx: { lockDir: string; log: PinoLogger }) => void | Promise<void>;
  /**
   * Idle-shutdown handler — run when the server has been idle past the
   * threshold. The CLI passes a handler that SIGTERMs the `ok ui` sibling
   * before calling `destroyServer()`; the desktop utility never wires this
   * handler because `idleShutdownMs: null`.
   */
  idleShutdownHandler?: (destroyServer: () => Promise<void>) => () => Promise<void>;
  /** Injectable logger. Defaults to `getLogger('boot')`. */
  log?: PinoLogger;
  /**
   * Grace period (ms) before keepalive-close triggers session cleanup. Default 30 000.
   * Integration tests pass a small value (e.g. 100) for fast teardown.
   */
  keepaliveGraceMs?: number;
  /**
   * Skip the durable state-manifest pre-flight gate
   * (`assertCompatibleStateManifest`). Default `false`.
   *
   * Production code paths (CLI `ok start`, Electron utility, Vite dev plugin)
   * leave this `false` so an incompatible cold start fails loud before the
   * server touches any shadow-repo state.
   *
   * The integration test harness passes `true` because each test allocates a
   * fresh tmpdir per test (no pre-existing state) and parallel `createServer`
   * invocations against thousands of throwaway content dirs would otherwise
   * spam manifest writes for no benefit. Tests that explicitly exercise the
   * adoption path or version-mismatch behavior leave it `false`. (Resolves
   * SPEC Q3 under D14.)
   */
  skipStateManifestCheck?: boolean;
}

export interface BootedServer {
  /** The bound HTTP server listening on `port`. */
  httpServer: HttpServer;
  /** Composite shutdown — closes httpServer, detaches idle-shutdown, destroys the Hocuspocus server (which releases server.lock). */
  destroy: () => Promise<void>;
  /** Absolute path to `<contentDir>/.open-knowledge`. */
  lockDir: string;
  /** Resolved content directory. */
  contentDir: string;
  /** The kernel-assigned port `httpServer` is bound to. */
  port: number;
  /** Resolves when async server init (shadow repo, file watcher subscription) completes. */
  ready: Promise<void>;
  /** Subsystems that failed to initialize — read AFTER `ready` for a stable list. */
  degraded: readonly string[];
  /** `true` if `autoInitFn` scaffolded anything during this boot. */
  didAutoInit: boolean;
  /** `true` if `ensureProjectGitFn` ran `git init` during this boot. `false` when the hook was omitted or the project already had `.git/`. */
  didGitInit: boolean;
  /** Full ServerInstance from createServer — exposed for advanced consumers (e.g., desktop utility's drain sequencing). */
  serverInstance: ServerInstance;
}

/**
 * Boot the collab server end-to-end and return a handle. Pure of process-level
 * concerns (signal handlers, banner, browser-open, exit codes) so the CLI
 * wrapper and Electron utility can each layer their own concerns on top.
 */
export async function bootServer(opts: BootServerOptions): Promise<BootedServer> {
  const skipAutoInit = opts.skipAutoInit ?? false;
  const attachUi = opts.attachUiSibling ?? true;
  const idleMsOption = opts.idleShutdownMs;
  const log = opts.log ?? getLogger('boot');

  // Lock-kind resolution. Explicit option wins over env. `OK_LOCK_KIND` is
  // the contract used by the MCP detach-spawn path in
  // `packages/cli/src/mcp/shim.ts` — direct callers (CLI `ok start`,
  // Electron utility) leave it unset. Default `interactive` so
  // omitted-everywhere boots are user-facing servers. Idle-shutdown is the
  // sole teardown trigger; there is no parent-death watch.
  const envLockKind =
    process.env.OK_LOCK_KIND === 'mcp-spawned' || process.env.OK_LOCK_KIND === 'interactive'
      ? process.env.OK_LOCK_KIND
      : undefined;
  const lockKind = opts.lockKind ?? envLockKind ?? 'interactive';

  // Initialize OpenTelemetry before any spans could be emitted. No-op when
  // OTEL_SDK_DISABLED != 'false' (default — zero overhead when disabled).
  initTelemetry();

  // Lazy-import node:http so this module can be `import`'d in a browser-like
  // environment for typechecking without pulling network deps at parse time.
  // `ws` (the WebSocket server) is loaded by `mountMcpAndApi` further down.
  const { createServer: createHttpServer } = await import('node:http');
  const { updateServerLockPort } = await import('./server-lock.ts');

  // Pre-createServer fail-fast hook — ensure project .git/ exists. Runs BEFORE
  // autoInitFn and BEFORE httpServer.listen() so that on failure, bootServer
  // rejects before any port is bound. No try/catch — errors propagate (D12).
  let didGitInit = false;
  if (!skipAutoInit && opts.ensureProjectGitFn) {
    const gitResult = await opts.ensureProjectGitFn();
    didGitInit = Boolean(gitResult.didInit);
  }

  // Pre-createServer scaffold hook. CLI passes initContent; desktop omits.
  let didAutoInit = false;
  if (!skipAutoInit && opts.autoInitFn) {
    try {
      const initResult = await opts.autoInitFn();
      didAutoInit = Boolean(initResult);
    } catch (err) {
      log.warn({ err }, 'autoInitFn failed');
    }
  }

  // Compose createServer options from the subset we accept.
  const serverInstance = createServer({
    contentDir: opts.contentDir,
    projectDir: opts.projectDir,
    contentRoot: opts.contentRoot,
    port: opts.port,
    host: opts.host,
    quiet: opts.quiet ?? false,
    debounce: opts.debounce,
    maxDebounce: opts.maxDebounce,
    gitEnabled: opts.gitEnabled,
    commitDebounceMs: opts.commitDebounceMs,
    wipRef: opts.wipRef,
    enableTestRoutes: opts.enableTestRoutes,
    shadowRepo: opts.shadowRepo,
    includePatterns: opts.includePatterns,
    excludePatterns: opts.excludePatterns,
    destroyTimeoutMs: opts.destroyTimeoutMs,
    localOpCliArgs: opts.localOpCliArgs,
    onAgentWrite: opts.onAgentWrite,
    lockKind,
    skipStateManifestCheck: opts.skipStateManifestCheck,
  });

  const {
    hocuspocus,
    destroy: destroyHocuspocus,
    ready,
    degraded,
    lockDir,
    sessionManager,
    agentFocusBroadcaster,
    agentPresenceBroadcaster,
  } = serverInstance;

  const mcpHost = (() => {
    const host = opts.host ?? 'localhost';
    if (host === '0.0.0.0' || host === '::') return 'localhost';
    return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  })();
  let boundPort = opts.port ?? 0;
  const mcpHttpHandler = createMcpHttpHandler({
    contentDir: opts.contentDir,
    projectDir: opts.projectDir ?? opts.contentDir,
    config: opts.config,
    getServerUrl: () => `http://${mcpHost}:${boundPort}`,
    log,
  });

  // HTTP server — `mountMcpAndApi` installs the `/mcp` + `/api/*` request
  // routing and the `/collab` + `/collab/keepalive` upgrade handler. Static
  // React assets are served separately by `ok ui` (a CLI wrapper concern, not
  // modeled here).
  const httpServer = createHttpServer();

  const mount = mountMcpAndApi({
    httpServer,
    hocuspocus,
    mcpHttpHandler,
    log,
    sessionManager,
    agentFocusBroadcaster,
    agentPresenceBroadcaster,
    keepaliveGraceMs: opts.keepaliveGraceMs,
  });

  // Idle-shutdown wiring — suppressed entirely when idleShutdownMs is null.
  // The CLI uses this to tear down both its own server and the `ok ui` sibling
  // after 30 min of zero WS clients; the Electron utility disables it because
  // window-close IS the shutdown trigger (D36).
  let idleHandle: IdleShutdownHandle | null = null;
  if (idleMsOption !== null) {
    const idleMs = idleMsOption ?? DEFAULT_IDLE_THRESHOLD_MS;
    const idleHandler =
      opts.idleShutdownHandler ??
      ((destroyFn) => async () => {
        await destroyFn();
      });
    idleHandle = attachIdleShutdown({
      httpServer,
      thresholdMs: idleMs,
      log,
      onShutdown: idleHandler(async () => {
        await destroyHocuspocus();
      }),
    });
  }

  // Listen — resolves only after the kernel has bound the port so callers
  // can probe `port` immediately.
  await new Promise<void>((resolveListen, reject) => {
    const onError = (err: Error) => reject(err);
    httpServer.once('error', onError);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.removeListener('error', onError);
      resolveListen();
    });
  });

  const addr = httpServer.address();
  const realPort = typeof addr === 'object' && addr !== null ? addr.port : (opts.port ?? 0);
  boundPort = realPort;
  updateServerLockPort(lockDir, realPort);

  // UI-sibling spawn — CLI wrapper injects `spawnUiSiblingFn`; desktop leaves
  // `attachUiSibling: false` and this flow is suppressed.
  if (attachUi && opts.spawnUiSiblingFn) {
    try {
      await opts.spawnUiSiblingFn({ lockDir, log });
    } catch (err) {
      log.warn({ err }, 'spawnUiSiblingFn failed');
    }
  }

  let destroyed = false;
  const withDestroyTimeout = async (name: string, work: () => Promise<void>): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`${name} timed out after ${DESTROY_STEP_TIMEOUT_MS}ms`));
          }, DESTROY_STEP_TIMEOUT_MS);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  const destroy = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    const errors: unknown[] = [];
    const runStep = async (name: string, work: () => Promise<void>): Promise<void> => {
      try {
        await withDestroyTimeout(name, work);
      } catch (err) {
        errors.push(err);
        log.warn({ err, step: name }, 'bootServer destroy step failed');
      }
    };

    try {
      idleHandle?.detach();
    } catch (err) {
      errors.push(err);
      log.warn({ err, step: 'idleHandle.detach' }, 'bootServer destroy step failed');
    }

    await runStep('mount.shutdown', () => mount.shutdown());
    await runStep('mcpHttpHandler.close', () => mcpHttpHandler.close());
    await runStep(
      'mount.wss.close',
      () =>
        new Promise<void>((resolveClose, rejectClose) => {
          mount.wss.close((err) => (err ? rejectClose(err) : resolveClose()));
        }),
    );
    await runStep(
      'httpServer.close',
      () =>
        new Promise<void>((resolveClose) => {
          httpServer.close(() => resolveClose());
        }),
    );
    await runStep('destroyHocuspocus', () => destroyHocuspocus());
    // Flush pending spans/metrics LAST so the teardown sequence itself is
    // observable. shutdownTelemetry is idempotent and has its own timeout.
    await runStep('shutdownTelemetry', () => shutdownTelemetry());

    if (errors.length > 0) {
      throw new AggregateError(errors, 'bootServer destroy completed with errors');
    }
  };

  return {
    httpServer,
    destroy,
    lockDir,
    contentDir: opts.contentDir,
    port: realPort,
    ready,
    degraded,
    didAutoInit,
    didGitInit,
    serverInstance,
  };
}
