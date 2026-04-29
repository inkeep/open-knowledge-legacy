import {
  createWorkspaceSearchCorpus,
  createWorkspaceSearchDocument,
  searchWorkspaceCorpus,
  type WorkspaceSearchCorpus,
  type WorkspaceSearchDocument,
  workspaceSearchBasename,
} from '@inkeep/open-knowledge-core';
import type { PageMeta } from './PageListContext';

export interface WorkspaceEntry {
  kind: 'file' | 'folder';
  path: string;
  name: string;
  title?: string;
  modifiedTs?: number;
}

interface WorkspaceEntrySearchCorpus {
  entries: readonly WorkspaceEntry[];
  byId: ReadonlyMap<string, WorkspaceEntry>;
  corpus: WorkspaceSearchCorpus;
}

export const EMPTY_QUERY_NAV_LIMIT = 20;
const MATCH_QUERY_NAV_LIMIT = 50;

let cachedEntriesFingerprint = '';
let cachedEntrySearchCorpus: WorkspaceEntrySearchCorpus | null = null;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function buildWorkspaceEntries(
  pages: ReadonlySet<string>,
  folderPaths: ReadonlySet<string>,
  pageTitles: ReadonlyMap<string, string> = new Map(),
  pageMeta: ReadonlyMap<string, PageMeta> = new Map(),
): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];

  for (const path of pages) {
    const modified = pageMeta.get(path)?.modified;
    const title = pageTitles.get(path);
    entries.push({
      kind: 'file',
      path,
      name: workspaceSearchBasename(path),
      ...(title ? { title } : {}),
      ...(modified ? { modifiedTs: Date.parse(modified) } : {}),
    });
  }
  for (const path of folderPaths) {
    entries.push({ kind: 'folder', path, name: workspaceSearchBasename(path) });
  }

  entries.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    if (a.kind === b.kind) return 0;
    return a.kind === 'folder' ? -1 : 1;
  });

  return entries;
}

function toSearchDocument(entry: WorkspaceEntry): WorkspaceSearchDocument {
  return createWorkspaceSearchDocument({
    kind: entry.kind === 'file' ? 'page' : 'folder',
    path: entry.path,
    title: entry.title ?? entry.name,
    modifiedTs: entry.modifiedTs ?? 0,
  });
}

function buildWorkspaceEntrySearchCorpus(
  entries: readonly WorkspaceEntry[],
): WorkspaceEntrySearchCorpus {
  const byId = new Map(
    entries.map((entry) => [`${entry.kind === 'file' ? 'page' : 'folder'}:${entry.path}`, entry]),
  );
  return {
    entries,
    byId,
    corpus: createWorkspaceSearchCorpus(entries.map(toSearchDocument)),
  };
}

function workspaceEntriesFingerprint(entries: readonly WorkspaceEntry[]): string {
  return entries
    .map(
      (entry) =>
        `${entry.kind}\u0000${entry.path}\u0000${entry.title ?? ''}\u0000${entry.modifiedTs ?? 0}`,
    )
    .join('\u0001');
}

function getCachedWorkspaceEntrySearchCorpus(
  entries: readonly WorkspaceEntry[],
): WorkspaceEntrySearchCorpus {
  const fingerprint = workspaceEntriesFingerprint(entries);
  if (cachedEntrySearchCorpus && cachedEntriesFingerprint === fingerprint) {
    return cachedEntrySearchCorpus;
  }
  cachedEntriesFingerprint = fingerprint;
  cachedEntrySearchCorpus = buildWorkspaceEntrySearchCorpus(entries);
  return cachedEntrySearchCorpus;
}

export function searchWorkspaceEntries(
  entries: readonly WorkspaceEntry[],
  query: string,
  limit = MATCH_QUERY_NAV_LIMIT,
): WorkspaceEntry[] {
  return searchWorkspaceEntryCorpus(getCachedWorkspaceEntrySearchCorpus(entries), query, limit);
}

function searchWorkspaceEntryCorpus(
  entryCorpus: WorkspaceEntrySearchCorpus,
  query: string,
  limit = MATCH_QUERY_NAV_LIMIT,
): WorkspaceEntry[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return entryCorpus.entries.slice(0, EMPTY_QUERY_NAV_LIMIT);
  }

  return searchWorkspaceCorpus(entryCorpus.corpus, normalizedQuery, {
    intent: 'omnibar',
    limit,
    scopes: ['page', 'folder'],
  })
    .map((result) => entryCorpus.byId.get(result.document.id))
    .filter((entry) => !!entry);
}

export function matchesCommandQuery(
  label: string,
  query: string,
  keywords: readonly string[] = [],
): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  const haystack = normalize([label, ...keywords].join(' '));
  return haystack.includes(normalizedQuery);
}
