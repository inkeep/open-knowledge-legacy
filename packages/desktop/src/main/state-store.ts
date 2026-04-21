/**
 * Pure state-store helpers for app-level persistence (recent projects, last-
 * opened, window bounds). The main entry persists this to
 * `app.getPath('userData')/state.json`; tests exercise the pure helpers
 * directly without an Electron process.
 *
 * Recent-projects shape per OQ-G: LRU array, cap 20, realpath-canonicalized
 * `contentDir` as key. Improvements over surveyed apps (Obsidian, VS Code):
 * we use `realpath` so symlinked projects collapse to the same entry, matching
 * OK's existing realpath-based file-watcher identity.
 */

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: string;
  /** Computed at read time — `existsSync(path)` was false when this snapshot was built. */
  missing?: boolean;
}

export interface AppState {
  /** LRU-capped recent-projects, newest first. */
  recentProjects: RecentProject[];
  /** Most recently opened project, or null if Navigator was last visible. */
  lastOpenedProject: string | null;
  /**
   * Version string (e.g. "0.3.0") of an update that `autoUpdater` has
   * downloaded and is awaiting install-on-quit. Gates Toast A to fire at
   * most once per pending-update state; cleared after install completes.
   * M3 D11.
   */
  versionPendingInstall: string | null;
  /**
   * Last version the app successfully booted under — compared to
   * `app.getVersion()` at auto-updater start to decide whether to fire
   * Toast B ("What's new"). Null on fresh install so first-ever boot stays
   * silent. Advances on every successful boot. M3 D9/D11.
   */
  lastSeenVersion: string | null;
  /**
   * ISO-8601 timestamp of the last successful update-check outcome
   * (`checking-for-update` settling into `update-available` or
   * `update-not-available`). Null before the first successful check. Used
   * by the D12 stuck-hint 7-day counter — failed checks leave this
   * unchanged, so `now - lastSuccessfulCheckAt` grows monotonically during
   * silent-failure windows.
   */
  lastSuccessfulCheckAt: string | null;
  /**
   * Whether Toast C (the once-per-installation stuck-update hint) has
   * already fired. Flips true on first dispatch; resets to false on any
   * successful update check so the hint can re-arm if the update pipeline
   * breaks again after a repaired window. M3 D12.
   */
  stuckHintShown: boolean;
}

const RECENT_CAP = 20;

export function emptyState(): AppState {
  return {
    recentProjects: [],
    lastOpenedProject: null,
    versionPendingInstall: null,
    lastSeenVersion: null,
    lastSuccessfulCheckAt: null,
    stuckHintShown: false,
  };
}

/**
 * Add a project to the recent list (or move to front if already present).
 * Returns a NEW state (immutable update — caller persists).
 */
export function addRecentProject(state: AppState, projectPath: string, name: string): AppState {
  const now = new Date().toISOString();
  const filtered = state.recentProjects.filter((p) => p.path !== projectPath);
  const updated: RecentProject[] = [
    { path: projectPath, name, lastOpenedAt: now },
    ...filtered,
  ].slice(0, RECENT_CAP);
  return { ...state, recentProjects: updated, lastOpenedProject: projectPath };
}

/** Remove a project from the recent list. */
export function removeRecentProject(state: AppState, projectPath: string): AppState {
  return {
    ...state,
    recentProjects: state.recentProjects.filter((p) => p.path !== projectPath),
    lastOpenedProject: state.lastOpenedProject === projectPath ? null : state.lastOpenedProject,
  };
}

/**
 * Annotate the recent list with `missing: true` for projects whose folder
 * no longer exists. Pure read; doesn't mutate state.
 */
export function annotateMissing(
  state: AppState,
  exists: (path: string) => boolean = existsSync,
): RecentProject[] {
  return state.recentProjects.map((p) => ({
    ...p,
    missing: !exists(p.path),
  }));
}

/**
 * Persist `state` to `<userDataDir>/state.json` atomically. Writes to a
 * `.tmp-<pid>-<ms>` sibling first, then renames to the canonical path. A
 * crash mid-write leaves either the prior file intact OR the fully-formed
 * new file — never a half-written blob. Logs on failure (bracket-prefixed
 * per CLAUDE.md logging conventions); does not throw.
 *
 * Returns `true` on successful persist, `false` on any failure (EACCES,
 * disk full, rename race, userData mkdir failure). The boolean lets
 * callers that need disk-persistence-succeeded semantics (e.g. M3 auto-
 * updater's persist-before-emit gate) distinguish "in-memory + disk
 * agree" from "in-memory mutated but disk stale." Existing callers that
 * ignore the return value get the same void-like behavior as before.
 *
 * Injected `fs` hook for tests. Production callers pass `undefined` to use
 * the module-scope `node:fs` imports.
 */
export interface SaveAppStateFs {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  writeFileSync: typeof writeFileSync;
  renameSync: typeof renameSync;
  unlinkSync: typeof unlinkSync;
}

const DEFAULT_FS: SaveAppStateFs = {
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
};

export function saveAppStateToDir(
  userDataDir: string,
  state: AppState,
  fs: SaveAppStateFs = DEFAULT_FS,
  logger: { error(msg: string, ctx?: object): void } = console,
): boolean {
  try {
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    const statePath = join(userDataDir, 'state.json');
    const tmpPath = `${statePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
      fs.renameSync(tmpPath, statePath);
      return true;
    } catch (err) {
      logger.error('[main] saveAppState failed', {
        err: (err as Error).message,
        statePath,
      });
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // tmp file may not exist — best-effort cleanup.
      }
      return false;
    }
  } catch (err) {
    logger.error('[main] saveAppState userData setup failed', {
      err: (err as Error).message,
      userDataDir,
    });
    return false;
  }
}

/**
 * Coerce an unknown JSON blob into AppState shape. Returns emptyState() for
 * invalid input (the caller should rename the corrupt file to
 * `state.json.corrupt-<ts>` and start fresh, per OQ-G recommendation).
 */
export function parseAppState(raw: unknown): AppState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const recentRaw = obj.recentProjects;
  if (!Array.isArray(recentRaw)) return null;
  const recentProjects: RecentProject[] = [];
  for (const r of recentRaw) {
    if (typeof r !== 'object' || r === null) continue;
    const item = r as Record<string, unknown>;
    if (
      typeof item.path === 'string' &&
      typeof item.name === 'string' &&
      typeof item.lastOpenedAt === 'string'
    ) {
      recentProjects.push({
        path: item.path,
        name: item.name,
        lastOpenedAt: item.lastOpenedAt,
      });
    }
  }
  const lastOpenedProject =
    typeof obj.lastOpenedProject === 'string' ? obj.lastOpenedProject : null;
  // M3 fields: defensive coercion with M1-forward-compat defaults. A pre-M3
  // state.json lacking these keys returns a valid AppState whose four new
  // fields match emptyState() defaults (no quarantine, no data loss).
  const versionPendingInstall =
    typeof obj.versionPendingInstall === 'string' ? obj.versionPendingInstall : null;
  const lastSeenVersion = typeof obj.lastSeenVersion === 'string' ? obj.lastSeenVersion : null;
  const lastSuccessfulCheckAt =
    typeof obj.lastSuccessfulCheckAt === 'string' ? obj.lastSuccessfulCheckAt : null;
  const stuckHintShown = obj.stuckHintShown === true;
  return {
    recentProjects,
    lastOpenedProject,
    versionPendingInstall,
    lastSeenVersion,
    lastSuccessfulCheckAt,
    stuckHintShown,
  };
}
