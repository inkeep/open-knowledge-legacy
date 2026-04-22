/**
 * Pure, injectable IPC handler implementations.
 *
 * Shape: each exported function takes an explicit `deps` object + the
 * channel args, and returns the channel result. Registration (binding to
 * `ipcMain.handle` via `createHandler`) happens in `main/index.ts`, the
 * ONLY main-process file allowed to touch raw electron IPC primitives
 * per D19 (enforced by `tests/integration/no-loosely-typed-webcontents-ipc.test.ts`).
 *
 * This split keeps business logic test-friendly (no real Electron app
 * needed — deps are injected as plain functions) while the thin
 * registration layer in `main/index.ts` stays the allowlist member.
 *
 * Added 2026-04-21 for SPEC `2026-04-21-open-in-agent-desktop/SPEC.md`
 * §5.1 and §6.5 — the Cursor two-step Electron folder-spawn channel plus
 * the cross-OS detect-protocol probe (macOS + Windows via Electron's
 * `app.getApplicationInfoForProtocol`, Linux via `xdg-mime`).
 */

import { execFile } from 'node:child_process';
import type { SpawnOutcome } from '../shared/ipc-channels.ts';

/** Two seconds is the product-tier budget for "detect one scheme" — SPEC §6.4. */
export const DEFAULT_PROBE_TIMEOUT_MS = 2000;

/** Independent budget for `which cursor` — SPEC §6.5. */
export const WHICH_TIMEOUT_MS = 500;

/** Spawn budget for `cursor <path>` — SPEC §6.5 (argv, shell:false). */
export const SPAWN_TIMEOUT_MS = 2000;

/** Shape of the Electron `app.getApplicationInfoForProtocol` return. */
interface AppInfo {
  /** Display name of the handler (e.g. "Claude"). */
  name: string;
  /** Filesystem path of the handler binary (used by spawnCursor). */
  path: string;
}

/** Injected by main/index.ts; replaceable in tests with stubbed Promise returns. */
export interface DetectProtocolDeps {
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
  // only (SPEC §6.4 audit M6). Fall back to `xdg-mime`, which is the same
  // probe used by the web-host server endpoint.
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

export interface SpawnCursorDeps {
  /**
   * Same Electron wrapper as DetectProtocolDeps — used first to resolve the
   * Cursor binary path (per DC7.1 security note: never trust `$PATH` alone).
   */
  getApplicationInfoForProtocol: (url: string) => Promise<AppInfo>;
  /**
   * Fallback resolver for the Cursor binary. Default implementation shells
   * out to `which cursor` (POSIX) / `where cursor` (Windows). 500ms budget.
   */
  resolveCursorBinary?: (timeoutMs: number) => Promise<string | null>;
  /**
   * Spawns the resolved binary with `[userPath]` argv. Must pass `shell:false`
   * and an argv array (not a command string). Resolves `{ok:true}` on
   * successful spawn (not on process exit) or `{ok:false, reason}` otherwise.
   */
  spawn: (binaryPath: string, userPath: string, timeoutMs: number) => Promise<SpawnOutcome>;
  platform: NodeJS.Platform;
  /** Resolve-phase timeout. Defaults to `WHICH_TIMEOUT_MS`. */
  resolveTimeoutMs?: number;
  /** Spawn-phase timeout. Defaults to `SPAWN_TIMEOUT_MS`. */
  spawnTimeoutMs?: number;
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
 */
export async function spawnCursor(deps: SpawnCursorDeps, path: string): Promise<SpawnOutcome> {
  if (!validateSpawnPath(path, deps.platform)) {
    return { ok: false, reason: 'invalid-path' };
  }

  // Prefer Electron's resolved handler path (installer-registered); fall back
  // to `which` only if Electron returns an empty string. Never trust `$PATH`
  // alone — attacker-controlled cwd could leak in via a shadowed `cursor`
  // binary. See SPEC §6.5 DC7.1 security note.
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

  return deps.spawn(binaryPath, path, deps.spawnTimeoutMs ?? SPAWN_TIMEOUT_MS);
}
