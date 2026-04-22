export interface WorkspaceEntry {
  kind: 'file' | 'folder';
  path: string;
  name: string;
}

export const EMPTY_QUERY_NAV_LIMIT = 20;
export const MATCH_QUERY_NAV_LIMIT = 50;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function basename(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function buildWorkspaceEntries(
  pages: ReadonlySet<string>,
  folderPaths: ReadonlySet<string>,
): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];

  for (const path of pages) {
    entries.push({ kind: 'file', path, name: basename(path) });
  }
  for (const path of folderPaths) {
    entries.push({ kind: 'folder', path, name: basename(path) });
  }

  entries.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    if (a.kind === b.kind) return 0;
    return a.kind === 'folder' ? -1 : 1;
  });

  return entries;
}

function scoreEntry(entry: WorkspaceEntry, query: string): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  const normalizedName = normalize(entry.name);
  const normalizedPath = normalize(entry.path);
  const pathSegments = normalizedPath.split('/');

  if (normalizedName === normalizedQuery) return 600;
  if (normalizedPath === normalizedQuery) return 550;
  if (normalizedName.startsWith(normalizedQuery)) return 500;
  if (pathSegments.some((segment) => segment.startsWith(normalizedQuery))) return 450;
  if (normalizedName.includes(normalizedQuery)) return 400;
  if (normalizedPath.includes(normalizedQuery)) return 350;
  return -1;
}

export function searchWorkspaceEntries(
  entries: readonly WorkspaceEntry[],
  query: string,
  limit = MATCH_QUERY_NAV_LIMIT,
): WorkspaceEntry[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...entries].slice(0, EMPTY_QUERY_NAV_LIMIT);
  }

  return [...entries]
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter((match) => match.score >= 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.entry.path.localeCompare(b.entry.path);
    })
    .slice(0, limit)
    .map((match) => match.entry);
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
