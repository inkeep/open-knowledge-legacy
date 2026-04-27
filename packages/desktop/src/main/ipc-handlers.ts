/**
 * Pure, injectable IPC handler implementations for Open-in-Agent scheme
 * detection and Cursor two-step folder-spawn.
 *
 * Each exported function takes an explicit `deps` object + channel args and
 * returns the channel result. Registration (binding to `ipcMain.handle` via
 * `createHandler`) happens in `main/index.ts` — the ONLY main-process file
 * allowed to touch raw electron IPC primitives (enforced by the
 * `no-loosely-typed-webcontents-ipc` biome rule).
 */

import { execFile } from 'node:child_process';
import { join, posix as pathPosix, win32 as pathWin32 } from 'node:path';
import type { HandoffStatsLine, SpawnOutcome } from '../shared/ipc-channels.ts';

const DEFAULT_PROBE_TIMEOUT_MS = 2000;
const WHICH_TIMEOUT_MS = 500;
const SPAWN_TIMEOUT_MS = 2000;

/** Shape of the Electron `app.getApplicationInfoForProtocol` return. */
interface AppInfo {
  /** Display name of the handler (e.g. "Claude"). */
  name: string;
  /** Filesystem path of the handler binary (used by spawnCursor). */
  path: string;
}

/** Injected by main/index.ts; replaceable in tests with stubbed Promise returns. */
interface DetectProtocolDeps {
  /** `process.platform` at call time. Drives the macOS+Windows vs Linux branch. */
  platform: NodeJS.Platform;
  /**
   * Wraps `app.getApplicationInfoForProtocol(url)`. Rejects when the scheme
   * has no registered handler — caught and translated to `{installed:false}`.
   * Kept as an injected dep so unit tests don't need a live Electron app.
   */
  getApplicationInfoForProtocol: (url: string) => Promise<AppInfo>;
  /**
   * Linux fallback: `xdg-mime query default x-scheme-handler/<scheme>`.
   * Non-empty stdout → installed. Default implementation uses `execFile`
   * with a hard timeout; overridable for tests.
   */
  runXdgMime?: (scheme: string, timeoutMs: number) => Promise<{ stdout: string; code: number }>;
  /** Probe-wide timeout. Defaults to `DEFAULT_PROBE_TIMEOUT_MS`. */
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
          // Treat timeout / missing xdg-mime / non-zero exit as "not registered"
          // — the return shape collapses everything to the conservative default
          // that renders the row disabled. Logging happens at the caller layer
          // if diagnostic signal is ever needed.
          resolve({ stdout: '', code: typeof err.code === 'number' ? err.code : 1 });
          return;
        }
        resolve({ stdout, code: 0 });
      },
    );
  });
}

/**
 * Probe whether `<scheme>:` has a default handler registered on this OS.
 * Returns the conservative `{installed:false}` on any failure so the
 * dropdown row renders disabled-with-tooltip instead of crashing.
 */
export async function detectProtocol(
  deps: DetectProtocolDeps,
  scheme: string,
): Promise<{ installed: boolean; displayName?: string }> {
  // Reject obviously malformed inputs up front — empty or non-RFC-3986-ish
  // scheme strings would interpolate into shell commands on the Linux path.
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
      // Electron returns an empty `name` / `path` on Windows when no handler
      // is registered (rather than rejecting) — treat that as "not installed".
      if (!info.name || !info.path) return { installed: false };
      return { installed: true, displayName: info.name };
    } catch {
      return { installed: false };
    }
  }

  // Linux path — Electron's `getApplicationInfoForProtocol` is mac+Windows
  // only. Fall back to `xdg-mime`, the same probe the web-host endpoint uses.
  const runner = deps.runXdgMime ?? xdgMimeReal;
  try {
    const { stdout } = await runner(scheme, timeoutMs);
    const trimmed = stdout.trim();
    if (!trimmed) return { installed: false };
    // xdg-mime returns something like `anthropic-claude.desktop`. We don't
    // have a display name surface on Linux; the dropdown's label still comes
    // from `KNOWN_TARGETS.displayName`.
    return { installed: true };
  } catch {
    return { installed: false };
  }
}

