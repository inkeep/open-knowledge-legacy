import { spawnSync } from 'node:child_process';

interface GitIdentity {
  name: string;
  email: string;
}

export interface GitIdentityTokenStore {
  get(host: string): Promise<{ login: string; name?: string; email?: string } | null>;
}

export type GitConfigReader = (
  projectDir: string,
  key: string,
  scope: 'local' | 'global',
) => string | null;

const defaultGitConfigReader: GitConfigReader = (projectDir, key, scope) => {
  const scopeFlag = scope === 'local' ? '--local' : '--global';
  const result = spawnSync('git', ['config', scopeFlag, key], {
    cwd: projectDir,
    encoding: 'utf-8',
    timeout: 5_000,
  });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.trim() || null;
};

export async function resolveGitIdentity(
  projectDir: string,
  tokenStore?: GitIdentityTokenStore | null,
  host?: string | null,
  _reader: GitConfigReader = defaultGitConfigReader,
): Promise<GitIdentity | null> {
  const localName = _reader(projectDir, 'user.name', 'local');
  const localEmail = _reader(projectDir, 'user.email', 'local');
  if (localName && localEmail) {
    return { name: localName, email: localEmail };
  }

  const globalName = _reader(projectDir, 'user.name', 'global');
  const globalEmail = _reader(projectDir, 'user.email', 'global');
  if (globalName && globalEmail) {
    return { name: globalName, email: globalEmail };
  }

  if (tokenStore && host) {
    const entry = await tokenStore.get(host);
    if (entry) {
      const name = entry.name ?? entry.login;
      const email = entry.email ?? `${entry.login}@users.noreply.github.com`;
      if (name) {
        return { name, email };
      }
    }
  }

  return null;
}

export function writeGitIdentity(projectDir: string, name: string, email: string): void {
  const setConfig = (key: string, value: string) => {
    const result = spawnSync('git', ['config', '--local', key, value], {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 5_000,
    });
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() ?? '';
      throw new Error(`git config --local ${key} failed: ${stderr}`);
    }
  };
  setConfig('user.name', name);
  setConfig('user.email', email);
}
