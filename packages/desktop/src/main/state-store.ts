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
}

const RECENT_CAP = 20;

export function emptyState(): AppState {
  return { recentProjects: [], lastOpenedProject: null };
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
): void {
  try {
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    const statePath = join(userDataDir, 'state.json');
    const tmpPath = `${statePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
      fs.renameSync(tmpPath, statePath);
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
    }
  } catch (err) {
    logger.error('[main] saveAppState userData setup failed', {
      err: (err as Error).message,
      userDataDir,
    });
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
  return { recentProjects, lastOpenedProject };
}
