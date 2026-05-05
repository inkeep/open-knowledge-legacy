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

async function isInsideExistingWorkTree(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function ensureProjectGit(projectRoot: string): Promise<EnsureProjectGitResult> {
  const abs = resolve(projectRoot);
  const gitPath = resolve(abs, '.git');

  if (existsSync(gitPath)) {
    return { didInit: false };
  }

  if (await isInsideExistingWorkTree(abs)) {
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
