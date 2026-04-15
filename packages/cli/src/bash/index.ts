/**
 * Bash execution primitive — just-bash interpreter + ReadWriteFs backend.
 *
 * Replaces the previous child_process-based primitives (runShell/gitLog/grep).
 * Per D14/D18/FR18:
 *   - `just-bash` owns parsing, pipes, globs, quoting — we never hand input
 *     to a host shell.
 *   - `ReadWriteFs` sandboxes I/O to `projectDir`; traversal outside is
 *     rejected at the filesystem layer (EACCES from `resolveAndValidate`).
 *   - Shadow-repo history is read via `simple-git` in `src/content/shadow-log.ts`,
 *     NOT through this module.
 *
 * **IMPORTANT:** `ReadWriteFs` presents the host directory as the virtual
 * root `/` inside the interpreter. Agent-supplied paths like
 * `articles/auth.md` resolve relative to `cwd: '/'`, which maps to
 * `<projectDir>/articles/auth.md` on disk. Passing `cwd: projectDir`
 * (the host path) causes "No such file or directory" because the sandbox
 * has no knowledge of that absolute path.
 *
 * Public surface:
 *   - setProjectDir / getProjectDir — module state set once at startup
 *   - shellEscape — POSIX-safe arg quoting (retained for callers building
 *     display strings)
 *   - createBashInstance(projectDir?) — a fresh `Bash` scoped to projectDir
 *   - execBash(bash, command) — run a pre-validated command string
 *   - StdoutOverflowError — thrown when output exceeds the 16 MB cap
 *   - grep(pattern, opts?) — internal helper for `search`, implemented
 *     on top of just-bash so there's no host `/usr/bin/grep` dependency
 *
 * Spec: SPEC.md FR18 + D14 + D15.
 */
import { resolve } from 'node:path';
import { Bash, ReadWriteFs } from 'just-bash';
import { shellEscape } from './shell-escape.ts';

/** Hard cap on stdout bytes returned by `execBash` (16 MB per FR19/D9). */
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;

// ── Module-level state ─────────────────────────────────────────────────

let projectDir: string = process.cwd();

/** Set the project directory the Bash instance scopes I/O against. Call once at startup. */
export function setProjectDir(dir: string): void {
  projectDir = resolve(dir);
}

/** Get the current project directory. */
export function getProjectDir(): string {
  return projectDir;
}

// ── POSIX shell escape (retained for display/tool-description use) ──────
// Lives in `./shell-escape.ts` so the pure parse-command module can import
// it without pulling in the just-bash runtime. Re-exported here for callers
// that expect the function on the bash barrel.
export { shellEscape } from './shell-escape.ts';

// ── just-bash primitives ────────────────────────────────────────────────

export interface ExecBashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class StdoutOverflowError extends Error {
  public readonly limitBytes: number;
  public readonly actualBytes: number;
  public readonly partial: ExecBashResult;
  constructor(limit: number, actual: number, partial: ExecBashResult) {
    super(`Output exceeded ${limit} byte buffer (got ${actual}); narrow the command`);
    this.name = 'StdoutOverflowError';
    this.limitBytes = limit;
    this.actualBytes = actual;
    this.partial = partial;
  }
}

/**
 * Create a fresh `Bash` instance scoped to the given project directory.
 * Callers wanting per-call isolation should create a new instance each call.
 *
 * See the file header for the `cwd: '/'` rationale — do NOT pass the host
 * path as `cwd`, it will produce "No such file or directory" for every path.
 */
export function createBashInstance(dir: string = projectDir): Bash {
  const root = resolve(dir);
  return new Bash({
    cwd: '/',
    fs: new ReadWriteFs({ root, allowSymlinks: false }),
  });
}

/**
 * Execute a pre-validated command string through a just-bash instance.
 * Callers are responsible for structural validation via `parseCommand` —
 * this function itself does NO allow/deny checking.
 *
 * Enforces the 16 MB stdout hard cap post-hoc: throws `StdoutOverflowError`
 * when exceeded, with the captured portion attached.
 */
export async function execBash(bash: Bash, command: string): Promise<ExecBashResult> {
  const result = await bash.exec(command);
  if (result.stdout.length > MAX_STDOUT_BYTES) {
    throw new StdoutOverflowError(MAX_STDOUT_BYTES, result.stdout.length, {
      stdout: result.stdout.slice(0, MAX_STDOUT_BYTES),
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

// ── grep helper (consumed by `search` MCP tool) ─────────────────────────

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

/**
 * Fixed-string recursive grep implemented via just-bash. Preserves the
 * `GrepMatch[]` contract the `search` MCP tool depends on.
 *
 * Paths passed in `opts.paths` are interpreted relative to the sandbox
 * root — i.e., `.` (default) resolves to projectDir.
 */
export async function grep(pattern: string, opts: GrepOptions = {}): Promise<GrepMatch[]> {
  const bash = createBashInstance(projectDir);

  const flags: string[] = ['-rn', '-F']; // recursive, line numbers, fixed-string
  if (opts.caseInsensitive ?? true) flags.push('-i');
  for (const inc of opts.include ?? []) {
    flags.push('--include', shellEscape(inc));
  }
  for (const exc of opts.exclude ?? []) {
    flags.push('--exclude', shellEscape(exc));
    flags.push('--exclude-dir', shellEscape(exc));
  }

  const searchPaths = opts.paths?.length ? opts.paths.map(shellEscape) : ['.'];
  // Note: just-bash's grep does not recognize the `--` end-of-options
  // marker; omit it. Pattern is always quoted for safety.
  const cmd = `grep ${flags.join(' ')} ${shellEscape(pattern)} ${searchPaths.join(' ')}`;

  let result: ExecBashResult;
  try {
    result = await execBash(bash, cmd);
  } catch (err) {
    if (err instanceof StdoutOverflowError) {
      // Return partial results if any; do not throw on overflow from grep —
      // the `maxResults` cap handles agent context size.
      result = err.partial;
    } else {
      throw err;
    }
  }

  // grep exits 1 with empty stdout when no matches — not an error.
  if (result.exitCode === 1 && !result.stdout) return [];
  if (result.exitCode !== 0 && result.exitCode !== 1 && !result.stdout) {
    throw new Error(`grep exited ${result.exitCode}: ${result.stderr}`);
  }

  const matches: GrepMatch[] = [];
  const limit = opts.maxResults ?? Number.POSITIVE_INFINITY;
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    if (matches.length >= limit) break;
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
