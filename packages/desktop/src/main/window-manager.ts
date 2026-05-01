/**
 * Main-process window manager — spawns BrowserWindow + utilityProcess pairs
 * per project, with an attach branch that reuses an existing live same-host
 * Open Knowledge server (CLI sibling, another Electron instance, or any
 * bootServer caller).
 *
 * Each project window either:
 *   - (spawn mode, the common case) owns one `utilityProcess.fork` with
 *     `windowLifecycleBound: true, windowLifecycleGraceTime: 6000` + a
 *     BrowserWindow with preload-injected `--ok-collab-url` argv flags.
 *   - (attach mode) just owns the BrowserWindow;
 *     `window.okDesktop.config.collabUrl` points at the already-listening
 *     server, nothing is torn down on close. `ProjectContext.ownsServer ===
 *     false` gates every lifecycle action.
 *
 * Attach trigger: `<contentDir>/.ok/server.lock` references a
 * live same-host pid with `port > 0`. Stale locks flow through `runClean`
 * first, then spawn-mode proceeds.
 *
 * If a project's contentDir is already open in another window of THIS app,
 * surface "Focus existing window" instead of spawning a duplicate. Tracked
 * via `Map<contentDir, ProjectContext>`.
 *
 * Pure factories take injected `electron` deps so tests don't need a real
 * Electron runtime.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { sendToRenderer } from '../shared/ipc-send.ts';

/**
 * Default poll after SIGTERMing an `mcp-spawned` lock holder. Loops at
 * 25 ms until either:
 *   (a) the lock file is gone (clean release), OR
 *   (b) the recorded `pid` is no longer alive (process died but didn't
 *       release — `acquireServerLock` will treat it as stale + replace).
 *
 * Considering the holder's pid liveness is load-bearing: bun does not
 * always release the lock cleanly on SIGTERM (the bootServer destroy
 * chain races signal-exit), but the dead pid + stale lock state is
 * fully reclaimable by the next `acquireServerLock` call.
 *
 * Returns `true` when the lock is reclaimable, `false` on deadline.
 * Tests inject `WindowManagerDeps.waitForLockReleased` to return
 * synchronously.
 */
async function pollLockReleasedDefault(lockDir: string, deadlineMs: number): Promise<boolean> {
  const lockPath = resolve(lockDir, 'server.lock');
  const tickMs = 25;
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (!existsSync(lockPath)) return true;
    try {
      const raw = readFileSync(lockPath, 'utf-8');
      const parsed = JSON.parse(raw) as { pid?: number };
      if (typeof parsed.pid === 'number' && !isProcessAliveLocal(parsed.pid)) {
        return true;
      }
    } catch {
      // Corrupt / unreadable lock — treat as reclaimable; the next
      // `acquireServerLock` call will unlink + replace it.
      return true;
    }
    await new Promise((r) => setTimeout(r, tickMs));
  }
  return !existsSync(lockPath);
}

/**
 * Local mirror of `isProcessAlive` — kept inline here instead of importing
 * from `@inkeep/open-knowledge-server` so this module's runtime surface
 * stays as small as it was before the auto-kill path landed (single-pid
 * `process.kill(pid, 0)` semantics: EPERM still implies alive).
 */
function isProcessAliveLocal(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'EPERM'
    ) {
      return true;
    }
    return false;
  }
}

/**
 * Editor window title format — `<projectName> — Open Knowledge`. The em dash
 * + app-name suffix follows the macOS/VS Code/Cursor convention: the project
 * name leads so users can scan the Dock / Cmd-Tab switcher by content, and
 * the app branding is retained as a recognizable tail. Exported for tests.
 *
 * Navigator windows use a static "Open Knowledge" title set in
 * `navigator-window.ts` — no project context there to prepend.
 */
function formatEditorTitle(projectName: string): string {
  return `${projectName} — Open Knowledge`;
}

/** Subset of `electron.BrowserWindow` we use — keeps tests Electron-free. */
export interface BrowserWindowLike {
  focus(): void;
  /**
   * Present the window if hidden + restore if minimized. Optional because not
   * every consumer exercises the URL-scheme deep-link path that needs them
   * (the pre-M4 focus-only flow in `createProjectWindow` doesn't). Missing at
   * runtime → silently skipped.
   */
  show?(): void;
  restore?(): void;
  isMinimized?(): boolean;
  /**
   * `true` when the underlying Electron native window has been destroyed.
   * Optional for tests — when omitted, we assume the window is alive and
   * skip the destroyed-guard. Production wiring uses Electron's
   * `BrowserWindow.isDestroyed()`.
   */
  isDestroyed?(): boolean;
  on(event: 'closed', cb: () => void): void;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
    once(event: 'dom-ready', cb: () => void): void;
    /**
     * `will-navigate` + `setWindowOpenHandler` used by the asset-click
     * safety net (SPEC 2026-04-23 FR-A7 / D-A10). Narrow structural
     * signature — tests that don't exercise the safety net can leave
     * these as no-ops. Matches Electron's `WebContents` at runtime.
     */
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'allow' | 'deny' }): void;
    on(
      event: 'will-navigate',
      handler: (event: { preventDefault: () => void }, url: string) => void,
    ): void;
  };
  loadFile(filePath: string): Promise<void>;
  loadURL(url: string): Promise<void>;
}

