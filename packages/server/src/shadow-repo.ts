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

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveShadowDir } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import simpleGit from 'simple-git';
import { acquireLock, releaseLock } from './shadow-lock.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShadowHandle {
  gitDir: string;
  workTree: string;
}

/** Mutable ref to a ShadowHandle — allows deferred initialization after construction. */
export interface ShadowRef {
  current: ShadowHandle | undefined;
}

export interface WriterIdentity {
  id: string;
  name: string;
  email: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GIT_TIMEOUT_MS = 30_000;

/** Create a simple-git instance pointed at the shadow bare repo. */
export function shadowGit(shadow: ShadowHandle) {
  return simpleGit({
    baseDir: shadow.workTree,
    timeout: { block: GIT_TIMEOUT_MS },
  }).env({
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
  // Path + mode resolution lives in @inkeep/open-knowledge-core so the CLI
  // read path and this server write path use exactly the same rule (D22/FR20).
  const { path: shadowDir, mode } = resolveShadowDir(projectRoot);

  // Skip init if already valid
  const alreadyInit = existsSync(resolve(shadowDir, 'HEAD'));
  if (!alreadyInit) {
    mkdirSync(shadowDir, { recursive: true });

    const git = simpleGit({ baseDir: projectRoot, timeout: { block: GIT_TIMEOUT_MS } });
    await git.raw('init', '--bare', shadowDir);

    const sg = simpleGit({ timeout: { block: GIT_TIMEOUT_MS } }).env({ GIT_DIR: shadowDir });
    await sg.raw('config', '--unset', 'core.bare');
    await sg.raw('config', 'core.worktree', projectRoot);
    await sg.raw('config', 'user.name', 'openknowledge');
    await sg.raw('config', 'user.email', 'noreply@openknowledge.local');
  }

  // Standalone mode: ensure .openknowledge/ is in .gitignore
  if (mode === 'standalone') {
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

  // Acquire exclusive writer lock
  acquireLock(shadowDir, projectRoot);

  return { gitDir: shadowDir, workTree: projectRoot };
}

/**
 * Release the exclusive writer lock on a shadow repo.
 * Called during graceful shutdown.
 */
export function destroyShadowRepo(shadow: ShadowHandle): void {
  releaseLock(shadow.gitDir);
}

// ─── WIP commits ─────────────────────────────────────────────────────────────

/**
 * Commit content changes to a per-writer, per-branch WIP ref in the shadow.
 *
 * Uses commit-tree plumbing with GIT_INDEX_FILE isolation so we never
 * touch any user-visible staging area.
 *
 * @param branch - Project branch name (e.g. 'main', 'feature/xyz'). When omitted, defaults to 'main'.
 */
export async function commitWip(
  shadow: ShadowHandle,
  writer: WriterIdentity,
  contentRoot: string,
  message: string,
  branch = 'main',
): Promise<string> {
  const tmpIndex = resolve(shadow.gitDir, `index-wip-${writer.id}`);
  const ref = `refs/wip/${branch}/${writer.id}`;
  const sg = shadowGit(shadow);

  try {
    // Seed index from current ref state (if exists)
    try {
      const refTree = (await sg.raw('rev-parse', `${ref}^{tree}`)).trim();
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('read-tree', refTree);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('unknown revision') || msg.includes('bad revision')) {
        // Expected: first commit on this ref — start fresh
      } else {
        console.error(`[shadow-repo] Unexpected error seeding index for ${ref}:`, e);
        throw e;
      }
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('unknown revision') && !msg.includes('bad revision')) {
        console.error(`[shadow-repo] Unexpected error resolving ${ref}:`, e);
        throw e;
      }
      // Expected: no parent — first commit on this ref
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
 *
 * @param branch - Project branch name for ref scoping. Defaults to 'main'.
 */
export async function commitUpstreamImport(
  shadow: ShadowHandle,
  contentRoot: string,
  oldHead: string | null,
  newHead: string,
  branch = 'main',
): Promise<string> {
  const message = oldHead
    ? `upstream: import from ${oldHead.slice(0, 8)}..${newHead.slice(0, 8)}`
    : `upstream: initial import at ${newHead.slice(0, 8)}`;

  return commitWip(shadow, UPSTREAM_WRITER, contentRoot, message, branch);
}

// ─── Park / Load / Restore ──────────────────────────────────────────────────

/** A document's serialized state for parking. */
export interface ParkableDoc {
  docName: string;
  /** Current Y.Doc serialized to markdown (from memory). */
  markdown: string;
  /** Last known disk content (reconciledBase) — used as merge base for restore. */
  diskSnapshot: string;
}

/**
 * Park the current branch context by committing Y.Doc in-memory state
 * to the shadow repo. Each document's state and its disk snapshot are
 * stored so that `restoreBranchWIP` can three-way merge later.
 *
 * Park commits use message prefix "park:" for identification.
 */
export async function parkBranch(
  shadow: ShadowHandle,
  branch: string,
  sessionId: string,
  documents: ParkableDoc[],
): Promise<string | null> {
  if (documents.length === 0) return null;

  const sg = shadowGit(shadow);
  const tmpIndex = resolve(shadow.gitDir, `index-park-${branch.replace(/\//g, '-')}`);
  const ref = `refs/wip/${branch}/human-${sessionId}`;

  const tmpBlobFile = resolve(shadow.gitDir, 'tmp-park-blob');
  try {
    // Build a tree with both Y.Doc state and disk snapshots
    for (const doc of documents) {
      // Store Y.Doc state at the doc's path
      writeFileSync(tmpBlobFile, doc.markdown, 'utf-8');
      const blobSha = (
        await sg
          .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
          .raw('hash-object', '-w', tmpBlobFile)
      ).trim();
      await sg
        .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
        .raw('update-index', '--add', '--cacheinfo', `100644,${blobSha},${doc.docName}`);

      // Store disk snapshot at .park-base/<docName>
      writeFileSync(tmpBlobFile, doc.diskSnapshot, 'utf-8');
      const baseSha = (
        await sg
          .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
          .raw('hash-object', '-w', tmpBlobFile)
      ).trim();
      await sg
        .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
        .raw('update-index', '--add', '--cacheinfo', `100644,${baseSha},.park-base/${doc.docName}`);
    }

    const treeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('write-tree')
    ).trim();

    // Find parent
    let parentSha: string | null = null;
    try {
      parentSha = (await sg.raw('rev-parse', ref)).trim();
    } catch {
      // No prior WIP on this branch for this session
    }

    const args = [
      'commit-tree',
      treeSha,
      '-m',
      `park: branch context at ${new Date().toISOString()}`,
    ];
    if (parentSha) args.push('-p', parentSha);

    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: 'openknowledge',
          GIT_AUTHOR_EMAIL: 'noreply@openknowledge.local',
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
    try {
      rmSync(tmpBlobFile);
    } catch {
      // ignore cleanup failure
    }
  }
}

/**
 * Read parked Y.Doc state and disk snapshot from a park commit.
 * Returns null if the ref doesn't exist or the latest commit isn't a park.
 */
export async function readParkedState(
  shadow: ShadowHandle,
  branch: string,
  sessionId: string,
  docName: string,
): Promise<{ markdown: string; diskSnapshot: string } | null> {
  const sg = shadowGit(shadow);
  const ref = `refs/wip/${branch}/human-${sessionId}`;

  // Check if ref exists — expected to be missing on first visit to a branch
  let refSha: string;
  try {
    refSha = (await sg.raw('rev-parse', ref)).trim();
  } catch {
    return null; // ref doesn't exist — no parked state
  }

  // Ref exists — read park commit data. Errors here are unexpected and should propagate.
  try {
    const msg = (await sg.raw('log', '-1', '--format=%s', refSha)).trim();
    if (!msg.startsWith('park:')) return null;

    const markdown = (await sg.raw('show', `${refSha}:${docName}`)).trim();
    const diskSnapshot = (await sg.raw('show', `${refSha}:.park-base/${docName}`)).trim();
    return { markdown, diskSnapshot };
  } catch (e) {
    console.error(`[shadow] Failed to read parked state for ${docName} from ${ref}:`, e);
    throw e;
  }
}

// ─── Save Version ────────────────────────────────────────────────────────────

export interface SaveVersionResult {
  /** SHA of the project repo commit created by Save Version, or null in standalone mode. */
  projectCommitSha: string | null;
  checkpointRef: string;
}

/**
 * Save Version — the graduation point:
 * 1. (Integrated mode only) Create a real commit on the project repo via commit-tree plumbing
 * 2. Write a checkpoint ref in the shadow with full tree snapshot
 * 3. Reset per-writer WIP refs so subsequent WIP tracks only post-checkpoint deltas
 *
 * Standalone mode: when projectRoot is null, step 1 is skipped and the checkpoint ref
 * is named after the shadow commit's own SHA instead of the project commit SHA.
 *
 * @param projectRoot - Project root path (integrated mode) or null (standalone mode).
 * @param branch - Project branch name for ref scoping. Defaults to 'main'.
 */
export async function saveVersion(
  shadow: ShadowHandle,
  projectRoot: string | null,
  contentRoot: string,
  writers: WriterIdentity[],
  branch = 'main',
): Promise<SaveVersionResult> {
  const sg = shadowGit(shadow);

  // ── Step 1: Create project repo commit (integrated mode only) ──
  let projectCommitSha: string | null = null;

  if (projectRoot) {
    const projectGit = simpleGit({ baseDir: projectRoot, timeout: { block: GIT_TIMEOUT_MS } });
    const tmpIndex = resolve(projectRoot, '.git/index-save-version');

    try {
      // Seed from current HEAD
      try {
        const headTree = (await projectGit.raw('rev-parse', 'HEAD^{tree}')).trim();
        await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('read-tree', headTree);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('unknown revision') || msg.includes('bad revision')) {
          // Expected: empty repo — start with empty index
        } else {
          console.error('[shadow-repo] Unexpected error reading HEAD tree:', e);
          throw e;
        }
      }

      // Stage current content
      await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('add', contentRoot);
      const treeSha = (await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('write-tree')).trim();

      // Find parent
      let parentSha: string | null = null;
      try {
        parentSha = (await projectGit.raw('rev-parse', 'HEAD')).trim();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('unknown revision') && !msg.includes('bad revision')) {
          console.error('[shadow-repo] Unexpected error resolving HEAD:', e);
          throw e;
        }
        // Expected: first commit
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

      projectCommitSha = (
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

      // Advance HEAD atomically — fail if HEAD was concurrently modified
      if (parentSha) {
        await projectGit.raw('update-ref', 'HEAD', projectCommitSha, parentSha);
      } else {
        await projectGit.raw('update-ref', 'HEAD', projectCommitSha);
      }
    } finally {
      try {
        rmSync(tmpIndex);
      } catch {
        // ignore
      }
    }
  }

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

    // Collect ALL writer WIP refs + upstream ref as checkpoint parents
    // (preserves all per-writer chains across the checkpoint boundary)
    const shadowParentShas: string[] = [];
    for (const w of [...writers, { id: 'upstream' }]) {
      try {
        const sha = (await sg.raw('rev-parse', `refs/wip/${branch}/${w.id}`)).trim();
        shadowParentShas.push(sha);
      } catch {
        // ref doesn't exist for this writer — skip
      }
    }
    // Deduplicate (upstream may alias a writer ref in edge cases)
    const uniqueParents = [...new Set(shadowParentShas)];

    // Fallback: no WIP activity since last checkpoint — parent on the latest checkpoint
    if (uniqueParents.length === 0) {
      try {
        const refs = (
          await sg.raw(
            'for-each-ref',
            '--sort=-creatordate',
            '--format=%(objectname)',
            `refs/checkpoints/${branch}/`,
          )
        )
          .trim()
          .split('\n')
          .filter(Boolean);
        if (refs[0]) uniqueParents.push(refs[0]);
      } catch {
        // no prior checkpoints — this is the first one, parentless is fine
      }
    }

    const checkpointLabel = projectCommitSha
      ? `checkpoint: Save Version → project commit ${projectCommitSha.slice(0, 8)}`
      : 'checkpoint: Save Version (standalone)';

    const checkpointArgs = ['commit-tree', shadowTreeSha, '-m', checkpointLabel];
    for (const p of uniqueParents) {
      checkpointArgs.push('-p', p);
    }

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

    // Integrated: ref named after project commit SHA
    // Standalone: ref named after the shadow commit's own SHA
    const checkpointRef = projectCommitSha
      ? `refs/checkpoints/${branch}/${projectCommitSha}`
      : `refs/checkpoints/${branch}/${checkpointSha}`;

    await sg.raw('update-ref', checkpointRef, checkpointSha);

    // ── Step 3: Reset WIP refs (branch-scoped) ──
    // Delete per-writer WIP refs so subsequent WIP tracks only post-checkpoint deltas
    for (const w of writers) {
      try {
        await sg.raw('update-ref', '-d', `refs/wip/${branch}/${w.id}`);
      } catch {
        // ref may not exist
      }
    }
    // Also reset upstream WIP for this branch
    try {
      await sg.raw('update-ref', '-d', `refs/wip/${branch}/upstream`);
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
}
