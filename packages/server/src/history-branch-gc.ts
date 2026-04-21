/**
 * Shadow branch garbage collection.
 *
 * Cleans up orphaned history branch refs when their corresponding project
 * branches are deleted. Also handles branch rename detection.
 *
 * - WIP refs (refs/wip/<branch>/*) are deleted after 24h grace period
 * - Checkpoint refs (refs/checkpoints/<branch>/*) have kind-aware GC:
 *   - `Save Version` (no `ok-checkpoint-v1:` body line): retained
 *     indefinitely — these are the user-intentional permanent-history
 *     artifacts the original "retained" contract was written for.
 *   - `bridge-merge-loss` (observer Path B auto-rescue, written silently
 *     on post-condition violation): keep the most-recent N per branch
 *     + TTL (bridge-correctness review iteration 5).
 *   - `external-change-rescue` (reconcile-delete / branch-switch auto-
 *     rescue): same policy.
 *   See `gcCheckpointRefs` in `history-repo.ts` for the retention numbers
 *   and SPEC §6 R7 for the motivation.
 * - Branch rename: if old branch disappears and new branch has same HEAD SHA, migrate refs
 */

import { parseWriterId } from '@inkeep/open-knowledge-core/history-repo-layout';
import simpleGit from 'simple-git';
import type { CheckpointRetentionPolicy, HistoryHandle } from './history-repo.ts';
import { DEFAULT_CHECKPOINT_RETENTION, gcCheckpointRefs, historyGit } from './history-repo.ts';

/** Grace period before orphaned WIP refs are deleted (24 hours). */
const GC_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

interface GcResult {
  deletedBranches: string[];
  renamedBranches: { from: string; to: string }[];
  retainedBranches: string[];
  /**
   * Per-branch tally of checkpoint refs GC'd under the kind-aware retention
   * policy (bridge-correctness review iteration 5). Entries with zero deletions
   * are omitted. Keys are branch names; values are the raw `CheckpointGcResult`.
   */
  checkpointGc: Record<
    string,
    {
      scanned: number;
      deletedBridgeMergeLoss: number;
      deletedExternalChangeRescue: number;
      retained: number;
    }
  >;
}

/**
 * Extract unique branch names from history WIP refs.
 *
 * Refs are shaped: refs/wip/<branch>/<writer-id>
 * Branch names can contain slashes (e.g., feature/xyz).
 * Writer IDs are the last segment after the last slash that matches known patterns.
 */
