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

import { basename, resolve } from 'node:path';

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
  on(event: 'closed', cb: () => void): void;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
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
  projectPath: string;
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
}

export class WindowManager {
  /** contentDir (realpath) → ProjectContext */
  private readonly windowsByPath = new Map<string, ProjectContext>();

  constructor(private readonly deps: WindowManagerDeps) {}

  /** Read-only snapshot for tests + the J7b dialog handler. */
  getWindowFor(projectPath: string): ProjectContext | undefined {
    return this.windowsByPath.get(projectPath);
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
    const existing = this.windowsByPath.get(projectPath);
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
      return this.attachToExistingServer({ projectPath, projectName, lock: attached });
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

    const ready = new Promise<{ port: number; apiOrigin: string }>((resolveReady, reject) => {
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
        const m = msg as { type?: string; port?: number; apiOrigin?: string; message?: string };
        if (m.type === 'ready' && typeof m.port === 'number' && typeof m.apiOrigin === 'string') {
          const port = m.port;
          const apiOrigin = m.apiOrigin;
          settle(() => resolveReady({ port, apiOrigin }));
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
    });

    utility.postMessage({
      type: 'init',
      opts: {
        contentDir: projectPath,
        projectDir: projectPath,
        port: 0,
        host: 'localhost',
      },
    });

    const { port, apiOrigin } = await ready;

    // D39 post-exit liveness probe — covers the case where utilityProcess.on('exit')
    // fires but the pid is still alive (VS Code Issue #194477). This handler runs
    // for the lifetime of the window; the init-phase exit handler above wired a
    // separate listener that rejected `ready` if exit fired early. Both listeners
    // can coexist on the same `exit` event — they observe independently.
    utility.on('exit', (code) => {
      this.deps.log?.info({ pid: utility.pid, code }, 'utility exited');
      this.windowsByPath.delete(projectPath);
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
      projectName,
      port,
      apiOrigin,
      window,
      utility,
      ownsServer: true,
    };
    this.windowsByPath.set(projectPath, context);
    return context;
  }

  /** Close a specific project window (called by IPC `ok:project:close`). */
  closeProjectWindow(projectPath: string): boolean {
    const ctx = this.windowsByPath.get(resolve(projectPath));
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
    projectName: string;
    lock: ServerLockMetadataLike;
  }): Promise<ProjectContext> {
    const { projectPath, projectName, lock } = args;
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

    if (this.deps.rendererDevUrl) {
      await window.loadURL(this.deps.rendererDevUrl);
    } else {
      await window.loadFile(this.deps.rendererEntryPath);
    }

    window.on('closed', () => {
      // Drop from our map so a subsequent open either re-attaches (if the
      // sibling is still live) or spawns (if it has since exited). Critically,
      // NO shutdown IPC — the server is not ours to stop.
      this.windowsByPath.delete(projectPath);
    });

    const context: ProjectContext = {
      projectPath,
      projectName,
      port,
      apiOrigin,
      window,
      utility: null,
      ownsServer: false,
    };
    this.windowsByPath.set(projectPath, context);
    return context;
  }
}
