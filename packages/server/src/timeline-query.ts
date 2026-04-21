/**
 * Timeline query — walk the shadow repo DAG and return a merged, paginated
 * list of timeline entries for a given document.
 *
 * Entry types are classified from commit message prefixes:
 *   'checkpoint:' → checkpoint
 *   'upstream:'   → upstream
 *   else          → wip
 */

import { existsSync } from 'node:fs';
import type { EntryType, TimelineEntry } from '@inkeep/open-knowledge-core';
import {
  parseCheckpoint,
  parseContributors,
} from '@inkeep/open-knowledge-core/history-repo-layout';
import { getDocExtension } from './doc-extensions.ts';
import type { HistoryHandle } from './history-repo.ts';
import { historyGit } from './history-repo.ts';

interface HistoryQuery {
  docName: string;
  branch?: string;
  /** Filter to specific entry types (comma-separated or array). */
  type?: string | string[];
  /** Only include entries from these authors (by name or email). */
  author?: string | string[];
  /** Exclude entries from these authors (by name or email). */
  excludeAuthor?: string | string[];
  limit?: number;
  offset?: number;
}

interface HistoryResult {
  entries: TimelineEntry[];
  total: number;
  hasMore: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * NUL-delimited format for `git log --format`.
 * Fields: sha, authorDate, authorName, authorEmail, subject, rawBody (full message via %B).
 * Records are terminated with ASCII Record Separator \x1e to handle multi-line commit bodies.
 */
const GIT_LOG_FORMAT = '%H%x00%aI%x00%an%x00%ae%x00%s%x00%B%x1e';

const EMPTY: HistoryResult = { entries: [], total: 0, hasMore: false };

function classifyType(subject: string): EntryType {
  if (subject.startsWith('checkpoint:')) return 'checkpoint';
  if (subject.startsWith('upstream:')) return 'upstream';
  return 'wip';
}

function parseGitLogOutput(raw: string): TimelineEntry[] {
  if (!raw.trim()) return [];
  return raw
    .split('\x1e')
    .map((record) => {
      const trimmed = record.trimStart();
      if (!trimmed) return null;
      const parts = trimmed.split('\x00');
      const [sha = '', timestamp = '', author = '', authorEmail = '', message = '', rawBody = ''] =
        parts;
      const type = classifyType(message);
      return {
        sha: sha.trim(),
        timestamp,
        author,
        authorEmail,
        type,
        message,
        contributors: parseContributors(rawBody),
        checkpoint: type === 'checkpoint' ? parseCheckpoint(rawBody) : null,
      };
    })
    .filter((e): e is TimelineEntry => e !== null && e.sha.length === 40);
}

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val)
    ? val
    : val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function matchesAuthor(entry: TimelineEntry, authors: string[]): boolean {
  if (authors.length === 0) return true;
  return authors.some(
    (a) =>
      entry.author.toLowerCase().includes(a.toLowerCase()) ||
      entry.authorEmail.toLowerCase().includes(a.toLowerCase()),
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Query the shadow repo DAG and return a merged, paginated timeline.
 *
 * Reads are intentionally NOT protected by the shadow-root writer lock —
 * concurrent reads with writes are safe on git object storage.
 *
 * Returns an empty result (never throws) when shadow repo is missing or corrupt.
 */
export async function getDocumentHistory(
  shadow: HistoryHandle,
  query: HistoryQuery,
  contentRoot = 'content',
): Promise<HistoryResult> {
  // Graceful degradation: if the shadow workTree doesn't exist, return empty
  if (!existsSync(shadow.workTree) || !existsSync(shadow.gitDir)) {
    return EMPTY;
  }

  const branch = query.branch ?? 'main';
  const limit = Math.max(1, query.limit ?? 50);
  const offset = Math.max(0, query.offset ?? 0);

  const typeFilter = toArray(query.type);
  const authorFilter = toArray(query.author);
  const excludeAuthorFilter = toArray(query.excludeAuthor);

  // Build file pathspec so git log only returns commits touching this document.
  // Normalize contentRoot: strip leading './' — git rejects relative path syntax
  // ("./foo") when operating against a bare repo (cat-file, log --).
  const normalizedRoot = contentRoot.replace(/^\.\//, '');
  const docPath = query.docName
    ? normalizedRoot
      ? `${normalizedRoot}/${query.docName}${getDocExtension(query.docName)}`
      : `${query.docName}${getDocExtension(query.docName)}`
    : undefined;

  try {
    const sg = historyGit(shadow);

    // ── Fast path: checkpoint-only query ───────────────────────────────────
    // Uses for-each-ref to list checkpoint SHAs, then resolves commit details
    // via git log --no-walk (avoids walking ancestry — reads only specified commits).
    if (typeFilter.length === 1 && typeFilter[0] === 'checkpoint') {
      const branchCpShas = (
        await sg.raw(
          'for-each-ref',
          '--sort=-creatordate',
          '--format=%(objectname)',
          `refs/checkpoints/${branch}/`,
        )
      )
        .trim()
        .split('\n')
        .filter((s) => s.length === 40);

      // On feature branches, fall back to main's checkpoints
      let mainCpShas: string[] = [];
      if (branch !== 'main') {
        try {
          mainCpShas = (
            await sg.raw(
              'for-each-ref',
              '--sort=-creatordate',
              '--format=%(objectname)',
              'refs/checkpoints/main/',
            )
          )
            .trim()
            .split('\n')
            .filter((s) => s.length === 40);
        } catch {
          // no main checkpoints
        }
      }

      const allShas = [...branchCpShas, ...mainCpShas];
      if (allShas.length === 0) return EMPTY;

      // Bulk-resolve commit details without walking ancestry
      const raw = await sg.raw(
        'log',
        '--no-walk',
        '--author-date-order',
        `--format=${GIT_LOG_FORMAT}`,
        ...allShas,
        ...(docPath ? ['--', docPath] : []),
      );

      let allEntries = parseGitLogOutput(raw).map((e) => ({ ...e, type: 'checkpoint' as const }));

      // Apply branch-takes-over-main cutoff
      if (branch !== 'main' && branchCpShas.length > 0 && mainCpShas.length > 0) {
        const branchSet = new Set(branchCpShas);
        const branchCps = allEntries.filter((e) => branchSet.has(e.sha));
        const mainCps = allEntries.filter((e) => !branchSet.has(e.sha));
        const earliestBranchCp = branchCps.reduce(
          (min, e) => Math.min(min, new Date(e.timestamp).getTime()),
          Number.POSITIVE_INFINITY,
        );
        allEntries = [
          ...branchCps,
          ...mainCps.filter((e) => new Date(e.timestamp).getTime() < earliestBranchCp),
        ];
      }

      const filtered = allEntries.filter(
        (e) =>
          matchesAuthor(e, authorFilter) &&
          (excludeAuthorFilter.length === 0 || !matchesAuthor(e, excludeAuthorFilter)),
      );

      const total = filtered.length;
      const page = filtered.slice(offset, offset + limit);
      return { entries: page, total, hasMore: offset + limit < total };
    }

    // ── Full DAG walk ───────────────────────────────────────────────────────

    // Collect refs separately: checkpoints are queried via --no-walk (always
    // included as user-triggered landmarks), WIP/upstream walk the full DAG.
    const checkpointShas: string[] = [];
    const startRefs: string[] = [];
    const isFeatureBranch = branch !== 'main';

    try {
      const cpRefs = (
        await sg.raw('for-each-ref', '--format=%(objectname)', `refs/checkpoints/${branch}/`)
      )
        .trim()
        .split('\n')
        .filter((s) => s.length === 40);
      checkpointShas.push(...cpRefs);
    } catch {
      // no checkpoints
    }

    // On feature branches, also collect main's checkpoints as fallback history.
    // Main's checkpoints older than the branch's first checkpoint are shown;
    // main's checkpoints newer than that are hidden (branch has its own timeline).
    let mainCheckpointShas: string[] = [];
    if (isFeatureBranch) {
      try {
        mainCheckpointShas = (
          await sg.raw('for-each-ref', '--format=%(objectname)', 'refs/checkpoints/main/')
        )
          .trim()
          .split('\n')
          .filter((s) => s.length === 40);
      } catch {
        // no main checkpoints
      }
    }

    try {
      const wipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', `refs/wip/${branch}/`))
        .trim()
        .split('\n')
        .filter(Boolean);
      startRefs.push(...wipRefs);
    } catch {
      // no WIP refs
    }

    // On feature branches with no branch-specific refs, also walk main's WIP
    // so pre-divergence auto-saves are visible.
    if (isFeatureBranch && startRefs.length === 0) {
      try {
        const mainWipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', 'refs/wip/main/'))
          .trim()
          .split('\n')
          .filter(Boolean);
        startRefs.push(...mainWipRefs);
      } catch {
        // no main WIP refs
      }
    }

    if (startRefs.length === 0 && checkpointShas.length === 0 && mainCheckpointShas.length === 0) {
      return EMPTY;
    }

    // 1) Resolve checkpoint entries.
    //    Branch checkpoints are always included. Main checkpoints are included
    //    only up to the branch's first checkpoint (branch takes over its own history).
    const allCpShas = [...checkpointShas, ...mainCheckpointShas];
    let checkpointEntries: TimelineEntry[] = [];
    if (allCpShas.length > 0) {
      const cpRaw = await sg.raw(
        'log',
        '--no-walk',
        '--author-date-order',
        `--format=${GIT_LOG_FORMAT}`,
        ...allCpShas,
      );
      const allCpEntries = parseGitLogOutput(cpRaw).map((e) => ({
        ...e,
        type: 'checkpoint' as const,
      }));

      if (isFeatureBranch && checkpointShas.length > 0 && mainCheckpointShas.length > 0) {
        // Find the earliest branch checkpoint timestamp — main's checkpoints
        // older than this are pre-divergence history (show them).
        // Main's checkpoints at or newer than this are post-divergence (hide them).
        const branchCpShaSet = new Set(checkpointShas);
        const branchCps = allCpEntries.filter((e) => branchCpShaSet.has(e.sha));
        const mainCps = allCpEntries.filter((e) => !branchCpShaSet.has(e.sha));

        const earliestBranchCp = branchCps.reduce((min, e) => {
          const t = new Date(e.timestamp).getTime();
          return t < min ? t : min;
        }, Number.POSITIVE_INFINITY);

        // Keep all branch checkpoints + main checkpoints older than the branch's first
        checkpointEntries = [
          ...branchCps,
          ...mainCps.filter((e) => new Date(e.timestamp).getTime() < earliestBranchCp),
        ];
      } else {
        // No branch checkpoints exist, or we're on main — show all
        checkpointEntries = allCpEntries;
      }
    }

    // 2) WIP + upstream: walk ancestry from all refs (including checkpoints
    //    so their WIP ancestry is reachable).
    const allStartRefs = [...startRefs];
    for (const sha of allCpShas) allStartRefs.push(sha);

    let wipEntries: TimelineEntry[] = [];
    if (allStartRefs.length > 0) {
      const raw = await sg.raw(
        'log',
        '--full-history',
        '--author-date-order',
        `--format=${GIT_LOG_FORMAT}`,
        ...allStartRefs,
        ...(docPath ? ['--', docPath] : []),
      );
      wipEntries = parseGitLogOutput(raw);
    }

    // Merge checkpoint + WIP entries
    const allEntries = [...checkpointEntries, ...wipEntries];

    // Deduplicate by SHA (multiple refs may reach same commits)
    const seen = new Set<string>();
    const unique: TimelineEntry[] = [];
    for (const e of allEntries) {
      if (!seen.has(e.sha)) {
        seen.add(e.sha);
        unique.push(e);
      }
    }

    // Sort by timestamp descending (newest first). Git log outputs are pre-sorted
    // within each ref walk, but merging checkpoint + WIP results may interleave.
    unique.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply filters
    let filtered = unique;

    if (typeFilter.length > 0) {
      filtered = filtered.filter((e) => typeFilter.includes(e.type));
    }

    if (authorFilter.length > 0) {
      filtered = filtered.filter((e) => matchesAuthor(e, authorFilter));
    }

    if (excludeAuthorFilter.length > 0) {
      filtered = filtered.filter((e) => !matchesAuthor(e, excludeAuthorFilter));
    }

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);
    return { entries: page, total, hasMore: offset + limit < total };
  } catch (e) {
    console.warn('[timeline] getDocumentHistory failed, returning empty result:', e);
    return EMPTY;
  }
}
