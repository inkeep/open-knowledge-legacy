import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import simpleGit, { type SimpleGitOptions } from 'simple-git';
import { resolveAuth } from '../auth/resolve-auth.ts';
import { createTokenStore } from '../auth/token-store.ts';
import { OK_DIR } from '../constants.ts';
import { parseGitUrl } from '../github/url.ts';
import type { Config } from '../index.ts';

// ---------------------------------------------------------------------------
// Progress phase weighting
// Counting: 0-10%, Compressing: 10-20%, Receiving: 20-60%, Resolving: 60-100%
// ---------------------------------------------------------------------------

const STAGE_RANGES: [string, number, number][] = [
  ['count', 0, 10],
  ['compress', 10, 20],
  ['receiv', 20, 60],
  ['resolv', 60, 100],
];

function parseProgressLine(line: string): { stage: string; pct: number } | null {
  // Match lines like "Receiving objects:  56% (7/12)"
  const m = /^([\w ]+):\s+(\d+)%/.exec(line.trim());
  if (!m) return null;
  const label = m[1].toLowerCase();
  const raw = Number(m[2]);
  for (const [key, start, end] of STAGE_RANGES) {
    if (label.includes(key)) {
      return { stage: m[1], pct: Math.round(start + (raw / 100) * (end - start)) };
    }
  }
  return null;
}

function emit(json: boolean, obj: Record<string, unknown>): void {
  if (json) process.stdout.write(`${JSON.stringify(obj)}\n`);
}

// ---------------------------------------------------------------------------
// Core clone logic
// ---------------------------------------------------------------------------

interface CloneOptions {
  json: boolean;
  dir?: string;
}

type CredentialHelperUnsafeGitOptions = SimpleGitOptions & {
  unsafe?: NonNullable<SimpleGitOptions['unsafe']> & {
    allowUnsafeCredentialHelper?: boolean;
  };
};

async function runClone(
  url: string,
  opts: CloneOptions,
  _config: Config,
  cwd = process.cwd(),
): Promise<string> {
  const parsed = parseGitUrl(url);
  if (!parsed) {
    throw new Error(`Invalid git URL: ${url}`);
  }

  const targetDir = opts.dir ? resolve(cwd, opts.dir) : resolve(cwd, parsed.name);

  // Reject non-empty directories
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir);
    if (entries.length > 0) {
      throw new Error(`Target directory is not empty: ${targetDir}`);
    }
  }

  const tokenStore = await createTokenStore();
  const resolved = await resolveAuth(parsed.hostname, tokenStore, {});

  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0',
  };

  // Build -c credential.helper config if needed
  const gitConfig = resolved.credentialArgs.length >= 2 ? [resolved.credentialArgs[1]] : [];

  // simple-git 3.36 gates credential.helper behind a runtime-only unsafe flag
  // that its published typings don't currently expose.
  const gitOptions: Partial<CredentialHelperUnsafeGitOptions> = {
    baseDir: cwd,
    config: gitConfig,
    unsafe: { allowUnsafeCredentialHelper: true },
  };

  const git = simpleGit(gitOptions as Partial<SimpleGitOptions>).env(env);

  let lastPct = -1;

  git.outputHandler((_cmd, _stdout, stderr) => {
    stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      for (const line of text.split('\n')) {
        const prog = parseProgressLine(line);
        if (prog && prog.pct !== lastPct) {
          lastPct = prog.pct;
          emit(opts.json, { type: 'progress', pct: prog.pct, stage: prog.stage });
          if (!opts.json) {
            process.stderr.write(`\r  Cloning… ${prog.pct}%`);
          }
        }
      }
    });
  });

  await git.clone(url, targetDir, ['--progress']);

  if (!opts.json) process.stderr.write('\n');

  // Auto-init: scaffold .open-knowledge/ unconditionally. `runInit` is idempotent
  // via per-file `writeIfMissing`, so it backfills a missing `.gitignore` even
  // when upstream committed `.open-knowledge/config.yml` without one.
  try {
    const { runInit } = await import('./init.ts');
    await runInit({ cwd: targetDir, mcp: false });
  } catch {
    // Non-fatal
  }

  // Per-clone protection from upstream pollution: append `.open-knowledge/` to
  // the cloned repo's `.git/info/exclude`. That file is per-clone and never
  // committed, so OK state can't accidentally land in someone else's tree from
  // a stray `git add .`. Symmetric with `ok init`'s stance — `init` is the
  // user's own project (config.yml is meant to be tracked, no exclude needed).
  try {
    ensureOkExcludedFromGit(targetDir);
  } catch {
    // Non-fatal — best-effort
  }

  return targetDir;
}

/**
 * Append `${OK_DIR}/` to `<projectDir>/.git/info/exclude` so the cloned repo's
 * outer git ignores OK state without mutating any tracked file.
 *
 * Idempotent: recognizes the common variants (`.open-knowledge`,
 * `.open-knowledge/`, leading-slash rooted forms) and only appends when none
 * are present. Returns `'no-exclude'` when the file is absent (e.g., not a git
 * repo, or a bare repo with no `info/` dir) — the caller treats that case as
 * a no-op.
 */
export function ensureOkExcludedFromGit(
  projectDir: string,
): 'appended' | 'already-present' | 'no-exclude' {
  const excludePath = join(projectDir, '.git', 'info', 'exclude');
  if (!existsSync(excludePath)) return 'no-exclude';

  const existing = readFileSync(excludePath, 'utf-8');
  const variants = new Set([OK_DIR, `${OK_DIR}/`, `/${OK_DIR}`, `/${OK_DIR}/`]);
  const alreadyPresent = existing
    .split('\n')
    .map((line) => line.trim())
    .some((line) => variants.has(line));
  if (alreadyPresent) return 'already-present';

  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  writeFileSync(excludePath, `${existing}${separator}${OK_DIR}/\n`, 'utf-8');
  return 'appended';
}

// ---------------------------------------------------------------------------
// Commander command
// ---------------------------------------------------------------------------

export function cloneCommand(getConfig: () => Config): Command {
  return new Command('clone')
    .description('Clone a git repository and open it')
    .argument('<url>', 'Repository URL or owner/repo shorthand')
    .argument('[dir]', 'Target directory (default: ./<repo-name>)')
    .option('--json', 'Output JSONL progress events', false)
    .action(async (url: string, dir: string | undefined, opts: { json: boolean }) => {
      const config = getConfig();
      try {
        const targetDir = await runClone(url, { json: opts.json, dir }, config);
        if (opts.json) {
          emit(true, { type: 'complete', dir: targetDir });
        } else {
          process.stderr.write(`✓ Cloned to ${targetDir}\n`);
          // Chain into start — change to the cloned dir and launch
          process.chdir(targetDir);
          const { startCommand } = await import('./start.ts');
          const startCmd = startCommand(getConfig);
          await startCmd.parseAsync([], { from: 'user' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          emit(true, { type: 'error', message: msg });
        } else {
          process.stderr.write(`✗ ${msg}\n`);
        }
        // Don't call process.exit — it can truncate a buffered stdout pipe
        // before the final JSON line is flushed. Set exitCode and return so
        // Node drains stdout naturally before the process exits.
        process.exitCode = 1;
      }
    });
}
