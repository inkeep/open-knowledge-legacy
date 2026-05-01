import { execFile } from 'node:child_process';
import { join, posix as pathPosix, win32 as pathWin32 } from 'node:path';
import type { HandoffStatsLine, SpawnOutcome } from '../shared/ipc-channels.ts';

const DEFAULT_PROBE_TIMEOUT_MS = 2000;
const WHICH_TIMEOUT_MS = 500;
const SPAWN_TIMEOUT_MS = 2000;

interface AppInfo {
  name: string;
  path: string;
}

interface DetectProtocolDeps {
  platform: NodeJS.Platform;
  getApplicationInfoForProtocol: (url: string) => Promise<AppInfo>;
  runXdgMime?: (scheme: string, timeoutMs: number) => Promise<{ stdout: string; code: number }>;
  timeoutMs?: number;
}

function xdgMimeReal(scheme: string, timeoutMs: number): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'xdg-mime',
      ['query', 'default', `x-scheme-handler/${scheme}`],
      { timeout: timeoutMs, encoding: 'utf-8' },
      (err, stdout) => {
        if (err) {
          resolve({ stdout: '', code: typeof err.code === 'number' ? err.code : 1 });
          return;
        }
        resolve({ stdout, code: 0 });
      },
    );
  });
}

export async function detectProtocol(
  deps: DetectProtocolDeps,
  scheme: string,
): Promise<{ installed: boolean; displayName?: string }> {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
    return { installed: false };
  }

  const timeoutMs = deps.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

  if (deps.platform === 'darwin' || deps.platform === 'win32') {
    try {
      const info = await Promise.race([
        deps.getApplicationInfoForProtocol(`${scheme}://`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs),
        ),
      ]);
      if (!info.name || !info.path) return { installed: false };
      return { installed: true, displayName: info.name };
    } catch {
      return { installed: false };
    }
  }

  const runner = deps.runXdgMime ?? xdgMimeReal;
  try {
    const { stdout } = await runner(scheme, timeoutMs);
    const trimmed = stdout.trim();
    if (!trimmed) return { installed: false };
    return { installed: true };
  } catch {
    return { installed: false };
  }
}

interface SpawnCursorDeps {
  getApplicationInfoForProtocol: (url: string) => Promise<AppInfo>;
  resolveCursorBinary?: (timeoutMs: number) => Promise<string | null>;
  spawn: (exec: string, args: ReadonlyArray<string>, timeoutMs: number) => Promise<SpawnOutcome>;
  platform: NodeJS.Platform;
  projectPath?: string;
  resolveTimeoutMs?: number;
  spawnTimeoutMs?: number;
}

function resolveSpawnInvocation(
  resolvedPath: string,
  userPath: string,
  platform: NodeJS.Platform,
): { exec: string; args: ReadonlyArray<string> } {
  if (platform === 'darwin' && /\.app\/?$/.test(resolvedPath)) {
    const bundle = resolvedPath.replace(/\/$/, '');
    return { exec: '/usr/bin/open', args: ['-a', bundle, userPath] };
  }
  return { exec: resolvedPath, args: [userPath] };
}

export function validateSpawnPath(path: string, platform: NodeJS.Platform): boolean {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('\0')) return false;
  if (platform === 'win32') {
    return /^([a-zA-Z]:[\\/]|\\\\)/.test(path);
  }
  return path.startsWith('/');
}

export function isPathWithinProject(
  userPath: string,
  projectPath: string,
  platform: NodeJS.Platform,
): boolean {
  if (!validateSpawnPath(userPath, platform)) return false;
  if (!validateSpawnPath(projectPath, platform)) return false;
  const p = platform === 'win32' ? pathWin32 : pathPosix;
  try {
    const canonicalUser = p.resolve(userPath);
    const canonicalProject = p.resolve(projectPath);
    if (canonicalUser === canonicalProject) return true;
    const rel = p.relative(canonicalProject, canonicalUser);
    if (rel === '' || rel === '.') return true;
    if (rel === '..' || rel.startsWith(`..${p.sep}`)) return false;
    if (platform === 'win32' && /^[a-zA-Z]:[\\/]/.test(rel)) return false;
    if (platform !== 'win32' && rel.startsWith('/')) return false;
    return true;
  } catch {
    return false;
  }
}

function whichCursorReal(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFile(cmd, ['cursor'], { timeout: timeoutMs, encoding: 'utf-8' }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const first = stdout.split(/\r?\n/)[0]?.trim();
      resolve(first && first.length > 0 ? first : null);
    });
  });
}

export async function spawnCursor(deps: SpawnCursorDeps, path: string): Promise<SpawnOutcome> {
  if (!validateSpawnPath(path, deps.platform)) {
    return { ok: false, reason: 'invalid-path' };
  }
  if (
    deps.projectPath !== undefined &&
    !isPathWithinProject(path, deps.projectPath, deps.platform)
  ) {
    return { ok: false, reason: 'invalid-path' };
  }

  let binaryPath: string | null = null;
  try {
    const info = await deps.getApplicationInfoForProtocol('cursor://');
    if (info.path) binaryPath = info.path;
  } catch {}

  if (!binaryPath) {
    const fallback = deps.resolveCursorBinary ?? whichCursorReal;
    try {
      binaryPath = await fallback(deps.resolveTimeoutMs ?? WHICH_TIMEOUT_MS);
    } catch {
      binaryPath = null;
    }
  }

  if (!binaryPath) {
    return { ok: false, reason: 'not-installed' };
  }

  const { exec, args } = resolveSpawnInvocation(binaryPath, path, deps.platform);
  return deps.spawn(exec, args, deps.spawnTimeoutMs ?? SPAWN_TIMEOUT_MS);
}

type ShowItemInFolderOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid-format' | 'no-project-bound' | 'out-of-project' };

interface ShowItemInFolderDeps {
  readonly platform: NodeJS.Platform;
  readonly projectPath: string | undefined;
  readonly showItemInFolder: (path: string) => void;
}

export function showItemInFolder(
  deps: ShowItemInFolderDeps,
  path: string,
): ShowItemInFolderOutcome {
  if (!validateSpawnPath(path, deps.platform)) {
    return { ok: false, reason: 'invalid-format' };
  }
  if (deps.projectPath === undefined) {
    return { ok: false, reason: 'no-project-bound' };
  }
  if (!isPathWithinProject(path, deps.projectPath, deps.platform)) {
    return { ok: false, reason: 'out-of-project' };
  }
  deps.showItemInFolder(path);
  return { ok: true };
}

interface RecordHandoffDeps {
  readonly homedir: () => string;
  readonly appendFile: (path: string, content: string) => Promise<void>;
  readonly mkdir?: (path: string) => Promise<void>;
  readonly warn?: (message: string) => void;
}

export const STATS_FILE_RELATIVE_PATH = ['.ok', 'stats.jsonl'] as const;

export async function recordHandoff(
  deps: RecordHandoffDeps,
  line: HandoffStatsLine,
): Promise<void> {
  const home = deps.homedir();
  const dir = join(home, STATS_FILE_RELATIVE_PATH[0]);
  const file = join(dir, STATS_FILE_RELATIVE_PATH[1]);
  const json = `${JSON.stringify(line)}\n`;

  const warn = deps.warn ?? ((m: string) => console.warn(m));
  try {
    if (deps.mkdir) {
      await deps.mkdir(dir);
    }
    await deps.appendFile(file, json);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warn(`[handoff] recordHandoff failed (telemetry skipped): ${reason}`);
  }
}
