/**
 * Bash execution primitive — just-bash interpreter + ReadWriteFs backend.
 *
 * Replaces the previous child_process-based primitives (runShell/gitLog/grep).
 * Per D14/D18/FR18:
 *   - `just-bash` owns parsing, pipes, globs, quoting — we never hand input
 *     to a host shell.
 *   - `ReadWriteFs` sandboxes I/O to the caller-supplied cwd; traversal
 *     outside it is rejected at the filesystem layer (EACCES from
 *     `resolveAndValidate`).
 *   - Shadow-repo history is read via `simple-git` in `src/content/shadow-log.ts`,
 *     NOT through this module.
 *
 * **cwd is caller-supplied and per-call.** No module-level singleton. The
 * MCP server resolves the effective cwd from client roots / explicit args
 * and passes it in. `ReadWriteFs` uses that cwd as the virtual root `/`
 * inside the interpreter — agent-supplied paths like `articles/auth.md`
 * resolve relative to that root, which maps to `<cwd>/articles/auth.md`
 * on disk. Traversal above the cwd is rejected.
 *
 * Public surface:
 *   - shellEscape — POSIX-safe arg quoting
 *   - createBashInstance(cwd) — a fresh `Bash` scoped to the given host
 *     directory. `cwd` must be an absolute host path.
 *   - execBash(bash, command) — run a pre-validated command string
 *   - StdoutOverflowError — thrown when output exceeds the 16 MB cap
 *   - grep(pattern, cwd, opts?) — internal helper for `search`, implemented
 *     on top of just-bash so there's no host `/usr/bin/grep` dependency
 *
 * Spec: SPEC.md FR18 + D14 + D15.
 */
import { isAbsolute, resolve } from 'node:path';
import { Bash, ReadWriteFs } from 'just-bash';
import { shellEscape } from './shell-escape.ts';

/** Hard cap on stdout bytes returned by `execBash` (16 MB per FR19/D9). */
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;

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
 * Create a fresh `Bash` instance scoped to the given host directory.
 * Callers wanting per-call isolation should create a new instance each call.
 *
 * `cwd` must be an absolute host path. `ReadWriteFs` uses that cwd as its
 * sandbox root (mapped to virtual `/` inside the interpreter), so agent
 * paths like `articles/auth.md` resolve to `<cwd>/articles/auth.md`, and
 * traversal above the cwd (`..`, absolute `/etc/passwd`, etc.) is blocked.
 */
export function createBashInstance(cwd: string): Bash {
  if (!isAbsolute(cwd)) {
    throw new Error(`createBashInstance: cwd must be absolute (got: ${cwd})`);
  }
  return new Bash({
    cwd: '/',
    fs: new ReadWriteFs({ root: resolve(cwd), allowSymlinks: false }),
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
  /** Absolute or cwd-relative paths to search. Defaults to `.` (the cwd). */
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
 * `cwd` must be an absolute host path — the grep runs with that cwd, so
 * paths in `opts.paths` are interpreted relative to it (or literally if
 * absolute).
 */
/**
 * Strip the leading `**\/` from a picomatch-style include/exclude glob so
 * just-bash's grep (which only matches basenames) can apply it. `**\/*.md` ->
 * `*.md`; `docs/**\/*.md` stays unchanged (loses the directory constraint —
 * a known limitation; use `opts.paths` to scope instead).
 */
function normalizeGrepGlob(pat: string): string {
  return pat.startsWith('**/') ? pat.slice(3) : pat;
}

export async function grep(
  pattern: string,
  cwd: string,
  opts: GrepOptions = {},
): Promise<GrepMatch[]> {
  const bash = createBashInstance(cwd);

  const flags: string[] = ['-rn', '-F']; // recursive, line numbers, fixed-string
  if (opts.caseInsensitive ?? true) flags.push('-i');
  // just-bash's grep has two quirks the space-separated form doesn't survive:
  // (1) `--include PATTERN` (space) is silently ignored — the equals form
  //     `--include=PATTERN` is required.
  // (2) `--include` matches the file basename only, with glob patterns that
  //     DON'T support `**`. A config value like `**/*.md` never matches any
  //     file (no basename starts with `**/`). Strip the `**/` prefix so the
  //     picomatch-style config globs used elsewhere in the app work here too.
  //     Complex path-constrained globs (`docs/**/*.md`) lose the directory
  //     constraint at this layer — accept as a known limitation; restrict
  //     via `opts.paths` instead.
  for (const inc of opts.include ?? []) {
    flags.push(`--include=${shellEscape(normalizeGrepGlob(inc))}`);
  }
  for (const exc of opts.exclude ?? []) {
    flags.push(`--exclude=${shellEscape(normalizeGrepGlob(exc))}`);
    flags.push(`--exclude-dir=${shellEscape(normalizeGrepGlob(exc))}`);
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
