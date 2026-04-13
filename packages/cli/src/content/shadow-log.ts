/**
 * CLI-side reader for shadow-repo per-path activity history.
 *
 * Reads the bare shadow repo at `.git/openknowledge/` (integrated mode) or
 * `.openknowledge/` (standalone mode) via simple-git — NO HTTP endpoint
 * (D18). The on-disk layout (`refs/wip/<project-branch>/<writer-id>`) is
 * shared with the server writer through `@inkeep/open-knowledge-core`'s
 * `shadow-repo-layout` helpers (D22/FR20), so a CLI reader never hand-rolls
 * the regex or path rules.
 *
 * Spec: SPEC.md FR15 + FR17 + D18.
 */
import { resolve } from 'node:path';
import {
  getShadowRepoPath,
  getWipRefPattern,
  parseWriterId,
  type WriterClassification,
} from '@inkeep/open-knowledge-core';
import simpleGit, { type SimpleGit } from 'simple-git';

export interface ShadowCommit {
  hash: string;
  /** ISO-8601 committer date. */
  date: string;
  /** Full writer id from the ref (e.g., `agent-abc123`). */
  writerId: string;
  /** Author name as recorded in the shadow commit. */
  writerName: string;
  /**
   * Convenience boolean derived from `writerClassification`:
   *   - `true`  when classification === 'agent'
   *   - `false` when classification === 'human'
   *   - `null`  when 'upstream' | 'server' | 'unknown' (indeterminate)
   *
   * Prefer `writerClassification` when reasoning about attribution —
   * `isAgent: null` is ambiguous between "not an agent" and "unknown."
   */
  isAgent: boolean | null;
  /** Unambiguous discriminator; preferred over `isAgent` for reasoning. */
  writerClassification: WriterClassification;
  message: string;
  /** Project branch this commit was recorded against. */
  branch: string;
}

const GIT_TIMEOUT_MS = 5000;

/** The three distinct historySource states per FR15. */
export type HistorySource = 'shadow-repo' | 'shadow-repo-absent';

export interface ReadShadowLogResult {
  commits: ShadowCommit[];
  source: HistorySource;
}

/** Read the project's currently checked-out branch name. Returns null when the project isn't a git repo or is detached. */
async function currentProjectBranch(projectDir: string): Promise<string | null> {
  try {
    const git = simpleGit({ baseDir: projectDir, timeout: { block: GIT_TIMEOUT_MS } });
    const raw = await git.revparse(['--abbrev-ref', 'HEAD']);
    const branch = raw.trim();
    return branch && branch !== 'HEAD' ? branch : null;
  } catch {
    return null;
  }
}

function openShadowGit(shadowDir: string, workTree: string): SimpleGit {
  return simpleGit({ baseDir: workTree, timeout: { block: GIT_TIMEOUT_MS } }).env({
    GIT_DIR: shadowDir,
    GIT_WORK_TREE: workTree,
  });
}

function writerIdFromRef(ref: string, branch: string): string {
  const prefix = getWipRefPattern(branch);
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

async function logOnRef(
  sg: SimpleGit,
  ref: string,
  relPath: string,
  branch: string,
  limit: number,
): Promise<ShadowCommit[]> {
  let out = '';
  try {
    out = await sg.raw(
      'log',
      ref,
      `-${Math.max(1, limit * 2)}`,
      '--format=%H|%aI|%an|%s',
      '--',
      relPath,
    );
  } catch {
    return [];
  }

  const writerId = writerIdFromRef(ref, branch);
  const parsed = parseWriterId(writerId);
  const commits: ShadowCommit[] = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const firstPipe = line.indexOf('|');
    if (firstPipe < 0) continue;
    const secondPipe = line.indexOf('|', firstPipe + 1);
    if (secondPipe < 0) continue;
    const thirdPipe = line.indexOf('|', secondPipe + 1);
    if (thirdPipe < 0) continue;
    commits.push({
      hash: line.slice(0, firstPipe),
      date: line.slice(firstPipe + 1, secondPipe),
      writerName: line.slice(secondPipe + 1, thirdPipe),
      message: line.slice(thirdPipe + 1),
      writerId,
      isAgent: parsed.isAgent,
      writerClassification: parsed.classification,
      branch,
    });
  }
  return commits;
}

/**
 * Read the last N shadow-repo commits touching `relPath`, merged across
 * per-writer refs on the project's current branch, sorted by committer
 * date descending.
 *
 * Returns `{ commits: [], source: 'shadow-repo-absent' }` when the shadow
 * repo doesn't exist (project never initialized with OK) so agents can
 * distinguish "no repo" from "no edits on this path."
 */
export async function readShadowLog(
  projectDir: string,
  relPath: string,
  limit = 5,
): Promise<ReadShadowLogResult> {
  const shadowDir = getShadowRepoPath(projectDir);
  if (!shadowDir) return { commits: [], source: 'shadow-repo-absent' };

  const branch = await currentProjectBranch(projectDir);
  if (!branch) return { commits: [], source: 'shadow-repo' };

  const sg = openShadowGit(shadowDir, resolve(projectDir));

  let refsRaw = '';
  try {
    refsRaw = await sg.raw('for-each-ref', getWipRefPattern(branch), '--format=%(refname)');
  } catch {
    return { commits: [], source: 'shadow-repo' };
  }
  const refs = refsRaw
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  if (refs.length === 0) return { commits: [], source: 'shadow-repo' };

  const perRef = await Promise.all(refs.map((ref) => logOnRef(sg, ref, relPath, branch, limit)));
  const commits = perRef
    .flat()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

  return { commits, source: 'shadow-repo' };
}
