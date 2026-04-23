/**
 * Main-process window manager — spawns BrowserWindow + utilityProcess pairs
 * per project (D6, D39), with an attach branch that reuses an existing
 * live same-host Open Knowledge server (CLI sibling, another Electron
 * instance, or any bootServer caller).
 *
 * Each project window either:
 *   - (spawn mode, the common case) owns one utilityProcess forked with
 *     `windowLifecycleBound: true, windowLifecycleGraceTime: 6000` per D39
 *     + a BrowserWindow with preload-injected `--ok-collab-url` argv flags,
 *   - (attach mode) just owns the BrowserWindow. `window.okDesktop.config
 *     .collabUrl` points at the already-listening server; no utility of
 *     ours is spawned and none is torn down on close. `ProjectContext
 *     .ownsServer === false` gates every lifecycle action accordingly.
 *
 * Attach trigger: `<contentDir>/.open-knowledge/server.lock` references a
 * live same-host pid with `port > 0`. The lock contract is authoritative
 * per SPEC §6 (V0-1 shipped). Stale locks flow through the existing
 * `runClean` pass and then spawn-mode proceeds.
 *
 * Per D44 case (a): if a project's contentDir is already open in another
 * window of THIS app, surface "Focus existing window" instead of spawning
 * a duplicate. Track via `Map<contentDir, ProjectContext>`.
 *
 * The functions here are pure factories that take injected `electron` deps,
 * making them unit-testable without a real Electron runtime.
 */

import { realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { sendToRenderer } from '../shared/ipc-send.ts';

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
 */
export interface ServerLockMetadataLike {
  pid: number;
  hostname: string;
  port: number;
  startedAt: string;
  worktreeRoot: string;
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
   * shutdown IPC on window close and the D39 post-exit liveness probe. When
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
   * `server.lock`'s `hostname` field so we only attach on same-host locks
   * (foreign-host locks are D44 case c — refuse and fall through).
   */
  hostname?(): string;
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
   * Post-init persistent message listener. Installed once after the
   * init-phase `ready` handshake settles, so messages like
   * `debug-keyring-smoke-result` (M5 US-004) are routed to their main-side
   * consumer without competing with the init-phase listener. Invoked for
   * every subsequent utility message regardless of shape; consumer is
   * expected to narrow by `msg.type` and no-op on unknown shapes.
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
   * Complements `createProjectWindow`, which is the find-or-spawn helper —
   * this one is find-or-nothing, leaving the "spawn new window for a not-yet-
   * open project" decision to the caller (SPEC D24: every project pick spawns
   * a new window; only the same-project warm deep-link case reuses).
   *
   * Path matching uses `canonicalizeKey` (realpath + resolve) — the same
   * canonicalization `createProjectWindow` applies before storing in
   * `windowsByPath`. A deep-link URL carrying the canonical realpath
   * (emitted by `preview-url.ts:realpathSync(ctx.contentDir)`) therefore
   * matches a window opened via a symlinked project path.
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
      // D44 case (a) — focus existing rather than spawn a duplicate.
      existing.window.focus();
      return existing;
    }
    const projectName = basename(projectPath);

    const lockDir = resolve(projectPath, '.open-knowledge');

    // Attach branch — if a live same-host server is already listening on
    // this contentDir (CLI sibling, another Electron instance that we
    // want to share with, etc.), skip the utility spawn entirely and just
    // point the renderer at the existing collab URL. `runClean` is also
    // skipped here because an attachable lock is by definition NOT stale.
    const attached = this.tryAttachExistingServer(lockDir);
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

    const utility = this.deps.forkUtility(this.deps.utilityEntryPath, {
      windowLifecycleBound: true,
    });

    // Init timeout: if utility has not posted `ready` or `error` within this
    // window, reject so `createProjectWindow` doesn't hang forever. A spawn-
    // phase hang is observable in the wild (bootServer throws synchronously
    // on a bad path, parent-death poll beats the `ready` handshake, utility
    // crashes before posting, etc.) — the reviewer flagged the original
    // implementation's lack of this guard as a Major issue.
    const INIT_TIMEOUT_MS = this.deps.utilityInitTimeoutMs ?? 15_000;

    const ready = new Promise<{ port: number; apiOrigin: string; didGitInit: boolean }>(
      (resolveReady, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          // Detach BOTH listeners so no dead code fires after ready — the post-
          // await lifecycle handler (see below) is the sole exit subscriber
          // once the window is up.
          utility.removeListener?.('message', onMessage);
          utility.removeListener?.('exit', onExit);
          fn();
        };
        const onMessage = (msg: unknown) => {
          const m = msg as {
            type?: string;
            port?: number;
            apiOrigin?: string;
            message?: string;
            didGitInit?: boolean;
          };
          if (m.type === 'ready' && typeof m.port === 'number' && typeof m.apiOrigin === 'string') {
            const port = m.port;
            const apiOrigin = m.apiOrigin;
            const didGitInit = m.didGitInit === true;
            settle(() => resolveReady({ port, apiOrigin, didGitInit }));
          } else if (m.type === 'error') {
            settle(() => reject(new Error(m.message ?? 'utility init failed')));
          }
        };
        // Reject on early utility exit (utility died before posting ready/error).
        const onExit = (code: number | null) => {
          settle(() => reject(new Error(`utility exited before ready (code=${code})`)));
        };
        utility.on('message', onMessage);
        utility.on('exit', onExit);

        // Timeout guard — final defense against spawn-phase hangs. The scheduled
        // callback calls `settle(...)` which no-ops if ready/error/exit already
        // settled the promise, so late-firing timers are harmless.
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

    const { port, apiOrigin, didGitInit } = await ready;

    // Persistent post-init message listener (M5 US-004). The init-phase
    // listener (above) was detached by `settle()` once `ready`/`error`
    // resolved; this new listener observes every subsequent message so
    // main-side consumers (e.g., the debug-ipc relay's correlation map)
    // can route replies. No-op when `onUtilityMessage` is not wired.
    if (this.deps.onUtilityMessage) {
      const onMessage = this.deps.onUtilityMessage;
      utility.on('message', (msg) => onMessage(msg));
    }

    // D39 post-exit liveness probe — covers the case where utilityProcess.on('exit')
    // fires but the pid is still alive (VS Code Issue #194477). This handler runs
    // for the lifetime of the window; the init-phase exit handler above wired a
    // separate listener that rejected `ready` if exit fired early. Both listeners
    // can coexist on the same `exit` event — they observe independently.
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

    // SPEC R5b / D10 — dispatch `git-init-notice` to the renderer so it can
    // surface a sonner toast. Register the `dom-ready` listener BEFORE awaiting
    // `loadURL` / `loadFile` because their returned promises resolve on
    // `did-finish-load`, which fires AFTER `dom-ready` — registering after the
    // await would silently miss the one-shot event and the toast would never
    // fire. Deferring to `dom-ready` (rather than firing synchronously) also
    // ensures the renderer's bridge subscriber has mounted before the event
    // lands (defeats the SPEC §14 subscriber-mount race).
    if (didGitInit) {
      const gitDir = resolve(projectPath, '.git');
      window.webContents.once('dom-ready', () => {
        sendToRenderer(window.webContents, 'ok:git-init-notice', { gitDir });
      });
    }

    // M4 deep-link gate — same pattern as git-init-notice: register the
    // `dom-ready` listener BEFORE `await loadURL` so the event lands AFTER
    // the renderer's `ok:deep-link` subscriber has mounted (main.tsx module-
    // init) but not so late that it's missed entirely. Without this gate,
    // `ok:deep-link` was sent synchronously from the cold-path `.then()` in
    // `url-scheme.ts`'s routeUrl, which worked in practice only because
    // main.tsx's subscriber install is synchronous at module-init — a
    // future refactor (dynamic import, Suspense boundary, React effect)
    // would silently drop the event. Co-located with git-init-notice so
    // both one-shot renderer events share one ordering primitive.
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
   * Probe `<lockDir>/server.lock` for an attachable same-host server.
   *
   * Returns the lock metadata when all of the following hold:
   *   - lock file exists and parses as valid JSON
   *   - `hostname` matches this host (foreign locks are D44 case c — we
   *     refuse and fall through to spawn-mode, which will surface the
   *     collision via `ServerLockCollisionError` from `acquireServerLock`)
   *   - `isProcessAlive(pid)` is true (stale locks fall through — `runClean`
   *     will prune them before we spawn)
   *   - `port > 0` (port 0 means the holder is still starting — racing it
   *     risks connecting before the listener is bound, so fall through)
   *
   * Returns `null` otherwise (including when the deps are not wired — tests
   * that don't inject `readServerLock` get pure spawn behavior).
   */
  private tryAttachExistingServer(lockDir: string): ServerLockMetadataLike | null {
    const read = this.deps.readServerLock;
    const alive = this.deps.isProcessAlive;
    const getHost = this.deps.hostname;
    if (!read || !alive || !getHost) return null;
    const lock = read(lockDir);
    if (!lock) return null;
    if (lock.hostname !== getHost()) return null;
    if (!alive(lock.pid)) return null;
    if (lock.port <= 0) return null;
    return lock;
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
