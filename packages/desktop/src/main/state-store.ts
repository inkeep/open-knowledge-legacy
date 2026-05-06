import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: string;
  missing?: boolean;
}

export type UpdateChannel = 'latest' | 'beta';

export const CURRENT_SCHEMA_VERSION = 1;

export const MAX_SUPPORTED_SCHEMA_VERSION = 1;

export interface AppState {
  recentProjects: RecentProject[];
  lastOpenedProject: string | null;
  versionPendingInstall: string | null;
  lastSeenVersion: string | null;
  lastSuccessfulCheckAt: string | null;
  stuckHintShown: boolean;
  dismissedRepairForBundle: string | null;
  updateChannel: UpdateChannel;
  schemaVersion: number;
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
    dismissedRepairForBundle: null,
    updateChannel: 'latest',
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function addRecentProject(state: AppState, projectPath: string, name: string): AppState {
  const now = new Date().toISOString();
  const filtered = state.recentProjects.filter((p) => p.path !== projectPath);
  const updated: RecentProject[] = [
    { path: projectPath, name, lastOpenedAt: now },
    ...filtered,
  ].slice(0, RECENT_CAP);
  return { ...state, recentProjects: updated, lastOpenedProject: projectPath };
}

export function removeRecentProject(state: AppState, projectPath: string): AppState {
  return {
    ...state,
    recentProjects: state.recentProjects.filter((p) => p.path !== projectPath),
    lastOpenedProject: state.lastOpenedProject === projectPath ? null : state.lastOpenedProject,
  };
}

export function annotateMissing(
  state: AppState,
  exists: (path: string) => boolean = existsSync,
): RecentProject[] {
  return state.recentProjects.map((p) => ({
    ...p,
    missing: !exists(p.path),
  }));
}

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
      } catch {}
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

export interface SchemaIncompatibilityDiagnostic {
  currentBuild: string;
  persistedSchemaVersion: number;
  maxSupported: number;
}

type SchemaCompatibilityResult =
  | { status: 'ok' }
  | { status: 'incompatible'; diagnostic: SchemaIncompatibilityDiagnostic };

export function evaluateSchemaCompatibility(
  state: Pick<AppState, 'schemaVersion'>,
  maxSupported: number,
  currentBuild: string,
): SchemaCompatibilityResult {
  if (state.schemaVersion > maxSupported) {
    return {
      status: 'incompatible',
      diagnostic: {
        currentBuild,
        persistedSchemaVersion: state.schemaVersion,
        maxSupported,
      },
    };
  }
  return { status: 'ok' };
}

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
  const versionPendingInstall =
    typeof obj.versionPendingInstall === 'string' ? obj.versionPendingInstall : null;
  const lastSeenVersion = typeof obj.lastSeenVersion === 'string' ? obj.lastSeenVersion : null;
  const lastSuccessfulCheckAt =
    typeof obj.lastSuccessfulCheckAt === 'string' ? obj.lastSuccessfulCheckAt : null;
  const stuckHintShown = obj.stuckHintShown === true;
  const dismissedRepairForBundle =
    typeof obj.dismissedRepairForBundle === 'string' ? obj.dismissedRepairForBundle : null;
  const updateChannel: UpdateChannel = obj.updateChannel === 'beta' ? 'beta' : 'latest';
  const schemaVersion =
    typeof obj.schemaVersion === 'number' && Number.isInteger(obj.schemaVersion)
      ? obj.schemaVersion
      : 1;
  return {
    recentProjects,
    lastOpenedProject,
    versionPendingInstall,
    lastSeenVersion,
    lastSuccessfulCheckAt,
    stuckHintShown,
    dismissedRepairForBundle,
    updateChannel,
    schemaVersion,
  };
}
