/**
 * Project-git auto-init — fail-fast replacement for standalone-mode shadow.
 *
 * Ensures `<projectRoot>/.git/` exists before any shadow-repo or HEAD-watcher
 * subsystem runs. Called as a pre-listen hook from `bootServer` (via
 * `ensureProjectGitFn`) and directly from `ok init`. Never falls back to a
 * degraded mode — SPEC D12 LOCKED.
 *
 * Layout decisions:
 *   - D3: default branch is always `main` (regardless of user's `init.defaultBranch`)
 *   - D6: `.git` presence check is `existsSync` — matches dir OR file. Worktree
 *     semantics are out of scope (NG6, owned by a separate spec).
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class ProjectGitInitError extends Error {
  readonly stderr: string;
  constructor(message: string, stderr = '', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProjectGitInitError';
    this.stderr = stderr;
  }
}

export interface EnsureProjectGitResult {
  didInit: boolean;
}

/**
 * Ensure `<projectRoot>/.git/` exists. Returns `{ didInit: false }` when the
 * project already has `.git/`; otherwise runs `git init --initial-branch=main`
 * and returns `{ didInit: true }`.
 *
 * Throws `ProjectGitInitError` if the `git` binary is missing, the spawn fails,
 * or `git init` reports success but `.git/HEAD` is absent afterwards. Callers
 * are expected to propagate the error (no degraded fallback — SPEC D12).
 */
export async function ensureProjectGit(projectRoot: string): Promise<EnsureProjectGitResult> {
  const abs = resolve(projectRoot);
  const gitPath = resolve(abs, '.git');

  if (existsSync(gitPath)) {
    return { didInit: false };
  }

  let stderr = '';
  try {
    const result = await execFileAsync('git', ['init', '--initial-branch=main', abs]);
    stderr = result.stderr ?? '';
  } catch (err) {
    const capturedStderr =
      err !== null && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr ?? '')
        : '';
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProjectGitInitError(`git init failed at ${abs}: ${msg}`, capturedStderr, {
      cause: err,
    });
  }

  if (!existsSync(resolve(gitPath, 'HEAD'))) {
    throw new ProjectGitInitError(
      `git init reported success but ${gitPath}/HEAD is missing (partial init detected)`,
      stderr,
    );
  }

  console.log(`[project-git] initialized .git/ at ${abs} (branch: main)`);

  return { didInit: true };
}
