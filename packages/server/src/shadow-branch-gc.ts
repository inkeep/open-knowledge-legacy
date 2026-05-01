import { parseWriterId } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import simpleGit from 'simple-git';
import type { CheckpointRetentionPolicy, ShadowHandle } from './shadow-repo.ts';
import { DEFAULT_CHECKPOINT_RETENTION, gcCheckpointRefs, shadowGit } from './shadow-repo.ts';

const GC_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

const SESSION_WRITER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface GcResult {
  deletedBranches: string[];
  renamedBranches: { from: string; to: string }[];
  retainedBranches: string[];
  checkpointGc: Record<
    string,
    {
      scanned: number;
      deletedBridgeMergeLoss: number;
      deletedExternalChangeRescue: number;
      retained: number;
    }
  >;
  deletedStaleSessionRefs: number;
}

function extractBranchNames(refs: string[]): Set<string> {
  const branches = new Set<string>();
  for (const ref of refs) {
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

async function getProjectBranchSha(projectGitDir: string, branch: string): Promise<string | null> {
  try {
    const git = simpleGit().env({ GIT_DIR: projectGitDir });
    return (await git.raw('rev-parse', `refs/heads/${branch}`)).trim();
  } catch {
    return null;
  }
}

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
  } catch {}
  return branches;
}

export async function gcShadowBranches(
  shadow: ShadowHandle,
  projectGitDir: string,
  checkpointRetention: CheckpointRetentionPolicy = DEFAULT_CHECKPOINT_RETENTION,
): Promise<GcResult> {
  const result: GcResult = {
    deletedBranches: [],
    renamedBranches: [],
    retainedBranches: [],
    checkpointGc: {},
    deletedStaleSessionRefs: 0,
  };

  const sg = shadowGit(shadow);

  let wipRefsRaw: string;
  try {
    wipRefsRaw = (await sg.raw('for-each-ref', 'refs/wip/', '--format=%(refname)')).trim();
  } catch {
    return result; // No refs at all
  }
  if (!wipRefsRaw) return result;

  const wipRefs = wipRefsRaw.split('\n').filter(Boolean);
  const shadowBranches = extractBranchNames(wipRefs);

  const projectBranches = await listProjectBranches(projectGitDir);

  const orphaned: string[] = [];
  for (const branch of shadowBranches) {
    if (branch.startsWith('detached-')) continue; // Handled separately
    if (!projectBranches.has(branch)) {
      orphaned.push(branch);
    } else {
      result.retainedBranches.push(branch);
    }
  }

  if (orphaned.length === 0) {
  } else {
    const newProjectBranches = new Set<string>();
    for (const pb of projectBranches) {
      if (!shadowBranches.has(pb)) {
        newProjectBranches.add(pb);
      }
    }

    for (const orphanedBranch of orphaned) {
      let renamed = false;

      if (newProjectBranches.size > 0) {
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
              const branchRefs = wipRefs.filter((r) => r.startsWith(`refs/wip/${orphanedBranch}/`));
              for (const oldRef of branchRefs) {
                const writerId = oldRef.slice(`refs/wip/${orphanedBranch}/`.length);
                const newRef = `refs/wip/${newBranch}/${writerId}`;
                try {
                  const sha = (await sg.raw('rev-parse', oldRef)).trim();
                  await sg.raw('update-ref', newRef, sha);
                  await sg.raw('update-ref', '-d', oldRef);
                } catch (e) {
                  console.error(`[shadow-gc] failed to migrate ${oldRef} → ${newRef}:`, e);
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
        const branchRefs = wipRefs.filter((r) => r.startsWith(`refs/wip/${orphanedBranch}/`));
        for (const ref of branchRefs) {
          try {
            const commitDate = (await sg.raw('log', '-1', '--format=%ci', ref)).trim();
            const commitTime = new Date(commitDate).getTime();
            const age = Date.now() - commitTime;

            if (age < GC_GRACE_PERIOD_MS) {
              result.retainedBranches.push(orphanedBranch);
              break; // Skip this entire branch
            }

            await sg.raw('update-ref', '-d', ref);
          } catch {}
        }
        if (!result.retainedBranches.includes(orphanedBranch)) {
          result.deletedBranches.push(orphanedBranch);
        }
      }
    }
  }

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
      console.warn(`[shadow-gc] checkpoint GC failed for branch ${branch}:`, err);
    }
  }

  for (const branch of projectBranches) {
    const branchPrefix = `refs/wip/${branch}/`;
    const branchRefs = wipRefs.filter((r) => r.startsWith(branchPrefix));
    for (const ref of branchRefs) {
      const writerId = ref.slice(branchPrefix.length);
      const { classification } = parseWriterId(writerId);

      if (
        classification === 'classified-file-system' ||
        classification === 'classified-git-upstream' ||
        classification === 'classified-openknowledge-service'
      ) {
        continue;
      }

      if (classification === 'unknown') {
        console.warn(`[shadow-gc] unknown writer id in active branch ref ${ref} — preserved`);
        continue;
      }

      if (classification === 'agent' || classification === 'principal') {
        try {
          const commitDate = (await sg.raw('log', '-1', '--format=%ci', ref)).trim();
          if (!commitDate) continue;
          const age = Date.now() - new Date(commitDate).getTime();
          if (age >= SESSION_WRITER_TTL_MS) {
            await sg.raw('update-ref', '-d', ref);
            result.deletedStaleSessionRefs++;
          }
        } catch {}
      }
    }
  }

  return result;
}