/** Subset of `electron.utilityProcess.fork`'s return — shape we use. */
export interface UtilityProcessLike {
  pid: number | undefined;
  postMessage(msg: unknown): void;
  on(event: 'message', cb: (msg: unknown) => void): void;
  on(event: 'exit', cb: (code: number | null) => void): void;
  once(event: 'message', cb: (msg: unknown) => void): void;
  removeListener?(event: 'message', cb: (msg: unknown) => void): void;
  removeListener?(event: 'exit', cb: (code: number | null) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

/**
 * Minimal shape of `server.lock` metadata that the attach probe consumes.
 * Intentionally structural (not imported from `@inkeep/open-knowledge-server`)
 * to keep this module runtime-independent of the server package — the real
 * shape is `ServerLockMetadata` from process-lock.ts and is type-compatible.
 *
 * `kind` and `capabilities` are optional for legacy-lock tolerance — locks
 * written by older binaries omit them, and the desktop conservatively
 * refuses to attach when any are absent (forces a fresh spawn rather than
 * risk attaching to a server with unknown semantics).
 */
export interface ServerLockMetadataLike {
  pid: number;
  hostname: string;
  port: number;
  startedAt: string;
  worktreeRoot: string;
  kind?: 'interactive' | 'mcp-spawned';
  capabilities?: string[];
}

interface ProjectContext {
  /**
   * User-facing absolute project path — as the caller supplied it after
   * `path.resolve`. Used for UI labels, recents list, and argv flags so
   * users continue to see the path they picked (e.g. a symlinked
   * workspace dir) rather than the realpath.
   */
  projectPath: string;
  /**
   * Canonical realpath — `realpathSync(projectPath)` if accessible, else
   * `projectPath` (fallback on ENOENT / EACCES). Used as the key into
   * `windowsByPath` so a deep-link URL carrying the canonical realpath
   * (emitted by `preview-url.ts:realpathSync(ctx.contentDir)`) matches a
   * window opened via a symlinked path. Without this, the producer/consumer
   * asymmetry causes `focusWindowForProject` to miss and spawn a duplicate.
   */
  canonicalKey: string;
  projectName: string;
  port: number;
  apiOrigin: string;
  window: BrowserWindowLike;
  /**
   * Utility we spawned for this window, or `null` in attach mode (the server
   * is owned by a sibling process — typically `ok start` run from a terminal
   * — and this window just connected to it).
   */
  utility: UtilityProcessLike | null;
  /**
   * Whether this window's process owns the utility/server lifecycle. Gates
   * shutdown IPC on window close and the post-exit liveness probe. When
   * `false`, closing the window leaves the sibling-owned server running.
   */
  ownsServer: boolean;
}

interface CreateProjectWindowOpts {
  projectPath: string;
  /**
   * Optional deep-link doc to deliver to the renderer after window mount.
   * Used by the `openknowledge://` URL scheme handler (M4) so the send is
   * registered BEFORE `await loadURL` and fires via `webContents.once(
   * 'dom-ready', ...)` — same pattern as the git-init-notice toast.
   * Delivery ordering is load-bearing: registering after loadURL resolves
   * silently misses dom-ready (which fires before did-finish-load). Pairs
   * with the renderer's `ok:deep-link` subscriber in `main.tsx`.
   */
  pendingDeepLinkDoc?: string;
}

/** Test-injectable side-effect surface (Electron + node:fs primitives). */
export interface WindowManagerDeps {
  /** `electron.BrowserWindow` constructor (subsetted). */
  createWindow(opts: {
    additionalArguments: string[];
    /**
     * Window title — the project name. Passed through to Electron's
     * `new BrowserWindow({ title })` so users can distinguish open windows
     * at the OS level (Dock, Mission Control, ⌘-` switcher, Cmd+Tab).
     * Main-process also hooks `page-title-updated` to prevent the renderer's
     * `<title>Open Knowledge</title>` from overwriting this after load.
     */
    title: string;
    /** Other webPreferences / window opts the manager wants to set. */
  }): BrowserWindowLike;
  /** `electron.utilityProcess.fork(entry, args, opts)`. */
  forkUtility(entry: string, opts: { windowLifecycleBound?: boolean }): UtilityProcessLike;
  /** Path to the bundled utility-entry script (electron-vite output). */
  utilityEntryPath: string;
  /** Path to the bundled renderer index.html (extraResources `app/index.html` or dev shell). */
  rendererEntryPath: string;
  /** electron-vite dev-server URL (`process.env.ELECTRON_RENDERER_URL`). When present,
   *  main uses `loadURL` for HMR; otherwise falls back to `loadFile(rendererEntryPath)`. */
  rendererDevUrl?: string | null;
  /** Schedule a one-shot timer (test injection for the post-exit liveness probe). */
  setTimeout(cb: () => void, ms: number): unknown;
  /** `process.kill(pid, signal)` — used in the post-exit liveness probe. */
  killProbe(pid: number, signal: number | NodeJS.Signals): void;
  /** Optional hook to run runClean before forking the utility (D44). */
  runClean?(opts: { lockDir: string }): Promise<void>;
  /**
   * Resolve a path to its canonical realpath (dereference symlinks). Only
   * used for `windowsByPath` keying — a deep-link URL emitted by MCP's
   * `preview-url.ts` carries `realpathSync(contentDir)` as its `project`
   * query param (M4 AC8). Without matching canonicalization here, a user
   * who opened a project via a symlinked path would see the deep-link miss
   * `focusWindowForProject` and spawn a duplicate window.
   *
   * Production: `fs.realpathSync`. Tests inject to simulate symlinks
   * without touching the filesystem. Throws (ENOENT, EACCES) fall back to
   * the input path so the pre-canonicalization behavior is preserved on
   * unreadable paths.
   */
  realpathSync?(p: string): string;
  /**
   * Read the Open Knowledge server lock at `<lockDir>/server.lock`. Returns
   * null if absent or corrupt. Production: `readServerLock` from
   * `@inkeep/open-knowledge-server`. Tests inject a stub.
   *
   * When omitted (back-compat with existing tests), the attach branch is
   * effectively disabled and every call spawns a fresh utility.
   */
  readServerLock?(lockDir: string): ServerLockMetadataLike | null;
  /**
   * Check whether a pid is alive on this host (EPERM counts as alive per the
   * `process.kill(pid, 0)` semantics in `isProcessAlive`). Production:
   * `isProcessAlive` from `@inkeep/open-knowledge-server`.
   */
  isProcessAlive?(pid: number): boolean;
  /**
   * Current host — `os.hostname()` in production. Used to compare against
   * `server.lock`'s `hostname` field so we only attach on same-host locks;
   * foreign-host locks fall through to spawn-mode.
   */
  hostname?(): string;
  /**
   * Probe `ws://localhost:<port>/collab/...` for a healthy WebSocket
   * upgrade. Resolves `true` on the `open` event, `false` on `close` or
   * timeout. Used as the final attach gate so a server claiming
   * `capabilities: ["ws"]` but actually hanging WS upgrades (the live
   * symptom that motivated this validation) is caught before any document
   * load is attempted.
   *
   * Production wiring uses the platform `WebSocket`. Tests inject a stub
   * that resolves true/false synchronously (no real socket). When omitted,
   * the probe is skipped — back-compat path for tests that don't care
   * about this gate.
   */
  probeWsUpgrade?(url: string, timeoutMs: number): Promise<boolean>;
  /**
   * Send a signal to a process. Defaults to `process.kill` in production.
   * Used by the auto-kill collision handler to SIGTERM an `mcp-spawned`
   * server that lost the spawn race, before the desktop retries lock
   * acquisition. Tests inject a mock to count invocations.
   */
  killProcess?(pid: number, signal: NodeJS.Signals): void;
  /**
   * Returns `true` once `<lockDir>/server.lock` is gone, polling at the
   * tick interval until the deadline. Defaults to a polling implementation
   * that uses `existsSync` over the lock path. Test injections short-
   * circuit so the polling loop completes synchronously.
   */
  waitForLockReleased?(lockDir: string, deadlineMs: number): Promise<boolean>;
  /**
   * Upper bound (ms) on waiting for the utility to post `ready` or `error`
   * after `init`. Default 15s — enough margin for `bootServer` to run shadow-
   * repo init + initial file-watcher walk on a large project, narrow enough
   * that a silently-hung utility surfaces within a debuggable window. Test
   * injections typically pass a much smaller value.
   */
  utilityInitTimeoutMs?: number;
  /** Logger. */
  log?: {
    info(obj: object, msg: string): void;
    warn(obj: object, msg: string): void;
    error(obj: object, msg: string): void;
  };
  /**
   * Post-init persistent message listener, installed once after the
   * init-phase `ready` handshake settles — routes messages like
   * `debug-keyring-smoke-result` without competing with the init-phase
   * listener. Consumer narrows by `msg.type`.
   */
  onUtilityMessage?(msg: unknown): void;
  /**
   * Notified whenever a utility process emits `exit` (normal shutdown OR
   * crash). The debug-ipc relay uses this to cancel any pending
   * `debug-keyring-smoke` requests that were posted to this utility —
   * otherwise those entries sit in the pending Map until their per-request
   * timeout fires. Called with the same `utility` reference that was passed
   * to `onUtilityMessage`, so the consumer can identity-match.
   */
  onUtilityExit?(utility: UtilityProcessLike): void;
}

export class WindowManager {
  /**
   * canonicalKey → ProjectContext. Key is `realpathSync(resolve(projectPath))`
   * with an ENOENT fallback to `resolve(projectPath)`, so a deep-link URL
   * carrying the canonical realpath (emitted by `preview-url.ts:182`) matches
   * a window opened via a symlinked path. See `canonicalizeKey` + the
   * `canonicalKey` field on `ProjectContext`.
   */
  private readonly windowsByPath = new Map<string, ProjectContext>();

  constructor(private readonly deps: WindowManagerDeps) {}

  /**
   * Canonicalize a project path to its realpath. Dereferences symlinks so the
   * map key matches what `preview-url.ts` emits in `openknowledge://` URLs.
   * Falls back to `resolve(projectPath)` on ENOENT / EACCES so unreadable
   * paths don't throw past the call site.
   */
  private canonicalizeKey(projectPath: string): string {
    const absolute = resolve(projectPath);
    const rp = this.deps.realpathSync ?? realpathSync;
    try {
      return rp(absolute);
    } catch {
      return absolute;
    }
  }

  /**
   * Read-only snapshot for tests + the J7b dialog handler. Canonicalizes the
   * input via `canonicalizeKey` (realpath + resolve) — matches the key shape
   * used when `createProjectWindow` stores entries in `windowsByPath`.
   * Without this, callers that pass a non-resolved or symlinked path get
   * `undefined` even when the window actually exists. Symmetric with
   * `focusWindowForProject`.
   */
  getWindowFor(projectPath: string): ProjectContext | undefined {
    return this.windowsByPath.get(this.canonicalizeKey(projectPath));
  }

  /**
   * Narrow focus-only lookup used by the `openknowledge://` URL scheme router
   * (M4). If a window already owns `projectPath`, surface it (restore if
   * minimized, show if hidden) + return it for the caller to push a deep-link
   * event to. Returns `null` when no window matches.
   *
   * Find-or-nothing. Callers decide whether to spawn a new window when no
   * match exists — every project pick spawns a new window; only the
   * same-project warm deep-link case reuses.
   *
   * Path matching uses `canonicalizeKey` (realpath + resolve), the same
   * canonicalization `createProjectWindow` applies — so a deep-link URL
   * carrying a realpath matches a window opened via a symlinked path.
   */
  focusWindowForProject(projectPath: string): BrowserWindowLike | null {
    const ctx = this.windowsByPath.get(this.canonicalizeKey(projectPath));
    if (!ctx) return null;
    const win = ctx.window;
    if (win.isMinimized?.()) win.restore?.();
    win.show?.();
    win.focus();
    return win;
  }

  /**
   * Resolve the ProjectContext that owns a given BrowserWindow. Used by IPC
   * handlers that receive `event.sender.webContents` → BrowserWindow and need
   * to look up the window's project. Iterates `windowsByPath` (authoritative
   * map) instead of going through `appState.recentProjects`, which avoids a
   * stale-state race between `createProjectWindow` resolving and
   * `addRecentProject` persisting.
   */
  getContextForBrowserWindow(win: BrowserWindowLike): ProjectContext | undefined {
    for (const ctx of this.windowsByPath.values()) {
      if (ctx.window === win) return ctx;
    }
    return undefined;
  }

  windowCount(): number {
    return this.windowsByPath.size;
  }

  async createProjectWindow(opts: CreateProjectWindowOpts): Promise<ProjectContext> {
    const projectPath = resolve(opts.projectPath);
    const canonicalKey = this.canonicalizeKey(projectPath);
    const existing = this.windowsByPath.get(canonicalKey);
    if (existing) {
      // Focus existing rather than spawn a duplicate. Guard against a
      // destroyed BrowserWindow: there's a window of ~seconds between
      // `window.on('closed')` firing (which destroys the native object)
      // and `utility.on('exit')` firing (which clears the map entry,
      // gated by `windowLifecycleBound` shutdown completing). A click in
      // that gap would call `.focus()` on a destroyed object and throw
      // `TypeError: Object has been destroyed`. Treat destroyed entries
      // as stale and proceed to spawn-fresh.
      if (existing.window.isDestroyed?.() !== true) {
        existing.window.focus();
        return existing;
      }
      this.deps.log?.warn(
        { canonicalKey },
        '[window-manager] stale destroyed-window entry — clearing and re-creating',
      );
      this.windowsByPath.delete(canonicalKey);
    }
    const projectName = basename(projectPath);

    const lockDir = resolve(projectPath, '.ok');

    // Attach branch — if a live same-host server is already listening on
    // this contentDir (CLI sibling, another Electron instance that we
    // want to share with, etc.), skip the utility spawn entirely and just
    // point the renderer at the existing collab URL. `runClean` is also
    // skipped here because an attachable lock is by definition NOT stale.
    // Two-step: synchronous metadata gates first, then an async WS probe
    // only when the metadata gates passed. Keeping the no-lock fall-
    // through purely synchronous matters — an unconditional `await` here
    // would inject a microtask that re-orders the existing spawn-path
    // tests' synchronous `fire('ready')` against the utility fork.
    const candidate = this.tryAttachExistingServer(lockDir);
    const attached =
      candidate !== null && (await this.probeAttachableLock(candidate)) ? candidate : null;
    if (attached) {
      return this.attachToExistingServer({
        projectPath,
        canonicalKey,
        projectName,
        lock: attached,
        pendingDeepLinkDoc: opts.pendingDeepLinkDoc,
      });
    }

    if (this.deps.runClean) {
      try {
        await this.deps.runClean({ lockDir });
      } catch (err) {
        this.deps.log?.warn(
          { err: (err as Error).message, lockDir },
          'runClean failed; proceeding to fork utility',
        );
      }
    }

    // Init timeout: if utility has not posted `ready` or `error` within this
    // window, reject so `createProjectWindow` doesn't hang forever. A spawn-
    // phase hang is observable in the wild (bootServer throws synchronously
    // on a bad path, parent-death poll beats the `ready` handshake, utility
    // crashes before posting, etc.) — the reviewer flagged the original
    // implementation's lack of this guard as a Major issue.
    const INIT_TIMEOUT_MS = this.deps.utilityInitTimeoutMs ?? 15_000;

    // Retry loop. Outer iteration only re-runs when an `mcp-spawned`
    // server raced us to the lock between `runClean` and the utility's
    // `acquireServerLock`. For that case we SIGTERM the holder, wait for
    // the lock to release, then re-fork. Any other init failure (or a
    // second collision after a kill) propagates unchanged.
    let utility!: UtilityProcessLike;
    let port = 0;
    let apiOrigin = '';
    let didGitInit = false;
    for (let attempt = 1; ; attempt++) {
      utility = this.deps.forkUtility(this.deps.utilityEntryPath, {
        windowLifecycleBound: true,
      });
      const utilityRef = utility;
      const ready = new Promise<{ port: number; apiOrigin: string; didGitInit: boolean }>(
        (resolveReady, reject) => {
          let settled = false;
          const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            utilityRef.removeListener?.('message', onMessage);
            utilityRef.removeListener?.('exit', onExit);
            fn();
          };
          const onMessage = (msg: unknown) => {
            const m = msg as {
              type?: string;
              port?: number;
              apiOrigin?: string;
              message?: string;
              didGitInit?: boolean;
              kind?: string;
              existingLock?: ServerLockMetadataLike;
            };
            if (
              m.type === 'ready' &&
              typeof m.port === 'number' &&
              typeof m.apiOrigin === 'string'
            ) {
              const p = m.port;
              const o = m.apiOrigin;
              const g = m.didGitInit === true;
              settle(() => resolveReady({ port: p, apiOrigin: o, didGitInit: g }));
            } else if (m.type === 'error') {
              // Carry the structured error fields onto the thrown Error
              // so the retry catch can decide whether to auto-kill an
              // mcp-spawned holder vs. propagate.
              const richError = Object.assign(new Error(m.message ?? 'utility init failed'), {
                name: m.kind === 'lock-collision' ? 'LockCollisionError' : 'UtilityInitError',
                kind: m.kind,
                existingLock: m.existingLock,
              });
              settle(() => reject(richError));
            }
          };
          const onExit = (code: number | null) => {
            settle(() => reject(new Error(`utility exited before ready (code=${code})`)));
          };
          utilityRef.on('message', onMessage);
          utilityRef.on('exit', onExit);

          this.deps.setTimeout(() => {
            settle(() => reject(new Error(`utility init timed out after ${INIT_TIMEOUT_MS}ms`)));
          }, INIT_TIMEOUT_MS);
        },
      );

      utility.postMessage({
        type: 'init',
        opts: {
          contentDir: projectPath,
          projectDir: projectPath,
          port: 0,
          host: 'localhost',
        },
      });

      try {
        ({ port, apiOrigin, didGitInit } = await ready);
        break;
      } catch (err) {
        const richErr = err as Error & {
          kind?: string;
          existingLock?: ServerLockMetadataLike;
        };
        const collidedWithMcp =
          attempt === 1 &&
          richErr.name === 'LockCollisionError' &&
          richErr.existingLock?.kind === 'mcp-spawned' &&
          typeof richErr.existingLock.pid === 'number';
        if (!collidedWithMcp) throw err;
        const holderPid = (richErr.existingLock as ServerLockMetadataLike).pid;
        this.deps.log?.warn(
          { event: 'desktop-attach-refused', reason: 'collision-mcp-spawned', holderPid, lockDir },
          '[window-manager] mcp-spawned holder collided — sending SIGTERM and retrying',
        );
        const kill =
          this.deps.killProcess ??
          ((pid: number, signal: NodeJS.Signals) => {
            process.kill(pid, signal);
          });
        try {
          kill(holderPid, 'SIGTERM');
        } catch {
          // Holder already gone — the lock might be stale; the wait below
          // catches up either way.
        }
        // SIGTERM grace: bun + Hocuspocus + telemetry-shutdown chain takes
        // 3-5s in practice. Empirical observation in dev showed bun
        // sometimes ignores SIGTERM entirely (process stays alive past
        // any reasonable grace). After 5s, escalate to SIGKILL — the
        // holder is `mcp-spawned`, transient by design (the agent's MCP
        // will re-spawn on next tool call), so a hard kill costs nothing.
        const SIGTERM_GRACE_MS = 5_000;
        const released = await (this.deps.waitForLockReleased
          ? this.deps.waitForLockReleased(lockDir, SIGTERM_GRACE_MS)
          : pollLockReleasedDefault(lockDir, SIGTERM_GRACE_MS));
        let finalReleased = released;
        if (!released) {
          this.deps.log?.warn(
            { holderPid },
            '[window-manager] SIGTERM did not take within grace — escalating to SIGKILL',
          );
          try {
            kill(holderPid, 'SIGKILL');
          } catch {
            // Already dead — fine.
          }
          // Brief follow-up wait — SIGKILL is unmaskable so this is fast.
          finalReleased = await (this.deps.waitForLockReleased
            ? this.deps.waitForLockReleased(lockDir, 2_000)
            : pollLockReleasedDefault(lockDir, 2_000));
        }
        if (!finalReleased) {
          const stuck = Object.assign(
            new Error(
              `Open Knowledge could not start: pid ${holderPid} is still holding the server lock at ${lockDir}.`,
            ),
            { kind: 'mcp-server-stuck' as const, holderPid },
          );
          throw stuck;
        }
        // Loop continues — fresh fork on next iteration.
      }
    }

    // Persistent post-init message listener. The init-phase listener above was
    // detached by `settle()` once `ready`/`error` resolved; this observes every
    // subsequent message so main-side consumers (e.g., debug-ipc relay's
    // correlation map) can route replies. No-op when `onUtilityMessage` is unset.
    if (this.deps.onUtilityMessage) {
      const onMessage = this.deps.onUtilityMessage;
      utility.on('message', (msg) => onMessage(msg));
    }

    // Post-exit liveness probe — covers the case where
    // utilityProcess.on('exit') fires but the pid is still alive (see VS Code
    // Issue #194477). The init-phase exit handler above rejects `ready` when
    // exit fires early; both listeners coexist on the same event and observe
    // independently.
    utility.on('exit', (code) => {
      this.deps.log?.info({ pid: utility.pid, code }, 'utility exited');
      this.windowsByPath.delete(canonicalKey);
      // Reject any in-flight debug-IPC requests bound to this utility so
      // pending entries don't linger for the full timeout window after a
      // crash. Same utility reference used by `onUtilityMessage`, enabling
      // identity-match in the consumer's pending Map.
      this.deps.onUtilityExit?.(utility);
      const pid = utility.pid;
      if (typeof pid === 'number') {
        this.deps.setTimeout(() => {
          try {
            this.deps.killProbe(pid, 0);
            this.deps.log?.warn(
              { pid },
              'utility pid still alive 1s after exit event — sending SIGTERM',
            );
            this.deps.killProbe(pid, 'SIGTERM');
          } catch {
            // Process truly gone — happy path.
          }
        }, 1000);
      }
    });

    const window = this.deps.createWindow({
      additionalArguments: [
        `--ok-collab-url=ws://localhost:${port}/collab`,
        `--ok-api-origin=${apiOrigin}`,
        `--ok-project-path=${projectPath}`,
        `--ok-project-name=${projectName}`,
        `--ok-mode=editor`,
      ],
      title: formatEditorTitle(projectName),
    });

    // Dispatch `git-init-notice` to the renderer so it can surface a sonner
    // toast. Register the `dom-ready` listener BEFORE awaiting `loadURL` /
    // `loadFile` — their returned promises resolve on `did-finish-load`, which
    // fires AFTER `dom-ready`. Registering after the await would miss the
    // one-shot event. Deferring to `dom-ready` also ensures the renderer's
    // bridge subscriber has mounted before the event lands.
    if (didGitInit) {
      const gitDir = resolve(projectPath, '.git');
      window.webContents.once('dom-ready', () => {
        sendToRenderer(window.webContents, 'ok:git-init-notice', { gitDir });
      });
    }

    // Deep-link gate — same dom-ready ordering pattern as git-init-notice. A
    // synchronous send from url-scheme.ts's routeUrl would work today only
    // because main.tsx's subscriber install is synchronous at module-init;
    // any future refactor (dynamic import, Suspense boundary, React effect)
    // would silently drop the event.
    if (opts.pendingDeepLinkDoc) {
      const doc = opts.pendingDeepLinkDoc;
      window.webContents.once('dom-ready', () => {
        sendToRenderer(window.webContents, 'ok:deep-link', { doc });
      });
    }

    if (this.deps.rendererDevUrl) {
      await window.loadURL(this.deps.rendererDevUrl);
    } else {
      await window.loadFile(this.deps.rendererEntryPath);
    }

    window.on('closed', () => {
      // Guard against detached IPC port — the utility may have already exited
      // (e.g. crash, parent-death poll beat us) in which case `postMessage`
      // throws ERR_IPC_CHANNEL_CLOSED. The utility's shutdown drain +
      // parentLifecycleBound takes care of the forked process regardless;
      // windowsByPath.delete fires from the utility's exit event above.
      try {
        utility.postMessage({ type: 'shutdown' });
      } catch (err) {
        this.deps.log?.warn(
          { err: (err as Error).message, projectPath },
          'utility shutdown IPC failed on window close (likely already exited)',
        );
      }
    });

    const context: ProjectContext = {
      projectPath,
      canonicalKey,
      projectName,
      port,
      apiOrigin,
      window,
      utility,
      ownsServer: true,
    };
    this.windowsByPath.set(canonicalKey, context);
    return context;
  }

  /** Close a specific project window (called by IPC `ok:project:close`). */
  closeProjectWindow(projectPath: string): boolean {
    const ctx = this.windowsByPath.get(this.canonicalizeKey(projectPath));
    if (!ctx) return false;
    if (!ctx.ownsServer || !ctx.utility) {
      // Attach mode — the server belongs to a sibling process. Closing our
      // window drops our WS connection; we leave the server running so the
      // sibling (and any other windows) keep working.
      return true;
    }
    // Guard against detached IPC port — see rationale in the window-close
    // handler above.
    try {
      ctx.utility.postMessage({ type: 'shutdown' });
    } catch (err) {
      this.deps.log?.warn(
        { err: (err as Error).message, projectPath },
        'utility shutdown IPC failed in closeProjectWindow (likely already exited)',
      );
    }
    return true;
  }

  /**
   * Synchronous metadata gates for `<lockDir>/server.lock`.
   *
   * Returns the lock when all of the following hold:
   *   - lock file exists and parses as valid JSON
   *   - `hostname` matches this host (foreign locks fall through to spawn
   *     mode, which surfaces the collision via `ServerLockCollisionError`
   *     from `acquireServerLock`)
   *   - `isProcessAlive(pid)` is true (stale locks fall through — `runClean`
   *     will prune them before we spawn)
   *   - `port > 0` (port 0 means the holder is still starting — racing it
   *     risks connecting before the listener is bound, so fall through)
   *   - `kind === 'interactive'` (or absent → legacy lock, refused as the
   *     conservative case). MCP-spawned servers are refused even when
   *     alive: they exist for the agent's convenience and the desktop is
   *     the user-facing surface that takes precedence on cold start.
   *   - `capabilities` includes `"ws"` when the field is present.
   *
   * The async WS-upgrade probe is deliberately a separate step
   * (`probeAttachableLock`) so this function stays synchronous — the
   * synchronous fall-through must not inject a microtask that reorders
   * subsequent fork-utility calls in the caller.
   *
   * Refusals emit a structured warn so operators can grep for
   * `desktop-attach-refused` in the wild.
   */
  private tryAttachExistingServer(lockDir: string): ServerLockMetadataLike | null {
    const read = this.deps.readServerLock;
    const alive = this.deps.isProcessAlive;
    const getHost = this.deps.hostname;
    if (!read || !alive || !getHost) return null;
    const lock = read(lockDir);
    if (!lock) return null;
    const refuse = (reason: string): null => {
      this.deps.log?.warn(
        { event: 'desktop-attach-refused', reason, lockDir, lockPid: lock.pid },
        '[window-manager] refusing attach',
      );
      return null;
    };
    if (lock.hostname !== getHost()) return refuse('foreign-hostname');
    if (!alive(lock.pid)) return refuse('lock-pid-dead');
    if (lock.port <= 0) return refuse('lock-port-zero');
    if (lock.kind === undefined) return refuse('legacy-lock-no-kind');
    if (lock.kind === 'mcp-spawned') return refuse('kind-mcp-spawned');
    if (lock.capabilities !== undefined && !lock.capabilities.includes('ws')) {
      return refuse('capabilities-missing-ws');
    }
    return lock;
  }

  /**
   * Final defensive gate against a server that lies about WS capability or
   * has a hung upgrade path (the live symptom that motivated all of this:
   * HTTP up, `/collab` hangs, every doc 30 s timeouts). Skipped when
   * `probeWsUpgrade` is not injected — back-compat path for the existing
   * test suite that did not exercise the probe.
   *
   * Returns `true` when attaching is safe; `false` otherwise. Errors from
   * the probe (thrown rejections) are treated as failures — defensive
   * stance, since we cannot prove the server is healthy.
   */
  private async probeAttachableLock(lock: ServerLockMetadataLike): Promise<boolean> {
    const probe = this.deps.probeWsUpgrade;
    if (!probe) return true;
    const url = `ws://localhost:${lock.port}/collab/__attach_probe__`;
    let upgradeOk = false;
    try {
      upgradeOk = await probe(url, 500);
    } catch {
      upgradeOk = false;
    }
    if (!upgradeOk) {
      this.deps.log?.warn(
        { event: 'desktop-attach-refused', reason: 'ws-upgrade-failed', lockPid: lock.pid },
        '[window-manager] refusing attach',
      );
    }
    return upgradeOk;
  }

  /**
   * Finalize a project window in attach mode. Symmetric with the spawn path
   * from the renderer's perspective — `--ok-collab-url` and `--ok-api-origin`
   * are populated identically, so the preload + React bundle see no
   * difference between attach-mode and spawn-mode windows.
   *
   * Differences from spawn mode:
   *   - no `utilityProcess.fork`, no `init`/`ready` handshake
   *   - no `runClean` (the lock is not stale — it references a live process)
   *   - no post-exit liveness probe (we don't own the server)
   *   - window `close` removes the window from the map but sends no shutdown
   *     IPC (the sibling server survives)
   */
  private async attachToExistingServer(args: {
    projectPath: string;
    canonicalKey: string;
    projectName: string;
    lock: ServerLockMetadataLike;
    pendingDeepLinkDoc?: string;
  }): Promise<ProjectContext> {
    const { projectPath, canonicalKey, projectName, lock, pendingDeepLinkDoc } = args;
    const port = lock.port;
    const apiOrigin = `http://localhost:${port}`;

    this.deps.log?.info(
      { projectPath, holderPid: lock.pid, port, startedAt: lock.startedAt },
      'attaching to existing Open Knowledge server',
    );

    const window = this.deps.createWindow({
      additionalArguments: [
        `--ok-collab-url=ws://localhost:${port}/collab`,
        `--ok-api-origin=${apiOrigin}`,
        `--ok-project-path=${projectPath}`,
        `--ok-project-name=${projectName}`,
        `--ok-mode=editor`,
      ],
      title: formatEditorTitle(projectName),
    });

    // M4 deep-link gate — same pattern as the spawn path. Register the
    // `dom-ready` listener BEFORE `await loadURL` so the one-shot event
    // lands after the renderer subscriber mounts but not after
    // `did-finish-load` (which would miss dom-ready entirely).
    if (pendingDeepLinkDoc) {
      const doc = pendingDeepLinkDoc;
      window.webContents.once('dom-ready', () => {
        sendToRenderer(window.webContents, 'ok:deep-link', { doc });
      });
    }

    if (this.deps.rendererDevUrl) {
      await window.loadURL(this.deps.rendererDevUrl);
    } else {
      await window.loadFile(this.deps.rendererEntryPath);
    }

    window.on('closed', () => {
      // Drop from our map so a subsequent open either re-attaches (if the
      // sibling is still live) or spawns (if it has since exited). Critically,
      // NO shutdown IPC — the server is not ours to stop.
      this.windowsByPath.delete(canonicalKey);
    });

    const context: ProjectContext = {
      projectPath,
      canonicalKey,
      projectName,
      port,
      apiOrigin,
      window,
      utility: null,
      ownsServer: false,
    };
    this.windowsByPath.set(canonicalKey, context);
    return context;
  }
}
