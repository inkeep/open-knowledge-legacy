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
import type { ShadowHandle } from './shadow-repo.ts';
import { shadowGit } from './shadow-repo.ts';

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

/** NUL-delimited format for `git log --format`. */
const GIT_LOG_FORMAT = '%H%x00%aI%x00%an%x00%ae%x00%s';

const EMPTY: HistoryResult = { entries: [], total: 0, hasMore: false };

function classifyType(subject: string): EntryType {
  if (subject.startsWith('checkpoint:')) return 'checkpoint';
  if (subject.startsWith('upstream:')) return 'upstream';
  return 'wip';
}

function parseGitLogOutput(raw: string): TimelineEntry[] {
  if (!raw.trim()) return [];
  return raw
    .trim()
    .split('\n')
    .map((line) => {
      const parts = line.split('\x00');
      const [sha = '', timestamp = '', author = '', authorEmail = '', ...msgParts] = parts;
      const message = msgParts.join('\x00');
      return { sha, timestamp, author, authorEmail, type: classifyType(message), message };
    })
    .filter((e) => e.sha.length === 40);
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
  shadow: ShadowHandle,
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
      ? `${normalizedRoot}/${query.docName}.md`
      : `${query.docName}.md`
    : undefined;

  try {
    const sg = shadowGit(shadow);

    // ── Fast path: checkpoint-only query ───────────────────────────────────
    // Uses for-each-ref to list checkpoint SHAs, then resolves commit details
    // via git log --no-walk (avoids walking ancestry — reads only specified commits).
    if (typeFilter.length === 1 && typeFilter[0] === 'checkpoint') {
      const refShas = (
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

      if (refShas.length === 0) return EMPTY;

      // Bulk-resolve commit details without walking ancestry
      const raw = await sg.raw(
        'log',
        '--no-walk',
        '--author-date-order',
        `--format=${GIT_LOG_FORMAT}`,
        ...refShas,
        ...(docPath ? ['--', docPath] : []),
      );

      const allEntries = parseGitLogOutput(raw).map((e) => ({ ...e, type: 'checkpoint' as const }));

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

    try {
      const wipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', `refs/wip/${branch}/`))
        .trim()
        .split('\n')
        .filter(Boolean);
      startRefs.push(...wipRefs);
    } catch {
      // no WIP refs
    }

    if (startRefs.length === 0 && checkpointShas.length === 0) return EMPTY;

    // 1) Checkpoints: always included regardless of file changes.
    //    Use --no-walk to resolve commit details without ancestry traversal.
    let checkpointEntries: TimelineEntry[] = [];
    if (checkpointShas.length > 0) {
      const cpRaw = await sg.raw(
        'log',
        '--no-walk',
        '--author-date-order',
        `--format=${GIT_LOG_FORMAT}`,
        ...checkpointShas,
      );
      checkpointEntries = parseGitLogOutput(cpRaw).map((e) => ({
        ...e,
        type: 'checkpoint' as const,
      }));
    }

    // 2) WIP + upstream: walk ancestry from all refs (including checkpoints
    //    so their WIP ancestry is reachable).
    const allStartRefs = [...startRefs];
    for (const sha of checkpointShas) allStartRefs.push(sha);

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
