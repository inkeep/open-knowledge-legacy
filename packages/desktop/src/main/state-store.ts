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

import { existsSync } from 'node:fs';

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
