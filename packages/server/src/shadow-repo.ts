/**
 * Shadow repo — attribution journal at .git/openknowledge/
 *
 * A bare repo (core.bare unset, core.worktree → project root) that stores
 * per-writer WIP refs and upstream-import commits. Isolated from the project
 * repo so user staging area and history are never touched.
 *
 * Layout:
 *   Integrated mode: .git/openknowledge/   (inside project .git — no .gitignore needed)
 *   Standalone mode: .openknowledge/       (added to .gitignore)
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShadowHandle {
  gitDir: string;
  workTree: string;
}

export interface WriterIdentity {
  id: string;
  name: string;
  email: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a simple-git instance pointed at the shadow bare repo. */
export function shadowGit(shadow: ShadowHandle) {
  return simpleGit(shadow.workTree).env({
    GIT_DIR: shadow.gitDir,
    GIT_WORK_TREE: shadow.workTree,
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Initialize the shadow bare repo.
 *
 * - Integrated mode (.git/ exists): creates .git/openknowledge/
 * - Standalone mode (no .git/):     creates .openknowledge/ and adds to .gitignore
 */
export async function initShadowRepo(projectRoot: string): Promise<ShadowHandle> {
  const projectGitDir = resolve(projectRoot, '.git');
  const hasProjectRepo = (() => {
    try {
      return statSync(projectGitDir).isDirectory();
    } catch {
      return false;
    }
  })();

  const shadowDir = hasProjectRepo
    ? resolve(projectGitDir, 'openknowledge')
    : resolve(projectRoot, '.openknowledge');

  // Skip init if already valid
  const alreadyInit = existsSync(resolve(shadowDir, 'HEAD'));
  if (!alreadyInit) {
    mkdirSync(shadowDir, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.raw('init', '--bare', shadowDir);

    const sg = simpleGit().env({ GIT_DIR: shadowDir });
    await sg.raw('config', '--unset', 'core.bare');
    await sg.raw('config', 'core.worktree', projectRoot);
    await sg.raw('config', 'user.name', 'openknowledge');
    await sg.raw('config', 'user.email', 'noreply@openknowledge.local');
  }

  // Standalone mode: ensure .openknowledge/ is in .gitignore
  if (!hasProjectRepo) {
    const gitignorePath = resolve(projectRoot, '.gitignore');
    const entry = '.openknowledge/';
    let content = '';
    try {
      content = readFileSync(gitignorePath, 'utf-8');
    } catch {
      // no .gitignore yet
    }
    if (!content.split('\n').some((line) => line.trim() === entry)) {
      const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
      writeFileSync(gitignorePath, `${content}${suffix}${entry}\n`, 'utf-8');
    }
  }

  return { gitDir: shadowDir, workTree: projectRoot };
}

// ─── WIP commits ─────────────────────────────────────────────────────────────

/**
 * Commit content changes to a per-writer WIP ref in the shadow.
 *
 * Uses commit-tree plumbing with GIT_INDEX_FILE isolation so we never
 * touch any user-visible staging area.
 */
export async function commitWip(
  shadow: ShadowHandle,
  writer: WriterIdentity,
  contentRoot: string,
  message: string,
): Promise<string> {
  const tmpIndex = resolve(shadow.gitDir, `index-wip-${writer.id}`);
  const ref = `refs/wip/${writer.id}`;
  const sg = shadowGit(shadow);

  try {
    // Seed index from current ref state (if exists)
    try {
      const refTree = (await sg.raw('rev-parse', `${ref}^{tree}`)).trim();
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('read-tree', refTree);
    } catch {
      // First commit on this ref — start fresh
    }

    // Stage content files
    await sg
      .env({
        GIT_DIR: shadow.gitDir,
        GIT_WORK_TREE: shadow.workTree,
        GIT_INDEX_FILE: tmpIndex,
      })
      .raw('add', contentRoot);
    const treeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('write-tree')
    ).trim();

    // Find parent
    let parentSha: string | null = null;
    try {
      parentSha = (await sg.raw('rev-parse', ref)).trim();
    } catch {
      // No parent — first commit
    }

    // Create commit with writer identity
    const args = ['commit-tree', treeSha, '-m', message];
    if (parentSha) args.push('-p', parentSha);

    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: writer.name,
          GIT_AUTHOR_EMAIL: writer.email,
          GIT_COMMITTER_NAME: 'openknowledge',
          GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
        })
        .raw(...args)
    ).trim();

    await sg.raw('update-ref', ref, commitSha);
    return commitSha;
  } finally {
    try {
      rmSync(tmpIndex);
    } catch {
      // ignore cleanup failure
    }
  }
}

// ─── Upstream import ─────────────────────────────────────────────────────────

const UPSTREAM_WRITER: WriterIdentity = {
  id: 'upstream',
  name: 'upstream',
  email: 'noreply@openknowledge.local',
};

/**
 * Record an upstream-import commit in the shadow.
 *
 * Called when HEAD moves (e.g., git pull) to attribute the incoming changes
 * to "upstream" in the attribution journal.
 */
export async function commitUpstreamImport(
  shadow: ShadowHandle,
  contentRoot: string,
  oldHead: string | null,
  newHead: string,
): Promise<string> {
  const message = oldHead
    ? `upstream: import from ${oldHead.slice(0, 8)}..${newHead.slice(0, 8)}`
    : `upstream: initial import at ${newHead.slice(0, 8)}`;

  return commitWip(shadow, UPSTREAM_WRITER, contentRoot, message);
}
