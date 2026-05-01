import { resolve } from 'node:path';
import type { ShadowContributor } from '@inkeep/open-knowledge-core';
import {
  getShadowRepoPath,
  getWipRefPattern,
  parseWriterId,
  readContributors,
  type WriterClassification,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
import simpleGit, { type SimpleGit } from 'simple-git';

export interface ShadowCommit {
  hash: string;
  date: string;
  writerId: string;
  writerName: string;
  isAgent: boolean | null;
  writerClassification: WriterClassification;
  message: string;
  branch: string;
  contributors: ShadowContributor[];
}

const GIT_TIMEOUT_MS = 5000;

export type HistorySource = 'shadow-repo' | 'shadow-repo-absent';

interface ReadShadowLogResult {
  commits: ShadowCommit[];
  source: HistorySource;
}

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
      '--format=%H%x00%aI%x00%an%x00%s%x00%B%x1e',
      '--',
      relPath,
    );
  } catch {
    return [];
  }

  const writerId = writerIdFromRef(ref, branch);
  const parsed = parseWriterId(writerId);
  const commits: ShadowCommit[] = [];
  for (const record of out.split('\x1e')) {
    const trimmed = record.trimStart();
    if (!trimmed) continue;
    const parts = trimmed.split('\x00');
    const [hash = '', date = '', writerName = '', message = '', rawBody = ''] = parts;
    const sha = hash.trim();
    if (sha.length !== 40) continue;
    commits.push({
      hash: sha,
      date,
      writerName,
      message,
      contributors: readContributors(rawBody),
      writerId,
      isAgent: parsed.isAgent,
      writerClassification: parsed.classification,
      branch,
    });
  }
  return commits;
}

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
