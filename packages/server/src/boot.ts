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

// Re-export `toBroadcasterKey` so existing callers (test harnesses, direct
// imports from `./boot.ts`) keep working after the helper was consolidated
// into `./agent-id.ts`. Canonical definition lives in `agent-id.ts` alongside
// the `AGENT_ID_RE` validator — both concerns are one contract.
export { toBroadcasterKey } from './agent-id.ts';

import { toBroadcasterKey, validateAgentId } from './agent-id.ts';
import { attachIdleShutdown, type IdleShutdownHandle } from './idle-shutdown.ts';
import { getLogger, type PinoLogger } from './logger.ts';
import { handleCollabSocketError } from './metrics.ts';
import type { EnsureProjectGitResult } from './project-git.ts';
import { createServer, type ServerInstance, type ServerOptions } from './standalone.ts';

/** 30 minutes — matches SPEC §9 default threshold. */
const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

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
    | 'uploadConfig'
  > {
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

  // Lazy-import node:http and ws so this module can be `import`'d in a browser-
  // like environment for typechecking without pulling network deps at parse time.
  const { createServer: createHttpServer } = await import('node:http');
  const { WebSocketServer } = await import('ws');
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
    uploadConfig: opts.uploadConfig,
  });

  const {
    hocuspocus,
    destroy: destroyHocuspocus,
    ready,
    degraded,
    lockDir,
    agentPresenceBroadcaster,
  } = serverInstance;

  // HTTP server — /api/* routed through Hocuspocus onRequest extensions;
  // everything else 404s (static React assets are served separately by
  // `ok ui`, which is a CLI wrapper concern and not modeled here).
  const httpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url?.startsWith('/api/')) {
      hocuspocus
        // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
        .hooks('onRequest', { request: req, response: res } as any)
        .then(() => {
          if (res.writableEnded || res.headersSent) return;
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'API route not found', path: url }));
        })
        .catch((err) => {
          log.error({ err }, 'Unhandled onRequest error');
          if (!res.writableEnded && !res.headersSent) {
            res.writeHead(500);
            res.end('Internal server error');
          } else if (!res.writableEnded) {
            res.end();
          }
        });
      return;
    }
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

  // Grace period before keepalive-close triggers session cleanup (D28).
  const KEEPALIVE_GRACE_MS = opts.keepaliveGraceMs ?? 10_000;
  // connectionId → pending grace timer handle
  const keepaliveGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // In-flight grace-timer callbacks so destroy() can await them rather than
  // racing against the sessionManager / agentFocusBroadcaster teardown.
  const keepaliveGraceInflight = new Set<Promise<void>>();
  // Set when destroy() runs so any callback that fired just before the timer
  // was cleared can short-circuit instead of touching disposed resources.
  let shuttingDown = false;

  httpServer.on('upgrade', (req, socket, head) => {
    // D-034 — MCP keep-alive channel (see CLI start.ts for full rationale).
    if (req.url?.startsWith('/collab/keepalive')) {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (handleCollabSocketError(err)) return;
        log.error({ err }, 'MCP keepalive socket error');
      });
      wss.handleUpgrade(req, socket, head, (ws) => {
        // D27/D28: parse connectionId from URL query params. This id is used
        // for both (a) identity-attribution session cleanup (`closeAllForAgent`
        // + `clearFocus`) and (b) multi-agent-presence cleanup
        // (`clearPresence`). Legacy MCP clients that don't send `connectionId`
        // fall through to TTL-only cleanup (5s filter on the client, §FR-5).
        // Malformed URLs → null → no-op. Never throws. The parser also
        // enforces `AGENT_ID_RE` so CR/LF bytes or other attacker-controlled
        // chars never reach structured log fields or broadcaster keys.
        const connectionId = parseKeepaliveConnectionId(req.url);

        // D28: if reconnecting within grace period, cancel the timer.
        if (connectionId) {
          const existing = keepaliveGraceTimers.get(connectionId);
          if (existing !== undefined) {
            clearTimeout(existing);
            keepaliveGraceTimers.delete(connectionId);
            log.info({ connectionId }, '[keepalive] reconnect during grace — timer cancelled');
          }
        }

        const pingTimer = setInterval(() => {
          try {
            ws.ping();
          } catch {
            // best-effort
          }
        }, 30_000);
        pingTimer.unref?.();

        // Presence-ts refresh timer — tied to this WS's lifetime. The
        // client-side TTL filter hides entries with `now - ts >= 5s`.
        // Write-path calls (setPresence/touchMode) only fire on MCP edits,
        // so agents between tool calls (LLM thinking for 10-30s) would
        // otherwise have their badge disappear mid-session even though
        // the keepalive WS is still open. A 3s bump cadence consistently
        // beats the 5s filter. No-op if connectionId is null (legacy MCP
        // client that doesn't pass connectionId — TTL-only path still works
        // the same way).
        //
        // `toBroadcasterKey(connectionId)` translates the raw URL-carried id
        // to the `agent-<id>` map key used by the HTTP write handlers (via
        // `extractAgentIdentity`). Without this translation bumpPresenceTs
        // would no-op because no entry exists under the raw key — see the
        // STOP rule in AGENTS.md "the `agent-` prefix convention".
        const tsRefreshTimer = connectionId
          ? setInterval(() => {
              agentPresenceBroadcaster?.bumpPresenceTs(toBroadcasterKey(connectionId));
            }, 3_000)
          : null;
        tsRefreshTimer?.unref?.();

        ws.on('close', () => {
          clearInterval(pingTimer);
          if (tsRefreshTimer !== null) clearInterval(tsRefreshTimer);
          if (!connectionId) return;
          // D28: start grace timer. Reconnect within the window cancels above.
          const timer = setTimeout(() => {
            keepaliveGraceTimers.delete(connectionId);
            // If destroy() already ran, skip — the sessionManager,
            // agentFocusBroadcaster, and agentPresenceBroadcaster may be
            // mid-teardown and calling into them would race (TOCTOU: timer
            // fires between destroy's clearTimeout loop and the Hocuspocus
            // teardown awaiting completion).
            if (shuttingDown) return;
            const work = (async () => {
              log.info({ connectionId }, '[keepalive] grace expired — cleaning up sessions');
              try {
                await serverInstance.sessionManager.closeAllForAgent(connectionId);
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] closeAllForAgent failed');
              }
              try {
                serverInstance.agentFocusBroadcaster?.clearFocus(connectionId);
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] clearFocus failed');
              }
              try {
                // `toBroadcasterKey(connectionId)` matches the `agent-<id>`
                // map key written by HTTP handlers via `extractAgentIdentity`
                // — without this translation clearPresence no-ops because
                // the raw URL id never matches the stored entry. See the
                // STOP rule in AGENTS.md "the `agent-` prefix convention".
                agentPresenceBroadcaster?.clearPresence(toBroadcasterKey(connectionId));
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] clearPresence failed');
              }
            })();
            keepaliveGraceInflight.add(work);
            work.finally(() => keepaliveGraceInflight.delete(work));
          }, KEEPALIVE_GRACE_MS);
          timer.unref?.();
          keepaliveGraceTimers.set(connectionId, timer);
          log.info(
            { connectionId, graceMs: KEEPALIVE_GRACE_MS },
            '[keepalive] disconnected — grace timer started',
          );
        });
        ws.on('error', (err: NodeJS.ErrnoException) => {
          if (!handleCollabSocketError(err)) {
            log.error({ err }, 'MCP keepalive WS error');
          }
          ws.terminate();
        });
      });
      return;
    }

    if (req.url?.startsWith('/collab')) {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (handleCollabSocketError(err)) return;
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
        ws.on('error', (err: NodeJS.ErrnoException) => {
          if (!handleCollabSocketError(err)) {
            log.error({ err }, 'WebSocket error');
          }
          ws.terminate();
        });
      });
    }
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
  const destroy = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    shuttingDown = true;
    try {
      idleHandle?.detach();
    } catch (err) {
      log.warn({ err }, '[bootServer.destroy] idleHandle.detach failed');
    }
    // Cancel any pending keepalive-grace timers so they don't fire against a
    // disposed sessionManager / agentFocusBroadcaster after destroy returns.
    for (const timer of keepaliveGraceTimers.values()) {
      clearTimeout(timer);
    }
    keepaliveGraceTimers.clear();
    // A grace-timer callback may have fired between our clearTimeout loop and
    // now — the async work is already in keepaliveGraceInflight. Await it so
    // Hocuspocus teardown doesn't race with an in-flight closeAllForAgent.
    if (keepaliveGraceInflight.size > 0) {
      await Promise.allSettled([...keepaliveGraceInflight]);
    }
    // Bound the listener shutdown so a stuck keep-alive socket or hung
    // upgrade can't wedge the server.lock release. `closeAllConnections()`
    // (Node ≥18.2) severs in-flight sockets, and the 10s race guarantees
    // forward progress. The `try/finally` is load-bearing: `destroyHocuspocus`
    // MUST run so its own `try/finally` can release the server.lock — the
    // outer wrapper's earlier shape silently skipped it when close() hung.
    try {
      try {
        httpServer.closeAllConnections?.();
      } catch (err) {
        log.warn({ err }, '[bootServer.destroy] closeAllConnections failed');
      }
      // Capture the race-timer handle so we can cancel it on the happy
      // path. Without this, a `close()` that resolves before 10 s leaves
      // the `setTimeout` handle pending in the event loop — timers are
      // ref'd by default, which keeps Node alive and defeats the
      // "release everything ASAP" contract destroy() is meant to uphold.
      // Symptom surfaces under tests that spin up+tear down bootServer
      // rapidly, or in the Electron utility's shutdown path.
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          new Promise<void>((resolveClose) => httpServer.close(() => resolveClose())),
          new Promise<void>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('httpServer.close timeout after 10s')),
              10_000,
            );
          }),
        ]).catch((err) => {
          log.warn(
            { err },
            '[bootServer.destroy] httpServer.close did not complete within timeout',
          );
        });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    } finally {
      await destroyHocuspocus();
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

/**
 * Extract + validate the `connectionId` query param from a `/collab/keepalive`
 * upgrade URL. Tolerant of: missing URL (`undefined`), unparseable URL,
 * missing/empty `connectionId`. Values that do not match `AGENT_ID_RE`
 * (`[a-zA-Z0-9_-]+`) return `null` — the close handler then falls through
 * to TTL-only cleanup rather than firing `clearPresence` /
 * `closeAllForAgent` / `clearFocus` with attacker-controlled bytes.
 *
 * The validation is intentionally identical to the HTTP write path
 * (`extractAgentIdentity` in `api-extension.ts`) so the write surface and
 * the cleanup surface share one contract. Without it, a caller who can
 * reach the keepalive WS (e.g. an unauthenticated peer when the user has
 * bound to `0.0.0.0`) could force-evict another agent's presence entry
 * by passing a crafted `connectionId=<victim>` on WS close. The shared
 * regex also prevents CR/LF bytes in query-string values from reaching
 * the structured `[keepalive] disconnected` log line (log-injection
 * defense-in-depth — pino escapes these but some transports strip the
 * escaping after egress).
 *
 * Exported for unit testing. Never throws.
 */
export function parseKeepaliveConnectionId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // The second arg is a dummy base so `new URL` accepts path-only inputs.
    const parsed = new URL(url, 'http://localhost');
    const connectionId = parsed.searchParams.get('connectionId');
    return validateAgentId(connectionId);
  } catch {
    return null;
  }
}
