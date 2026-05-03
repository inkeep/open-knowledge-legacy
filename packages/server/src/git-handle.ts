import { resolve } from 'node:path';
import simpleGit, { type SimpleGit, type SimpleGitOptions } from 'simple-git';

export { withParentLock } from './git-mutex.ts';

interface GitHandleOptions {
  credentialArgs?: string[];
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

export function createGitInstance(projectDir: string, options: GitHandleOptions = {}): GitHandle {
  const { credentialArgs = [], gitIndexFile } = options;

  const env: Record<string, string | undefined> = {};
  if (gitIndexFile) {
    env.GIT_INDEX_FILE = resolve(projectDir, gitIndexFile);
  }

  const gitConfig = credentialArgs.length >= 2 ? [credentialArgs[1]] : [];

  const gitOptions: Partial<CredentialHelperUnsafeGitOptions> = {
    baseDir: projectDir,
    config: gitConfig,
    unsafe: { allowUnsafeCredentialHelper: true },
  };

  const git = simpleGit(gitOptions as Partial<SimpleGitOptions>).env(env as Record<string, string>);

  return { git, projectDir, credentialArgs };
}
