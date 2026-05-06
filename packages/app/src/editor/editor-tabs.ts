export interface EditorTabSessionState {
  openTabs: string[];
  activeDocName: string | null;
  updatedAt: string | null;
}

const LOCAL_TAB_SESSION_PREFIX = 'ok-editor-tabs-v1:';

function isValidDocName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function normalizeOpenTabs(value: unknown, limit: number): string[] {
  if (!Array.isArray(value) || limit <= 0) return [];
  const tabs: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isValidDocName(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    tabs.push(item);
    if (tabs.length >= limit) break;
  }
  return tabs;
}

export function addOpenTab(tabs: readonly string[], docName: string, limit: number): string[] {
  const normalized = normalizeOpenTabs(tabs, limit);
  if (!isValidDocName(docName) || normalized.includes(docName)) return normalized;
  const next = [...normalized, docName];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function removeOpenTab(tabs: readonly string[], docName: string): string[] {
  return tabs.filter((tab) => tab !== docName);
}

export function remapOpenTabs(
  tabs: readonly string[],
  mappings: readonly { fromDocName: string; toDocName: string }[],
  limit: number,
): string[] {
  if (mappings.length === 0) return normalizeOpenTabs(tabs, limit);
  const bySource = new Map(mappings.map((entry) => [entry.fromDocName, entry.toDocName]));
  const next: string[] = [];
  const seen = new Set<string>();
  for (const tab of tabs) {
    const mapped = bySource.get(tab) ?? tab;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    next.push(mapped);
    if (next.length >= limit) break;
  }
  return next;
}

export function nextActiveDocAfterClose(
  tabs: readonly string[],
  activeDocName: string | null,
  closingDocName: string,
): string | null {
  if (activeDocName !== closingDocName) return activeDocName;
  const index = tabs.indexOf(closingDocName);
  if (index < 0) return tabs[0] ?? null;
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}

export function parseEditorTabSessionState(value: unknown, limit: number): EditorTabSessionState {
  if (typeof value !== 'object' || value === null) {
    return { openTabs: [], activeDocName: null, updatedAt: null };
  }
  const record = value as Record<string, unknown>;
  const openTabs = normalizeOpenTabs(record.openTabs, limit);
  const activeDocName =
    typeof record.activeDocName === 'string' && openTabs.includes(record.activeDocName)
      ? record.activeDocName
      : null;
  return {
    openTabs,
    activeDocName,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
  };
}

export function createEditorTabSessionState(
  openTabs: readonly string[],
  activeDocName: string | null,
  now: () => Date = () => new Date(),
): EditorTabSessionState {
  const normalized = normalizeOpenTabs(openTabs, Number.MAX_SAFE_INTEGER);
  return {
    openTabs: normalized,
    activeDocName: activeDocName && normalized.includes(activeDocName) ? activeDocName : null,
    updatedAt: now().toISOString(),
  };
}

export function localTabSessionStorageKey(projectKey: string): string {
  return `${LOCAL_TAB_SESSION_PREFIX}${projectKey}`;
}

export function readLocalTabSessionState(
  storage: Pick<Storage, 'getItem'> | null,
  key: string,
  limit: number,
): EditorTabSessionState {
  if (!storage) return { openTabs: [], activeDocName: null, updatedAt: null };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { openTabs: [], activeDocName: null, updatedAt: null };
    return parseEditorTabSessionState(JSON.parse(raw), limit);
  } catch (err) {
    console.warn('[editor-tabs] failed to read local tab session:', err);
    return { openTabs: [], activeDocName: null, updatedAt: null };
  }
}

export function writeLocalTabSessionState(
  storage: Pick<Storage, 'setItem'> | null,
  key: string,
  state: EditorTabSessionState,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.warn('[editor-tabs] failed to write local tab session:', err);
  }
}
