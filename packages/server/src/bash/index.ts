import { isAbsolute, resolve } from 'node:path';
import { Bash, ReadWriteFs } from 'just-bash';
import { shellEscape } from './shell-escape.ts';

const MAX_STDOUT_BYTES = 16 * 1024 * 1024;

export { shellEscape } from './shell-escape.ts';

interface ExecBashResult {
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

export function createBashInstance(cwd: string): Bash {
  if (!isAbsolute(cwd)) {
    throw new Error(`createBashInstance: cwd must be absolute (got: ${cwd})`);
  }
  return new Bash({
    cwd: '/',
    fs: new ReadWriteFs({ root: resolve(cwd), allowSymlinks: false }),
  });
}

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

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

interface GrepOptions {
  caseInsensitive?: boolean;
  paths?: string[];
  include?: string[];
  exclude?: string[];
  maxResults?: number;
}

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
  for (const inc of opts.include ?? []) {
    flags.push(`--include=${shellEscape(normalizeGrepGlob(inc))}`);
  }
  for (const exc of opts.exclude ?? []) {
    flags.push(`--exclude=${shellEscape(normalizeGrepGlob(exc))}`);
    flags.push(`--exclude-dir=${shellEscape(normalizeGrepGlob(exc))}`);
  }

  const searchPaths = opts.paths?.length ? opts.paths.map(shellEscape) : ['.'];
  const cmd = `grep ${flags.join(' ')} ${shellEscape(pattern)} ${searchPaths.join(' ')}`;

  let result: ExecBashResult;
  try {
    result = await execBash(bash, cmd);
  } catch (err) {
    if (err instanceof StdoutOverflowError) {
      result = err.partial;
    } else {
      throw err;
    }
  }

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