interface SpawnCursorDeps {
  /**
   * Used first to resolve the Cursor binary path — never trust `$PATH` alone
   * because an attacker-controlled cwd could shadow `cursor` via a malicious
   * binary.
   */
  getApplicationInfoForProtocol: (url: string) => Promise<AppInfo>;
  /**
   * Fallback resolver for the Cursor binary. Default implementation shells
   * out to `which cursor` (POSIX) / `where cursor` (Windows). 500ms budget.
   */
  resolveCursorBinary?: (timeoutMs: number) => Promise<string | null>;
  /**
   * Spawns the resolved `exec` with `args` argv. Must pass `shell:false` and
   * an argv array (not a command string). Resolves `{ok:true}` on successful
   * spawn (not on process exit) or `{ok:false, reason}` otherwise.
   */
  spawn: (exec: string, args: ReadonlyArray<string>, timeoutMs: number) => Promise<SpawnOutcome>;
  platform: NodeJS.Platform;
  /**
   * Project root of the caller window. When present, `spawnCursor` refuses
   * any user-supplied path that doesn't resolve at or under this root — a
   * renderer compromise can't steer Cursor at arbitrary filesystem locations
   * (`~/.ssh`, `/etc`, ...). When absent (Navigator window has no project
   * context), the check is skipped.
   */
  projectPath?: string;
  /** Resolve-phase timeout. Defaults to `WHICH_TIMEOUT_MS`. */
  resolveTimeoutMs?: number;
  /** Spawn-phase timeout. Defaults to `SPAWN_TIMEOUT_MS`. */
  spawnTimeoutMs?: number;
}

/**
 * On macOS, `app.getApplicationInfoForProtocol('cursor://').path` returns the
 * `.app` BUNDLE PATH (a directory). `spawn` with `shell:false` can't exec a
 * directory — Unix `exec()` requires a real binary. Route through
 * `/usr/bin/open -a <bundle>` so Launch Services resolves the bundle to its
 * main binary while preserving `shell:false` + argv-array.
 *
 * Windows and Linux return an executable path directly — spawn it as-is.
 */
function resolveSpawnInvocation(
  resolvedPath: string,
  userPath: string,
  platform: NodeJS.Platform,
): { exec: string; args: ReadonlyArray<string> } {
  if (platform === 'darwin' && /\.app\/?$/.test(resolvedPath)) {
    // Normalize a trailing slash so `open -a` matches Launch Services'
    // registered bundle identifier regardless of path shape.
    const bundle = resolvedPath.replace(/\/$/, '');
    return { exec: '/usr/bin/open', args: ['-a', bundle, userPath] };
  }
  return { exec: resolvedPath, args: [userPath] };
}

/** Reject non-absolute paths, null bytes, and empties. Shared with tests. */
export function validateSpawnPath(path: string, platform: NodeJS.Platform): boolean {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('\0')) return false;
  if (platform === 'win32') {
    // Match `C:\…`, `C:/…`, or UNC `\\server\share\…`.
    return /^([a-zA-Z]:[\\/]|\\\\)/.test(path);
  }
  // POSIX (darwin / linux) — absolute paths start with `/`.
  return path.startsWith('/');
}

/**
 * Resolve both paths canonically and verify `path` lies at or under
 * `projectPath`. Returns false on invalid inputs or boundary escape.
 *
 * Uses `path/posix` or `path/win32` explicitly instead of the host default so
 * Windows inputs resolve correctly on a POSIX dev runner under test, and
 * production behavior follows the caller's platform regardless of Node's
 * runtime `path` module.
 */
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
    // `relative` returns `..` / `..\foo` / `../foo` when `userPath` escapes
    // the project root, or an absolute form when drives differ on Windows.
    if (rel === '' || rel === '.') return true;
    if (rel === '..' || rel.startsWith(`..${p.sep}`)) return false;
    // Cross-drive on Windows ("C:\foo" → "D:\bar") makes `relative` return
    // an absolute path; reject anything that still looks absolute.
    if (platform === 'win32' && /^[a-zA-Z]:[\\/]/.test(rel)) return false;
    if (platform !== 'win32' && rel.startsWith('/')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Default `which cursor` / `where cursor` fallback — overridable in tests. */
function whichCursorReal(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFile(cmd, ['cursor'], { timeout: timeoutMs, encoding: 'utf-8' }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      // `where` on Windows may return multiple lines (CRLF-separated); take the first.
      const first = stdout.split(/\r?\n/)[0]?.trim();
      resolve(first && first.length > 0 ? first : null);
    });
  });
}

