/**
 * Git identity resolution chain (US-017 / FR20a).
 *
 * Resolves git user.name + user.email for auto-save commits via:
 *   1. Repo-local git config (.git/config)
 *   2. Global git config (~/.gitconfig)
 *   3. Stored token entry (login + name/email from OAuth profile)
 *   4. null — caller must prompt
 *
 * Uses spawnSync('git', ['config', …]) instead of simple-git so this module
 * has no runtime dependency on simple-git (avoids broken symlink in test env).
 */

import { spawnSync } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitIdentity {
  name: string;
  email: string;
}

/**
 * Minimal token-store interface (structurally compatible with CLI's TokenStore).
 * Only the `get` side is needed for identity resolution.
 */
export interface GitIdentityTokenStore {
  get(host: string): Promise<{ login: string; name?: string; email?: string } | null>;
}

/**
 * Injectable git-config reader (real or mock in tests).
 *
 * @param projectDir  Absolute path to the git root.
 * @param key         Git config key (e.g. 'user.name').
 * @param scope       'local' reads .git/config; 'global' reads ~/.gitconfig.
 * @returns The trimmed value, or null if not set / not found.
 */
export type GitConfigReader = (
  projectDir: string,
  key: string,
  scope: 'local' | 'global',
) => string | null;

// ─── Default reader (production) ─────────────────────────────────────────────

/**
 * Production config reader — spawns `git config --local|--global <key>`.
 * Returns null on any error (non-zero exit, missing key, spawn failure).
 */
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve git identity for auto-save commits.
 *
 * Chain (stops at first complete name+email pair):
 *   1. repo-local git config
 *   2. global git config
 *   3. TokenStore entry (login as name fallback; entry.name preferred)
 *   4. null (caller must prompt)
 *
 * @param projectDir  Absolute path to the git root.
 * @param tokenStore  Optional credential store for fallback identity.
 * @param host        Hostname to look up in tokenStore (e.g. 'github.com').
 * @param _reader     Injectable config reader (for unit tests).
 */
export async function resolveGitIdentity(
  projectDir: string,
  tokenStore?: GitIdentityTokenStore | null,
  host?: string | null,
  _reader: GitConfigReader = defaultGitConfigReader,
): Promise<GitIdentity | null> {
  // ── Step 1: repo-local config ──────────────────────────────────────────────
  const localName = _reader(projectDir, 'user.name', 'local');
  const localEmail = _reader(projectDir, 'user.email', 'local');
  if (localName && localEmail) {
    return { name: localName, email: localEmail };
  }

  // ── Step 2: global config ──────────────────────────────────────────────────
  const globalName = _reader(projectDir, 'user.name', 'global');
  const globalEmail = _reader(projectDir, 'user.email', 'global');
  if (globalName && globalEmail) {
    return { name: globalName, email: globalEmail };
  }

  // ── Step 3: stored token entry ─────────────────────────────────────────────
  if (tokenStore && host) {
    const entry = await tokenStore.get(host);
    if (entry) {
      const name = entry.name ?? entry.login;
      // email may not be available from the OAuth profile (private email setting)
      const email = entry.email ?? `${entry.login}@users.noreply.github.com`;
      if (name) {
        return { name, email };
      }
    }
  }

  // ── Step 4: unresolved ────────────────────────────────────────────────────
  return null;
}

/**
 * Write git identity to the repo-local .git/config.
 *
 * Equivalent to:
 *   git config --local user.name "<name>"
 *   git config --local user.email "<email>"
 *
 * @param projectDir  Absolute path to the git root.
 * @param name        Display name to write.
 * @param email       Email address to write.
 */
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