function extractBranchNames(refs: string[]): Set<string> {
  const branches = new Set<string>();
  for (const ref of refs) {
    // Strip refs/wip/ prefix, then split into branch + writerId at the last slash.
    // The writer-id portion is classified via the core helper (D22/FR20) — any
    // non-matching id is ignored (legacy refs from before this spec).
    const withoutPrefix = ref.replace(/^refs\/wip\//, '');
    const lastSlash = withoutPrefix.lastIndexOf('/');
    if (lastSlash <= 0) continue;
    const branch = withoutPrefix.slice(0, lastSlash);
    const writerId = withoutPrefix.slice(lastSlash + 1);
    if (parseWriterId(writerId).classification !== 'unknown') {
      branches.add(branch);
    }
  }
  return branches;
}

/**
 * Get HEAD SHA for a project branch.
 */
async function getProjectBranchSha(projectGitDir: string, branch: string): Promise<string | null> {
  try {
    const git = simpleGit().env({ GIT_DIR: projectGitDir });
    return (await git.raw('rev-parse', `refs/heads/${branch}`)).trim();
  } catch {
    return null;
  }
}

/**
 * List all project branch names.
 */
async function listProjectBranches(projectGitDir: string): Promise<Set<string>> {
  const branches = new Set<string>();
  try {
    const git = simpleGit().env({ GIT_DIR: projectGitDir });
    const output = (
      await git.raw('for-each-ref', 'refs/heads/', '--format=%(refname:short)')
    ).trim();
    if (output) {
      for (const line of output.split('\n')) {
        if (line) branches.add(line);
      }
    }
  } catch {
    // No branches or not a git repo
  }
  return branches;
}

/**
 * Run garbage collection on history branch refs.
 *
 * Compares history WIP branch prefixes against project repo branches.
 * Orphaned branches (no corresponding project branch) have their WIP refs
 * deleted. Checkpoint refs are always retained.
 *
 * Branch rename detection: if an orphaned history branch has the same HEAD SHA
 * as a new project branch (not in shadow), treat it as a rename and migrate refs.
 */
export async function gcHistoryBranches(
  shadow: HistoryHandle,
  projectGitDir: string,
  checkpointRetention: CheckpointRetentionPolicy = DEFAULT_CHECKPOINT_RETENTION,
): Promise<GcResult> {
  const result: GcResult = {
    deletedBranches: [],
    renamedBranches: [],
    retainedBranches: [],
    checkpointGc: {},
  };

  const sg = historyGit(shadow);

  // List all history WIP refs
  let wipRefsRaw: string;
  try {
    wipRefsRaw = (await sg.raw('for-each-ref', 'refs/wip/', '--format=%(refname)')).trim();
  } catch {
    return result; // No refs at all
  }
  if (!wipRefsRaw) return result;

  const wipRefs = wipRefsRaw.split('\n').filter(Boolean);
  const shadowBranches = extractBranchNames(wipRefs);

  // Get project branches
  const projectBranches = await listProjectBranches(projectGitDir);

  // Find orphaned history branches (not in project, not detached-*)
  const orphaned: string[] = [];
  for (const branch of shadowBranches) {
    if (branch.startsWith('detached-')) continue; // Handled separately
    if (!projectBranches.has(branch)) {
      orphaned.push(branch);
    } else {
      result.retainedBranches.push(branch);
    }
  }

  if (orphaned.length === 0) return result;

  // Check for renames: orphaned branch with same SHA as a new project branch
  const newProjectBranches = new Set<string>();
  for (const pb of projectBranches) {
    if (!shadowBranches.has(pb)) {
      newProjectBranches.add(pb);
    }
  }

  for (const orphanedBranch of orphaned) {
    // Try to detect rename by matching commit SHA
    let renamed = false;

    if (newProjectBranches.size > 0) {
      // Get latest SHA from the orphaned branch's WIP refs
      let orphanedSha: string | null = null;
      for (const ref of wipRefs) {
        if (ref.startsWith(`refs/wip/${orphanedBranch}/`)) {
          try {
            orphanedSha = (await sg.raw('rev-parse', ref)).trim();
            break;
          } catch {}
        }
      }

      if (orphanedSha) {
        for (const newBranch of newProjectBranches) {
          const newSha = await getProjectBranchSha(projectGitDir, newBranch);
          if (newSha === orphanedSha) {
            // Rename detected — migrate refs
            const branchRefs = wipRefs.filter((r) => r.startsWith(`refs/wip/${orphanedBranch}/`));
            for (const oldRef of branchRefs) {
              const writerId = oldRef.slice(`refs/wip/${orphanedBranch}/`.length);
              const newRef = `refs/wip/${newBranch}/${writerId}`;
              try {
                const sha = (await sg.raw('rev-parse', oldRef)).trim();
                await sg.raw('update-ref', newRef, sha);
                await sg.raw('update-ref', '-d', oldRef);
              } catch (e) {
                console.error(`[history-gc] failed to migrate ${oldRef} → ${newRef}:`, e);
              }
            }
            result.renamedBranches.push({ from: orphanedBranch, to: newBranch });
            newProjectBranches.delete(newBranch);
            renamed = true;
            break;
          }
        }
      }
    }

    if (!renamed) {
      // Delete orphaned WIP refs (no grace period check in this implementation —
      // the spec says 24h but we check commit timestamps in a future iteration)
      const branchRefs = wipRefs.filter((r) => r.startsWith(`refs/wip/${orphanedBranch}/`));
      for (const ref of branchRefs) {
        try {
          // Check commit timestamp for grace period
          const commitDate = (await sg.raw('log', '-1', '--format=%ci', ref)).trim();
          const commitTime = new Date(commitDate).getTime();
          const age = Date.now() - commitTime;

          if (age < GC_GRACE_PERIOD_MS) {
            result.retainedBranches.push(orphanedBranch);
            break; // Skip this entire branch
          }

          await sg.raw('update-ref', '-d', ref);
        } catch {
          // Ref may already be deleted
        }
      }
      if (!result.retainedBranches.includes(orphanedBranch)) {
        result.deletedBranches.push(orphanedBranch);
      }
    }
  }

  // Kind-aware checkpoint GC on every live project branch + every retained
  // history branch (covers detached HEADs that accrued bridge-merge-loss
  // checkpoints during their lifetime). `Save Version` untyped checkpoints
  // are never eligible — see `gcCheckpointRefs` JSDoc.
  const gcBranches = new Set<string>([...projectBranches, ...result.retainedBranches]);
  for (const branch of gcBranches) {
    try {
      const ckResult = await gcCheckpointRefs(shadow, branch, checkpointRetention);
      if (
        ckResult.scanned > 0 ||
        ckResult.deletedBridgeMergeLoss > 0 ||
        ckResult.deletedExternalChangeRescue > 0
      ) {
        result.checkpointGc[branch] = {
          scanned: ckResult.scanned,
          deletedBridgeMergeLoss: ckResult.deletedBridgeMergeLoss,
          deletedExternalChangeRescue: ckResult.deletedExternalChangeRescue,
          retained: ckResult.retained,
        };
      }
    } catch (err) {
      console.warn(`[history-gc] checkpoint GC failed for branch ${branch}:`, err);
    }
  }

  return result;
}
