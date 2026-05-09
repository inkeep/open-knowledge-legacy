interface EditorTabSessionState {
  openTabs: string[];
  activeDocName: string | null;
  activeTabId: string | null;
  updatedAt: string | null;
}

interface RenamedFolderMapping {
  fromPath: string;
  toPath: string;
}

interface KnownTabTargets {
  pages: ReadonlySet<string>;
  folderPaths: ReadonlySet<string>;
  keepMissingDocName?: string | null;
}

const LOCAL_TAB_SESSION_PREFIX = 'ok-editor-tabs-v1:';
const FOLDER_TAB_PREFIX = '\u0000folder:';

function isValidTabId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.startsWith(FOLDER_TAB_PREFIX)) return value.length > FOLDER_TAB_PREFIX.length;
  return true;
}

export function docTabId(docName: string): string {
  return docName;
}

export function folderTabId(folderPath: string): string {
  return `${FOLDER_TAB_PREFIX}${folderPath}`;
}

export function tabIdForNavigationTarget(
  target:
    | { kind: 'doc'; docName: string }
    | { kind: 'folder-index'; docName: string }
    | { kind: 'folder'; folderPath: string }
    | { kind: 'asset' }
    | { kind: 'missing'; target: string },
): string | null {
  switch (target.kind) {
    case 'doc':
    case 'folder-index':
      return docTabId(target.docName);
    case 'folder':
      return folderTabId(target.folderPath);
    case 'missing':
      return docTabId(target.target);
    case 'asset':
      return null;
  }
}

export function parseEditorTabId(
  tabId: string,
): { kind: 'doc'; docName: string } | { kind: 'folder'; folderPath: string } {
  if (tabId.startsWith(FOLDER_TAB_PREFIX)) {
    return { kind: 'folder', folderPath: tabId.slice(FOLDER_TAB_PREFIX.length) };
  }
  return { kind: 'doc', docName: tabId };
}

export function docNameForTabId(tabId: string): string | null {
  const tab = parseEditorTabId(tabId);
  return tab.kind === 'doc' ? tab.docName : null;
}

export function normalizeOpenTabs(value: unknown, limit: number): string[] {
  if (!Array.isArray(value) || limit <= 0) return [];
  const tabs: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isValidTabId(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    tabs.push(item);
    if (tabs.length >= limit) break;
  }
  return tabs;
}

export function addOpenTab(tabs: readonly string[], tabId: string, limit: number): string[] {
  const normalized = normalizeOpenTabs(tabs, limit);
  if (!isValidTabId(tabId) || normalized.includes(tabId)) return normalized;
  const next = [...normalized, tabId];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function removeOpenTab(tabs: readonly string[], tabId: string): string[] {
  return tabs.filter((tab) => tab !== tabId);
}

export function filterOpenTabsForKnownTargets(
  tabs: readonly string[],
  { pages, folderPaths, keepMissingDocName = null }: KnownTabTargets,
): string[] {
  return normalizeOpenTabs(tabs, Number.MAX_SAFE_INTEGER).filter((tabId) => {
    const tab = parseEditorTabId(tabId);
    if (tab.kind === 'folder') return folderPaths.has(tab.folderPath);
    return pages.has(tab.docName) || tab.docName === keepMissingDocName;
  });
}

export function remapOpenTabs(
  tabs: readonly string[],
  mappings: readonly { fromDocName: string; toDocName: string }[],
  limit: number,
  folderMappings: readonly RenamedFolderMapping[] = [],
): string[] {
  if (mappings.length === 0 && folderMappings.length === 0) return normalizeOpenTabs(tabs, limit);
  const bySource = new Map(mappings.map((entry) => [entry.fromDocName, entry.toDocName]));
  const next: string[] = [];
  const seen = new Set<string>();
  for (const tab of tabs) {
    const parsed = parseEditorTabId(tab);
    const mapped =
      parsed.kind === 'doc'
        ? (bySource.get(parsed.docName) ?? tab)
        : folderTabId(remapPathForFolderRenames(parsed.folderPath, folderMappings));
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    next.push(mapped);
    if (next.length >= limit) break;
  }
  return next;
}

export function remapPathForFolderRenames(
  path: string,
  folderMappings: readonly RenamedFolderMapping[],
): string {
  for (const { fromPath, toPath } of folderMappings) {
    if (path === fromPath) return toPath;
    if (path.startsWith(`${fromPath}/`)) return `${toPath}${path.slice(fromPath.length)}`;
  }
  return path;
}

export function nextActiveTabAfterClose(
  tabs: readonly string[],
  activeTabId: string | null,
  closingTabId: string,
): string | null {
  if (activeTabId !== closingTabId) return activeTabId;
  const index = tabs.indexOf(closingTabId);
  if (index < 0) return tabs[0] ?? null;
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}

export function nextActiveTabAfterCloseMany(
  tabs: readonly string[],
  activeTabId: string | null,
  closingTabIds: Iterable<string>,
): string | null {
  if (!activeTabId) return null;
  const closing = new Set(closingTabIds);
  if (!closing.has(activeTabId)) return activeTabId;

  const index = tabs.indexOf(activeTabId);
  if (index < 0) return tabs.find((tab) => !closing.has(tab)) ?? null;
  for (let i = index + 1; i < tabs.length; i++) {
    if (!closing.has(tabs[i])) return tabs[i];
  }
  for (let i = index - 1; i >= 0; i--) {
    if (!closing.has(tabs[i])) return tabs[i];
  }
  return null;
}

export function parseEditorTabSessionState(value: unknown, limit: number): EditorTabSessionState {
  if (typeof value !== 'object' || value === null) {
    return { openTabs: [], activeDocName: null, activeTabId: null, updatedAt: null };
  }
  const record = value as Record<string, unknown>;
  const openTabs = normalizeOpenTabs(record.openTabs, limit);
  const activeTabId =
    typeof record.activeTabId === 'string' && openTabs.includes(record.activeTabId)
      ? record.activeTabId
      : typeof record.activeDocName === 'string' && openTabs.includes(record.activeDocName)
        ? record.activeDocName
        : null;
  const activeTab = activeTabId ? parseEditorTabId(activeTabId) : null;
  return {
    openTabs,
    activeDocName: activeTab?.kind === 'doc' ? activeTab.docName : null,
    activeTabId,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
  };
}

export function createEditorTabSessionState(
  openTabs: readonly string[],
  activeTabId: string | null,
  now: () => Date = () => new Date(),
): EditorTabSessionState {
  const normalized = normalizeOpenTabs(openTabs, Number.MAX_SAFE_INTEGER);
  const normalizedActiveTabId =
    activeTabId && normalized.includes(activeTabId) ? activeTabId : null;
  const activeTab = normalizedActiveTabId ? parseEditorTabId(normalizedActiveTabId) : null;
  return {
    openTabs: normalized,
    activeDocName: activeTab?.kind === 'doc' ? activeTab.docName : null,
    activeTabId: normalizedActiveTabId,
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
  if (!storage) return { openTabs: [], activeDocName: null, activeTabId: null, updatedAt: null };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { openTabs: [], activeDocName: null, activeTabId: null, updatedAt: null };
    return parseEditorTabSessionState(JSON.parse(raw), limit);
  } catch (err) {
    console.warn('[editor-tabs] failed to read local tab session:', err);
    return { openTabs: [], activeDocName: null, activeTabId: null, updatedAt: null };
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
