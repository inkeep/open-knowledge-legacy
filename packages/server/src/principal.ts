import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Principal } from '@inkeep/open-knowledge-core';
import { OK_DIR } from '@inkeep/open-knowledge-core';
import simpleGit from 'simple-git';
import { sanitizeGitIdentity } from './git-identity-sanitize.ts';

const PRINCIPAL_FILE = 'principal.json';
const GIT_TIMEOUT_MS = 3000;

async function readGitConfig(
  contentDir: string,
): Promise<{ name: string | null; email: string | null }> {
  try {
    const git = simpleGit({ baseDir: contentDir, timeout: { block: GIT_TIMEOUT_MS } });
    const name = (await git.raw('config', '--get', 'user.name')).trim() || null;
    const email = (await git.raw('config', '--get', 'user.email')).trim() || null;
    return { name, email };
  } catch {
    return { name: null, email: null };
  }
}

/**
 * Load (or create) the principal record at `<contentDir>/.ok/principal.json`.
 *
 * First call: synthesizes a stable UUID, reads git config for display fields,
 * persists, and returns. Subsequent calls: keeps id + created_at immutable;
 * refreshes display_name and display_email from git config on each load.
 */
export async function loadPrincipal(contentDir: string): Promise<Principal> {
  const okDir = resolve(contentDir, OK_DIR);
  const principalPath = resolve(okDir, PRINCIPAL_FILE);

  const { name: gitName, email: gitEmail } = await readGitConfig(contentDir);

  if (existsSync(principalPath)) {
    let existing: Partial<Principal>;
    try {
      existing = JSON.parse(readFileSync(principalPath, 'utf-8')) as Partial<Principal>;
    } catch {
      existing = {};
    }

    const id =
      typeof existing.id === 'string' && existing.id.startsWith('principal-')
        ? existing.id
        : `principal-${randomUUID()}`;

    const createdAt =
      typeof existing.created_at === 'string' ? existing.created_at : new Date().toISOString();

    const shortId = id.slice('principal-'.length, 'principal-'.length + 8);
    const displayName = gitName
      ? sanitizeGitIdentity(gitName)
      : typeof existing.display_name === 'string'
        ? existing.display_name
        : 'Local User';
    const displayEmail = gitEmail
      ? sanitizeGitIdentity(gitEmail)
      : typeof existing.display_email === 'string'
        ? existing.display_email
        : `principal-${shortId}@openknowledge.local`;

    const source: Principal['source'] = gitName || gitEmail ? 'git-config' : 'synthesized';

    const updated: Principal = {
      id,
      display_name: displayName,
      display_email: displayEmail,
      source,
      created_at: createdAt,
    };
    writeFileSync(principalPath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  // First run: create
  mkdirSync(okDir, { recursive: true });
  const id = `principal-${randomUUID()}`;
  const shortId = id.slice('principal-'.length, 'principal-'.length + 8);
  const displayName = gitName ? sanitizeGitIdentity(gitName) : 'Local User';
  const displayEmail = gitEmail
    ? sanitizeGitIdentity(gitEmail)
    : `principal-${shortId}@openknowledge.local`;
  const source: Principal['source'] = gitName || gitEmail ? 'git-config' : 'synthesized';

  const principal: Principal = {
    id,
    display_name: displayName,
    display_email: displayEmail,
    source,
    created_at: new Date().toISOString(),
  };
  writeFileSync(principalPath, JSON.stringify(principal, null, 2), 'utf-8');
  return principal;
}
