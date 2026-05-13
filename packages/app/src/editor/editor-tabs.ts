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
  assetPaths: ReadonlySet<string>;
  keepMissingDocName?: string | null;
}

const LOCAL_TAB_SESSION_PREFIX = 'ok-editor-tabs-v1:';
const FOLDER_TAB_PREFIX = '\u0000folder:';
const ASSET_TAB_PREFIX = '\u0000asset:';
const TAB_INSTANCE_SEPARATOR = '\u0000doc-tab:';

interface OpenTabOptions {
  behavior: 'append' | 'replace-active';
  currentTabId: string | null;
  limit: number;
}

function splitTabInstance(tabId: string): { baseTabId: string; instanceSuffix: string } {
  const separatorIndex = tabId.lastIndexOf(TAB_INSTANCE_SEPARATOR);
  if (separatorIndex < 0) return { baseTabId: tabId, instanceSuffix: '' };
  return {
    baseTabId: tabId.slice(0, separatorIndex),
    instanceSuffix: tabId.slice(separatorIndex),
  };
}

function baseTabId(tabId: string): string {
  return splitTabInstance(tabId).baseTabId;
}

function isValidTabId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  const base = baseTabId(value);
  if (base.startsWith(FOLDER_TAB_PREFIX)) return base.length > FOLDER_TAB_PREFIX.length;
  if (base.startsWith(ASSET_TAB_PREFIX)) return base.length > ASSET_TAB_PREFIX.length;
  return true;
}

export function docTabId(docName: string): string {
  return docName;
}

function duplicateTabId(tabId: string, instance: number): string {
  return `${baseTabId(tabId)}${TAB_INSTANCE_SEPARATOR}${instance}`;
}

export function nextAvailableDocTabId(tabs: readonly string[], docName: string): string {
  return nextAvailableTabId(tabs, docTabId(docName));
}

export function nextAvailableTabId(tabs: readonly string[], tabId: string): string {
  const normalized = normalizeOpenTabs(tabs, Number.MAX_SAFE_INTEGER);
  const canonicalTabId = baseTabId(tabId);
  if (!normalized.includes(canonicalTabId)) return canonicalTabId;

  let instance = 1;
  let nextTabId: string;
  do {
    nextTabId = duplicateTabId(canonicalTabId, instance);
    instance++;
  } while (normalized.includes(nextTabId));
  return nextTabId;
}

export function findOpenTabTarget(tabs: readonly string[], tabId: string): string | null {
  const canonicalTabId = baseTabId(tabId);
  return (
    normalizeOpenTabs(tabs, Number.MAX_SAFE_INTEGER).find(
      (openTabId) => baseTabId(openTabId) === canonicalTabId,
    ) ?? null
  );
}

export function sameTabTarget(firstTabId: string, secondTabId: string): boolean {
  return baseTabId(firstTabId) === baseTabId(secondTabId);
}

export function folderTabId(folderPath: string): string {
  return `${FOLDER_TAB_PREFIX}${folderPath}`;
}

export function assetTabId(assetPath: string): string {
  return `${ASSET_TAB_PREFIX}${assetPath}`;
}

export function tabIdForNavigationTarget(
  target:
    | { kind: 'doc'; docName: string }
    | { kind: 'folder-index'; docName: string }
    | { kind: 'folder'; folderPath: string }
    | { kind: 'asset'; assetPath: string }
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
      return assetTabId(target.assetPath);
  }
}

