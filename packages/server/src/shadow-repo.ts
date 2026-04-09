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

// ─── Save Version ────────────────────────────────────────────────────────────

export interface SaveVersionResult {
  projectCommitSha: string;
  checkpointRef: string;
}

/**
 * Save Version — the graduation point:
 * 1. Create a real commit on the project repo (via commit-tree plumbing, never touches staging area)
 * 2. Write a checkpoint ref in the shadow with full tree snapshot
 * 3. Reset per-writer WIP refs so subsequent WIP tracks only post-checkpoint deltas
 */
export async function saveVersion(
  shadow: ShadowHandle,
  projectRoot: string,
  contentRoot: string,
  writers: WriterIdentity[],
): Promise<SaveVersionResult> {
  const projectGit = simpleGit(projectRoot);
  const sg = shadowGit(shadow);
  const tmpIndex = resolve(projectRoot, '.git/index-save-version');

  try {
    // ── Step 1: Create project repo commit ──

    // Seed from current HEAD
    try {
      const headTree = (await projectGit.raw('rev-parse', 'HEAD^{tree}')).trim();
      await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('read-tree', headTree);
    } catch {
      // Empty repo
    }

    // Stage current content
    await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('add', contentRoot);
    const treeSha = (await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('write-tree')).trim();

    // Find parent
    let parentSha: string | null = null;
    try {
      parentSha = (await projectGit.raw('rev-parse', 'HEAD')).trim();
    } catch {
      // First commit
    }

    // Build commit message with co-authored-by trailers
    const primaryWriter = writers[0] ?? {
      name: 'openknowledge',
      email: 'noreply@openknowledge.local',
    };
    const coAuthors = writers
      .slice(1)
      .map((w) => `Co-authored-by: ${w.name} <${w.email}>`)
      .join('\n');

    const message = coAuthors
      ? `Save Version: content update\n\n${coAuthors}`
      : 'Save Version: content update';

    const commitArgs = ['commit-tree', treeSha, '-m', message];
    if (parentSha) commitArgs.push('-p', parentSha);

    const projectCommitSha = (
      await projectGit
        .env({
          GIT_INDEX_FILE: tmpIndex,
          GIT_AUTHOR_NAME: primaryWriter.name,
          GIT_AUTHOR_EMAIL: primaryWriter.email,
          GIT_COMMITTER_NAME: primaryWriter.name,
          GIT_COMMITTER_EMAIL: primaryWriter.email,
        })
        .raw(...commitArgs)
    ).trim();

    // Advance HEAD
    await projectGit.raw('update-ref', 'HEAD', projectCommitSha);

    // ── Step 2: Checkpoint ref in shadow with full tree snapshot ──

    const shadowTmpIndex = resolve(shadow.gitDir, 'index-checkpoint');
    try {
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_WORK_TREE: shadow.workTree,
          GIT_INDEX_FILE: shadowTmpIndex,
        })
        .raw('add', contentRoot);
      const shadowTreeSha = (
        await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: shadowTmpIndex }).raw('write-tree')
      ).trim();

      // Find latest shadow WIP to parent on
      let shadowParent: string | null = null;
      for (const w of writers) {
        try {
          shadowParent = (await sg.raw('rev-parse', `refs/wip/${w.id}`)).trim();
          break;
        } catch {
          // try next writer
        }
      }

      const checkpointArgs = [
        'commit-tree',
        shadowTreeSha,
        '-m',
        `checkpoint: Save Version → project commit ${projectCommitSha.slice(0, 8)}`,
      ];
      if (shadowParent) checkpointArgs.push('-p', shadowParent);

      const checkpointSha = (
        await sg
          .env({
            GIT_DIR: shadow.gitDir,
            GIT_AUTHOR_NAME: 'openknowledge',
            GIT_AUTHOR_EMAIL: 'noreply@openknowledge.local',
            GIT_COMMITTER_NAME: 'openknowledge',
            GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
          })
          .raw(...checkpointArgs)
      ).trim();

      const checkpointRef = `refs/checkpoints/${projectCommitSha}`;
      await sg.raw('update-ref', checkpointRef, checkpointSha);

      // ── Step 3: Reset WIP refs ──
      // Delete per-writer WIP refs so subsequent WIP tracks only post-checkpoint deltas
      for (const w of writers) {
        try {
          await sg.raw('update-ref', '-d', `refs/wip/${w.id}`);
        } catch {
          // ref may not exist
        }
      }
      // Also reset upstream WIP
      try {
        await sg.raw('update-ref', '-d', 'refs/wip/upstream');
      } catch {
        // may not exist
      }

      return { projectCommitSha, checkpointRef };
    } finally {
      try {
        rmSync(shadowTmpIndex);
      } catch {
        // ignore
      }
    }
  } finally {
    try {
      rmSync(tmpIndex);
    } catch {
      // ignore
    }
  }
}
