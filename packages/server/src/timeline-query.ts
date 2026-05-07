import { existsSync } from 'node:fs';
import type { EntryType, TimelineEntry } from '@inkeep/open-knowledge-core';
import { parseCheckpoint, readContributors } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import { getDocExtension } from './doc-extensions.ts';
import type { ShadowHandle } from './shadow-repo.ts';
import { shadowGit } from './shadow-repo.ts';

interface HistoryQuery {
  docName: string;
  branch?: string;
  type?: string | string[];
  author?: string | string[];
  excludeAuthor?: string | string[];
  limit?: number;
  offset?: number;
}

interface HistoryResult {
  entries: TimelineEntry[];
  total: number;
  hasMore: boolean;
}

const GIT_LOG_FORMAT = '%H%x00%aI%x00%an%x00%ae%x00%s%x00%B%x1e';

const EMPTY: HistoryResult = { entries: [], total: 0, hasMore: false };

function classifyType(subject: string): EntryType {
  if (subject.startsWith('checkpoint:')) return 'checkpoint';
  if (subject.startsWith('import:') || subject.startsWith('upstream:')) return 'upstream';
  if (subject.startsWith('park:')) return 'park';
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
        contributors: readContributors(rawBody),
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

export async function getDocumentHistory(
  shadow: ShadowHandle,
  query: HistoryQuery,
  contentRoot = '.',
): Promise<HistoryResult> {
  if (!existsSync(shadow.workTree) || !existsSync(shadow.gitDir)) {
    return EMPTY;
  }

  if (query.docName && (query.docName.includes('..') || query.docName.includes('\0'))) {
    return EMPTY;
  }

  const branch = query.branch ?? 'main';
  const limit = Math.max(1, query.limit ?? 50);
  const offset = Math.max(0, query.offset ?? 0);

  const typeFilter = toArray(query.type);
  const authorFilter = toArray(query.author);
  const excludeAuthorFilter = toArray(query.excludeAuthor);

  const normalizedRoot = contentRoot === '.' ? '' : contentRoot.replace(/^\.\//, '');
  const docPath = query.docName
    ? normalizedRoot
      ? `${normalizedRoot}/${query.docName}${getDocExtension(query.docName)}`
      : `${query.docName}${getDocExtension(query.docName)}`
    : undefined;

  try {
    const sg = shadowGit(shadow);

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
        } catch {}
      }

      const allShas = [...branchCpShas, ...mainCpShas];
      if (allShas.length === 0) return EMPTY;

      const raw = await sg.raw(
        'log',
        '--no-walk',
        '--author-date-order',
        `--format=${GIT_LOG_FORMAT}`,
        ...allShas,
      );

      let allEntries = parseGitLogOutput(raw).map((e) => ({ ...e, type: 'checkpoint' as const }));

      if (docPath) {
        const relevant = await Promise.all(
          allEntries.map(async (e) => {
            try {
              await sg.raw('cat-file', '-e', `${e.sha}:${docPath}`);
              return true;
            } catch {
              return false;
            }
          }),
        );
        allEntries = allEntries.filter((_, i) => relevant[i]);
      }

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
    } catch {}

    let mainCheckpointShas: string[] = [];
    if (isFeatureBranch) {
      try {
        mainCheckpointShas = (
          await sg.raw('for-each-ref', '--format=%(objectname)', 'refs/checkpoints/main/')
        )
          .trim()
          .split('\n')
          .filter((s) => s.length === 40);
      } catch {}
    }

    try {
      const wipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', `refs/wip/${branch}/`))
        .trim()
        .split('\n')
        .filter(Boolean);
      startRefs.push(...wipRefs);
    } catch {}

    if (isFeatureBranch && startRefs.length === 0) {
      try {
        const mainWipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', 'refs/wip/main/'))
          .trim()
          .split('\n')
          .filter(Boolean);
        startRefs.push(...mainWipRefs);
      } catch {}
    }

    if (startRefs.length === 0 && checkpointShas.length === 0 && mainCheckpointShas.length === 0) {
      return EMPTY;
    }

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
      let allCpEntries = parseGitLogOutput(cpRaw).map((e) => ({
        ...e,
        type: 'checkpoint' as const,
      }));

      if (docPath) {
        const relevant = await Promise.all(
          allCpEntries.map(async (e) => {
            try {
              await sg.raw('cat-file', '-e', `${e.sha}:${docPath}`);
              return true;
            } catch {
              return false;
            }
          }),
        );
        allCpEntries = allCpEntries.filter((_, i) => relevant[i]);
      }

      if (isFeatureBranch && checkpointShas.length > 0 && mainCheckpointShas.length > 0) {
        const branchCpShaSet = new Set(checkpointShas);
        const branchCps = allCpEntries.filter((e) => branchCpShaSet.has(e.sha));
        const mainCps = allCpEntries.filter((e) => !branchCpShaSet.has(e.sha));

        const earliestBranchCp = branchCps.reduce((min, e) => {
          const t = new Date(e.timestamp).getTime();
          return t < min ? t : min;
        }, Number.POSITIVE_INFINITY);

        checkpointEntries = [
          ...branchCps,
          ...mainCps.filter((e) => new Date(e.timestamp).getTime() < earliestBranchCp),
        ];
      } else {
        checkpointEntries = allCpEntries;
      }
    }

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

    const allEntries = [...checkpointEntries, ...wipEntries];

    const seen = new Set<string>();
    const unique: TimelineEntry[] = [];
    for (const e of allEntries) {
      if (!seen.has(e.sha)) {
        seen.add(e.sha);
        unique.push(e);
      }
    }

    unique.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    let filtered = unique;

    filtered = filtered.filter((e) => e.type !== 'park');

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