export function parseEditorTabId(
  tabId: string,
):
  | { kind: 'doc'; docName: string }
  | { kind: 'folder'; folderPath: string }
  | { kind: 'asset'; assetPath: string } {
  const base = baseTabId(tabId);
  if (base.startsWith(FOLDER_TAB_PREFIX)) {
    return { kind: 'folder', folderPath: base.slice(FOLDER_TAB_PREFIX.length) };
  }
  if (base.startsWith(ASSET_TAB_PREFIX)) {
    return { kind: 'asset', assetPath: base.slice(ASSET_TAB_PREFIX.length) };
  }
  return { kind: 'doc', docName: base };
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

export function replaceOpenTab(
  tabs: readonly string[],
  currentTabId: string | null,
  nextTabId: string,
  limit: number,
): string[] {
  const normalized = normalizeOpenTabs(tabs, limit);
  if (!isValidTabId(nextTabId)) return normalized;
  if (!currentTabId || currentTabId === nextTabId) return addOpenTab(normalized, nextTabId, limit);

  const tabsWithoutNext = normalized.filter((tab) => tab !== nextTabId);
  const currentIndex = tabsWithoutNext.indexOf(currentTabId);
  if (currentIndex < 0) return addOpenTab(tabsWithoutNext, nextTabId, limit);

  const next = [...tabsWithoutNext];
  next[currentIndex] = nextTabId;
  return normalizeOpenTabs(next, limit);
}

export function openDocTab(
  tabs: readonly string[],
  docName: string,
  options: OpenTabOptions,
): { tabs: string[]; activeTabId: string } {
  return openTab(tabs, docTabId(docName), options);
}

export function openTab(
  tabs: readonly string[],
  tabId: string,
  { behavior, currentTabId, limit }: OpenTabOptions,
): { tabs: string[]; activeTabId: string } {
  const normalized = normalizeOpenTabs(tabs, limit);
  const canonicalTabId = baseTabId(tabId);
  if (
    currentTabId &&
    normalized.includes(currentTabId) &&
    baseTabId(currentTabId) === canonicalTabId
  ) {
    return {
      tabs: normalized,
      activeTabId: currentTabId,
    };
  }
  if (behavior !== 'replace-active') {
    return {
      tabs: addOpenTab(normalized, canonicalTabId, limit),
      activeTabId: canonicalTabId,
    };
  }

  const nextTabId = nextAvailableTabId(normalized, canonicalTabId);

  return {
    tabs: replaceOpenTab(normalized, currentTabId, nextTabId, limit),
    activeTabId: nextTabId,
  };
}

export function removeOpenTab(tabs: readonly string[], tabId: string): string[] {
  return tabs.filter((tab) => tab !== tabId);
}

export function reconcileVisibleTabOrder(
  currentOrder: readonly string[],
  openTabs: readonly string[],
  newTabIds: readonly string[],
): string[] {
  const regularTabs = normalizeOpenTabs(openTabs, Number.MAX_SAFE_INTEGER);
  const regularSet = new Set(regularTabs);
  const newTabSet = new Set(newTabIds);
  const seen = new Set<string>();
  const next: string[] = [];

  for (const tabId of currentOrder) {
    if (seen.has(tabId)) continue;
    if (!regularSet.has(tabId) && !newTabSet.has(tabId)) continue;
    seen.add(tabId);
    next.push(tabId);
  }

  for (const tabId of [...regularTabs, ...newTabIds]) {
    if (seen.has(tabId)) continue;
    seen.add(tabId);
    next.push(tabId);
  }

  return next;
}

export function filterOpenTabsForKnownTargets(
  tabs: readonly string[],
  { pages, folderPaths, assetPaths, keepMissingDocName = null }: KnownTabTargets,
): string[] {
  return normalizeOpenTabs(tabs, Number.MAX_SAFE_INTEGER).filter((tabId) => {
    const tab = parseEditorTabId(tabId);
    if (tab.kind === 'folder') return folderPaths.has(tab.folderPath);
    if (tab.kind === 'asset') return assetPaths.has(tab.assetPath);
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
    const { instanceSuffix } = splitTabInstance(tab);
    const parsed = parseEditorTabId(tab);
    const mappedBase =
      parsed.kind === 'doc'
        ? (bySource.get(parsed.docName) ?? baseTabId(tab))
        : parsed.kind === 'folder'
          ? folderTabId(remapPathForFolderRenames(parsed.folderPath, folderMappings))
          : assetTabId(remapPathForFolderRenames(parsed.assetPath, folderMappings));
    const mapped = `${mappedBase}${instanceSuffix}`;
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
