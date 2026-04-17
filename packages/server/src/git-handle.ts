/**
 * Git handle factory for sync operations.
 *
 * createGitInstance() returns a GitHandle with a configured SimpleGit instance.
 * withParentLock() (re-exported from git-mutex.ts) serializes all parent-git
 * write operations (D32) to prevent concurrent git index corruption.
 */

import { resolve } from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';

export { withParentLock } from './git-mutex.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHandleOptions {
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

  // simple-git's block-unsafe-operations plugin rejects credential.helper=!<cmd>
  // by default. Opt in when we're intentionally injecting our own helper.
  const unsafe = gitConfig.length > 0 ? { allowUnsafeCredentialHelper: true } : undefined;

  const git = simpleGit({
    baseDir: projectDir,
    config: gitConfig,
    unsafe,
  }).env(env as Record<string, string>);

  return { git, projectDir, credentialArgs };
}
