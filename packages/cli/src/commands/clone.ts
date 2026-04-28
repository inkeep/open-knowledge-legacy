import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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

  // Auto-init: scaffold .open-knowledge/ if missing. Per-machine OK runtime
  // state self-ignores via the .gitignore inside .open-knowledge/ (written
  // by initContent); we deliberately never mutate the cloned project's root
  // .gitignore.
  const okDir = resolve(targetDir, OK_DIR);
  if (!existsSync(okDir)) {
    try {
      const { runInit } = await import('./init.ts');
      await runInit({ cwd: targetDir, mcp: false });
    } catch {
      // Non-fatal
    }
  }

  return targetDir;
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
