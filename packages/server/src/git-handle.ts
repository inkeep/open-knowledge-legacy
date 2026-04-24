/**
 * Git handle factory for sync operations.
 *
 * createGitInstance() returns a GitHandle with a configured SimpleGit instance.
 * withParentLock() (re-exported from git-mutex.ts) serializes all parent-git
 * write operations (D32) to prevent concurrent git index corruption.
 */

import { resolve } from 'node:path';
import simpleGit, { type SimpleGit, type SimpleGitOptions } from 'simple-git';

export { withParentLock } from './git-mutex.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHandleOptions {
  /** git -c flags for credential injection (from resolveAuth) */
  credentialArgs?: string[];
  /** Override GIT_INDEX_FILE env var for index isolation */
  gitIndexFile?: string;
}

export interface GitHandle {
  git: SimpleGit;
  projectDir: string;
  credentialArgs: string[];
}

type CredentialHelperUnsafeGitOptions = SimpleGitOptions & {
  unsafe?: NonNullable<SimpleGitOptions['unsafe']> & {
    allowUnsafeCredentialHelper?: boolean;
  };
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a SimpleGit instance rooted at `projectDir` with optional credential
 * args and index file isolation.
 */
export function createGitInstance(projectDir: string, options: GitHandleOptions = {}): GitHandle {
  const { credentialArgs = [], gitIndexFile } = options;

  const env: Record<string, string | undefined> = {};
  if (gitIndexFile) {
    env.GIT_INDEX_FILE = resolve(projectDir, gitIndexFile);
  }

  const gitConfig = credentialArgs.length >= 2 ? [credentialArgs[1]] : [];

  // simple-git 3.36 gates credential.helper behind a runtime-only unsafe flag
  // that its published typings don't currently expose.
  const gitOptions: Partial<CredentialHelperUnsafeGitOptions> = {
    baseDir: projectDir,
    config: gitConfig,
    unsafe: { allowUnsafeCredentialHelper: true },
  };

  const git = simpleGit(gitOptions as Partial<SimpleGitOptions>).env(env as Record<string, string>);

  return { git, projectDir, credentialArgs };
}
