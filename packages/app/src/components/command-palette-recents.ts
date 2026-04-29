export interface OmnibarRecentEntry {
  kind: 'file' | 'folder';
  path: string;
  lastOpenedAt: string;
}

const OMNIBAR_RECENTS_STORAGE_KEY = 'ok-omnibar-recents-v1';
const OMNIBAR_RECENTS_LIMIT = 10;

function isRecentEntry(value: unknown): value is OmnibarRecentEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    ((value as { kind?: unknown }).kind === 'file' ||
      (value as { kind?: unknown }).kind === 'folder') &&
    typeof (value as { path?: unknown }).path === 'string' &&
    typeof (value as { lastOpenedAt?: unknown }).lastOpenedAt === 'string'
  );
}

function getStorage(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function makeOmnibarRecentKey(kind: 'file' | 'folder', path: string): string {
  return `${kind}:${path}`;
}

export function loadOmnibarRecents(
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): OmnibarRecentEntry[] {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) return [];

  try {
    const raw = resolvedStorage.getItem(OMNIBAR_RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEntry).slice(0, OMNIBAR_RECENTS_LIMIT);
  } catch {
    return [];
  }
}

export function saveOmnibarRecents(
  entries: readonly OmnibarRecentEntry[],
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): void {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) return;

  try {
    resolvedStorage.setItem(
      OMNIBAR_RECENTS_STORAGE_KEY,
      JSON.stringify(entries.slice(0, OMNIBAR_RECENTS_LIMIT)),
    );
  } catch {}
}

export function rememberOmnibarRecent(
  entries: readonly OmnibarRecentEntry[],
  next: OmnibarRecentEntry,
): OmnibarRecentEntry[] {
  const deduped = entries.filter((entry) => entry.kind !== next.kind || entry.path !== next.path);
  return [next, ...deduped].slice(0, OMNIBAR_RECENTS_LIMIT);
}

export function filterOmnibarRecents(
  entries: readonly OmnibarRecentEntry[],
  validKeys: ReadonlySet<string>,
): OmnibarRecentEntry[] {
  return entries.filter((entry) => validKeys.has(makeOmnibarRecentKey(entry.kind, entry.path)));
}
