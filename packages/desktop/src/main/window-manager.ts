/**
 * Main-process window manager — spawns BrowserWindow + utilityProcess pairs
 * per project (D6, D39).
 *
 * Each project window owns:
 *   - one utilityProcess (forked with `windowLifecycleBound: true,
 *     windowLifecycleGraceTime: 6000` per D39 — Electron tears it down on
 *     window close + grace timeout)
 *   - one BrowserWindow with preload-injected `--ok-collab-url=ws://...`
 *     argv flags (consumed by `src/preload/index.ts`)
 *
 * Per D44 case (a): if a project's contentDir is already open in another
 * window of THIS app, surface "Focus existing window" instead of spawning
 * a duplicate. Track via `Map<contentDir, { window, utility, port }>`.
 *
 * The functions here are pure factories that take injected `electron` deps,
 * making them unit-testable without a real Electron runtime.
 */

import { basename, resolve } from 'node:path';

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
  kill(signal?: NodeJS.Signals): boolean;
}

export interface ProjectContext {
  projectPath: string;
  projectName: string;
  port: number;
  apiOrigin: string;
  window: BrowserWindowLike;
  utility: UtilityProcessLike;
}

export interface CreateProjectWindowOpts {
  projectPath: string;
}

/** Test-injectable side-effect surface (Electron + node:fs primitives). */
export interface WindowManagerDeps {
  /** `electron.BrowserWindow` constructor (subsetted). */
  createWindow(opts: {
    additionalArguments: string[];
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
        utility.removeListener?.('message', onMessage);
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
      utility.on('message', onMessage);

      // Reject on early utility exit (utility died before posting ready/error).
      utility.on('exit', (code) => {
        settle(() => reject(new Error(`utility exited before ready (code=${code})`)));
      });

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
    };
    this.windowsByPath.set(projectPath, context);
    return context;
  }

  /** Close a specific project window (called by IPC `ok:project:close`). */
  closeProjectWindow(projectPath: string): boolean {
    const ctx = this.windowsByPath.get(resolve(projectPath));
    if (!ctx) return false;
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
}
