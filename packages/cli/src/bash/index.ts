/**
 * Shell execution primitive for MCP tool internals.
 *
 * Thin wrapper around Node's child_process with project-scoped defaults:
 *   - cwd = projectDir (configurable)
 *   - All paths shell-escaped before being passed to child commands
 *   - Errors thrown, not silently swallowed
 *
 * ## Why not just-bash?
 *
 * The spec (D1) originally proposed using Vercel's `just-bash` package for
 * sandboxing + cloud compatibility. Investigation found:
 *   - just-bash doesn't ship a `git` command (can't do `git log` enrichment)
 *   - For the controlled command + controlled args scenario inside our own
 *     MCP server, sandboxing adds interpreter overhead without meaningful
 *     security benefit
 *
 * Per the spec's R1 mitigation, D1 is an architectural choice, not a lock.
 * The wrapper interface stays identical — if cloud deployment later wants
 * sandboxed execution, we swap the implementation here without touching any
 * tool code.
 *
 * ## Interface
 *
 *   runShell(cmd, opts?)        — arbitrary shell command, returns stdout
 *   cat(path)                   — read a file as UTF-8 (via fs.readFile, no shell)
 *   gitLog(path, count, since?) — parse `git log -N --format=...` into entries
 *   grep(pattern, opts)         — run grep/rg, parse into GrepMatch[]
 *
 * All helpers scope to `getProjectDir()` (module-level state, set once at init).
 */
import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Default maximum stdout/stderr buffer per command (16 MB). */
const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024;

/** Default command timeout (30 seconds). */
const DEFAULT_TIMEOUT_MS = 30_000;

// ── Module-level state ─────────────────────────────────────────────────

let projectDir: string = process.cwd();

/** Set the project directory all helpers resolve paths against. Call once at startup. */
export function setProjectDir(dir: string): void {
  projectDir = resolve(dir);
}

/** Get the current project directory. */
export function getProjectDir(): string {
  return projectDir;
}

// ── Shell escape ───────────────────────────────────────────────────────

/** POSIX shell escape for a single argument. Wraps in single quotes, escapes embedded quotes. */
export function shellEscape(arg: string): string {
  if (arg === '') return "''";
  // Fast path: only safe characters (alphanumeric, ./_-)
  if (/^[\w.\-/]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ── Types ───────────────────────────────────────────────────────────────

export interface ExecShellOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  subject: string;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface GrepOptions {
  caseInsensitive?: boolean;
  /** Absolute or project-relative paths to search. Defaults to project root. */
  paths?: string[];
  /** Glob patterns to include (passed to grep --include). */
  include?: string[];
  /** Glob patterns to exclude (passed to grep --exclude / --exclude-dir). */
  exclude?: string[];
  /** Hard limit on number of matches returned. */
  maxResults?: number;
}

// ── Core exec ───────────────────────────────────────────────────────────

/**
 * Run an arbitrary shell command and return stdout.
 * Caller is responsible for shell-escaping any interpolated values.
 * Throws on non-zero exit code or timeout.
 */
export async function runShell(cmd: string, opts?: ExecShellOptions): Promise<string> {
  const { stdout } = await execAsync(cmd, {
    cwd: opts?.cwd ?? projectDir,
    timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: opts?.maxBuffer ?? DEFAULT_MAX_BUFFER,
  });
  return stdout;
}

// ── cat ─────────────────────────────────────────────────────────────────

/**
 * Read a file as UTF-8. Uses fs.readFile directly — no shell — for safety and speed.
 * Path is resolved against projectDir if relative.
 */
export async function cat(path: string): Promise<string> {
  const abs = resolve(projectDir, path);
  return readFile(abs, 'utf-8');
}

// ── git log ─────────────────────────────────────────────────────────────

/**
 * Run `git log -N --format=%h|%ai|%s -- <path>` and parse into entries.
 * Returns empty array if the file is outside a git repo or has no history.
 * `since` is optional ISO timestamp — when provided, filters to commits after that time.
 */
export async function gitLog(path: string, count: number, since?: string): Promise<GitLogEntry[]> {
  const args = ['log', `-${count}`, '--format=%h|%ai|%s'];
  if (since) {
    args.push(`--since=${shellEscape(since)}`);
  }
  args.push('--', shellEscape(path));
  const cmd = `git ${args.join(' ')}`;
  try {
    const stdout = await runShell(cmd);
    return stdout
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [hash, date, ...subjectParts] = line.split('|');
        return {
          hash: hash ?? '',
          date: date ?? '',
          subject: subjectParts.join('|'),
        };
      });
  } catch {
    // File outside git repo, or git not installed, or no history — all non-fatal.
    return [];
  }
}

// ── grep ────────────────────────────────────────────────────────────────

/**
 * Run grep and parse into structured matches.
 * Uses system grep with `-rn` (recursive, with line numbers).
 * Returns empty array when no matches (grep exits 1 on no match; we treat that as empty).
 */
export async function grep(pattern: string, opts: GrepOptions = {}): Promise<GrepMatch[]> {
  const args: string[] = ['-rn'];
  if (opts.caseInsensitive ?? true) args.push('-i');
  // Fixed-string matching — treats the pattern literally, no regex surprises.
  args.push('-F');
  for (const inc of opts.include ?? []) {
    args.push(`--include=${shellEscape(inc)}`);
  }
  for (const exc of opts.exclude ?? []) {
    args.push(`--exclude=${shellEscape(exc)}`);
    // Also exclude matching directories (common for node_modules, .git etc.)
    args.push(`--exclude-dir=${shellEscape(exc)}`);
  }
  args.push('--', shellEscape(pattern));

  const searchPaths = opts.paths?.length ? opts.paths.map(shellEscape) : ['.'];
  const cmd = `grep ${args.join(' ')} ${searchPaths.join(' ')}`;

  let stdout = '';
  try {
    stdout = await runShell(cmd);
  } catch (err) {
    // grep exits 1 when no matches found — not an error for us.
    // exitCode 2+ means actual error (bad pattern, unreadable file, etc.)
    const errObj = err as { code?: number; stdout?: string };
    if (errObj.code === 1) {
      return [];
    }
    // Some grep errors still include partial stdout (e.g. permission denied on one file)
    if (typeof errObj.stdout === 'string' && errObj.stdout.length > 0) {
      stdout = errObj.stdout;
    } else {
      throw err;
    }
  }

  const matches: GrepMatch[] = [];
  const limit = opts.maxResults ?? Number.POSITIVE_INFINITY;
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue;
    if (matches.length >= limit) break;
    // Format: <path>:<line>:<text>
    const firstColon = line.indexOf(':');
    if (firstColon === -1) continue;
    const secondColon = line.indexOf(':', firstColon + 1);
    if (secondColon === -1) continue;
    const path = line.slice(0, firstColon);
    const lineNumStr = line.slice(firstColon + 1, secondColon);
    const text = line.slice(secondColon + 1);
    const lineNum = Number.parseInt(lineNumStr, 10);
    if (!Number.isFinite(lineNum)) continue;
    matches.push({ path, line: lineNum, text });
  }
  return matches;
}