/**
 * Step 1 of the Cursor two-step handoff — spawn `cursor <projectDir>` so the
 * workspace is already open before the cursor:// prompt URL fires (step 2).
 *
 * If `deps.projectPath` is supplied, `path` must resolve at or under it;
 * otherwise the spawn is refused with `invalid-path`. Bounds a renderer
 * compromise from steering Cursor at arbitrary filesystem locations.
 */
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

  // Prefer Electron's resolved handler path (installer-registered); fall back
  // to `which` only if Electron returns empty. Never trust `$PATH` alone —
  // attacker-controlled cwd could shadow `cursor` with a malicious binary.
  let binaryPath: string | null = null;
  try {
    const info = await deps.getApplicationInfoForProtocol('cursor://');
    if (info.path) binaryPath = info.path;
  } catch {
    // Fall through to the `which` fallback.
  }

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

/** Outcome of a `showItemInFolder` invocation — observable in main logs / tests. */
type ShowItemInFolderOutcome = { ok: true } | { ok: false; reason: 'invalid-path' };

/** Injected deps for `showItemInFolder` — the electron `shell.showItemInFolder` and platform/projectPath. */
interface ShowItemInFolderDeps {
  readonly platform: NodeJS.Platform;
  /** Caller window's project directory; if omitted, validation refuses any path. */
  readonly projectPath: string | undefined;
  /** Wraps `electron.shell.showItemInFolder`. Replaceable in tests. */
  readonly showItemInFolder: (path: string) => void;
}

/**
 * Reveal the given path in the OS file manager. The path must be absolute,
 * free of null bytes, and lie at or under `deps.projectPath` — otherwise the
 * call is refused. Bounds a renderer compromise from steering the OS file
 * manager at arbitrary filesystem locations. Same defense pattern as
 * `spawnCursor`.
 *
 * When `projectPath` is undefined (e.g. Navigator window with no bound
 * project), refuses every path — the only safe default.
 */
export function showItemInFolder(
  deps: ShowItemInFolderDeps,
  path: string,
): ShowItemInFolderOutcome {
  if (!validateSpawnPath(path, deps.platform)) {
    return { ok: false, reason: 'invalid-path' };
  }
  if (deps.projectPath === undefined) {
    return { ok: false, reason: 'invalid-path' };
  }
  if (!isPathWithinProject(path, deps.projectPath, deps.platform)) {
    return { ok: false, reason: 'invalid-path' };
  }
  deps.showItemInFolder(path);
  return { ok: true };
}

/**
 * Local-only telemetry sink. Append-only writer to
 * `~/.open-knowledge/stats.jsonl` — one JSONL line per Open-in-Agent dispatch.
 * Zero phone-home.
 */
interface RecordHandoffDeps {
  /** `os.homedir()` — overridable in tests so a tmpdir stands in for `~`. */
  readonly homedir: () => string;
  /**
   * Append the JSONL line to the stats file. Default wiring uses
   * `fs.promises.appendFile` with utf-8 encoding. Errors thrown by this dep
   * (EACCES / ENOSPC / read-only filesystem) are caught and logged — the
   * caller's promise still resolves so dispatch is never affected.
   */
  readonly appendFile: (path: string, content: string) => Promise<void>;
  /**
   * Ensure the parent directory exists. Default wiring uses
   * `fs.promises.mkdir(path, { recursive: true })`. Errors here are also
   * caught (alongside append errors) and routed through `warn`.
   */
  readonly mkdir?: (path: string) => Promise<void>;
  /** Diagnostic sink for failed appends. Defaults to `console.warn`. */
  readonly warn?: (message: string) => void;
}

/** Path to the stats file relative to HOME. Centralized so tests can assert on it. */
export const STATS_FILE_RELATIVE_PATH = ['.open-knowledge', 'stats.jsonl'] as const;

/**
 * Append one JSONL line to the local stats sink. Failure NEVER throws — a
 * write error is logged via `warn` and the function resolves. Dispatch path
 * is the only consumer; it must not depend on telemetry success.
 */
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
