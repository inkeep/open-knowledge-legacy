import { RenamePathSuccessSchema } from '@inkeep/open-knowledge-core';
import { PinIcon, PlusIcon, XIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState, type WheelEvent } from 'react';
import {
  buildRenamedNodePath,
  isValidNodeName,
  normalizeRenameValue,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { useDocumentContext } from '@/editor/DocumentContext';
import {
  docTabId,
  filterClosableTabIds,
  parseEditorTabId,
  tabIdForNavigationTarget,
} from '@/editor/editor-tabs';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';
import { cn } from '@/lib/utils';
import { usePageList } from './PageListContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const TAB_RENAME_EXTENSIONS = ['.md', '.mdx'] as const;
const TAB_BASE_CLASS =
  'group relative -mb-px flex h-10 min-w-28 max-w-64 shrink-0 cursor-pointer items-center overflow-hidden border border-transparent font-medium transition-colors';
const TAB_ACTIVE_CLASS =
  'z-10 rounded-t-lg rounded-b-none border-border border-b-0 bg-background text-foreground';
const TAB_INACTIVE_CLASS = cn(
  TAB_ACTIVE_CLASS,
  'bg-transparent hover:bg-muted focus-visible:bg-muted border-transparent hover:border-border focus-visible:border-border',
);
const TAB_BUTTON_CLASS =
  'flex h-full min-w-0 flex-1 cursor-pointer items-center overflow-hidden px-3 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
const TAB_CLOSE_BUTTON_CLASS =
  'mr-2 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none transition hover:bg-foreground/10 hover:text-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:opacity-100';

function tabCloseButtonClass(isActive: boolean): string {
  return cn(
    TAB_CLOSE_BUTTON_CLASS,
    isActive
      ? 'opacity-100'
      : 'pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
  );
}

function tabParts(
  docName: string,
  docExt: string,
): { baseName: string; extension: string; label: string; prefix: string } {
  const slash = docName.lastIndexOf('/');
  const baseName = slash < 0 ? docName : docName.slice(slash + 1);
  const label = `${baseName}${docExt}`;
  if (slash < 0) return { baseName, extension: docExt, label, prefix: '' };
  return {
    baseName,
    extension: docExt,
    label,
    prefix: `${docName.slice(0, slash)}/`,
  };
}

function tabDomIdPart(docName: string): string {
  return docName.replace(/[^A-Za-z0-9_-]/g, '-');
}

function navigateToDoc(docName: string) {
  const nextHash = hashFromDocName(docName);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function scrollTabListOnWheel(event: WheelEvent<HTMLDivElement>) {
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
  event.preventDefault();
  event.currentTarget.scrollLeft += event.deltaY;
}

function stripRenameExtensionSuffix(value: string, docExt: string): string {
  const extensions = [docExt, ...TAB_RENAME_EXTENSIONS].filter(
    (ext, index, all) => ext && all.indexOf(ext) === index,
  );
  const lowerValue = value.toLowerCase();
  const extension = extensions.find(
    (ext) => value.length > ext.length && lowerValue.endsWith(ext.toLowerCase()),
  );
  return extension ? value.slice(0, -extension.length) : value;
}

function EditorTabContextMenu({
  children,
  closeTab,
  closeTabs,
  canPin = true,
  disabled = false,
  openTabs,
  pinTab,
  pinnedTabIds,
  tabId,
  unpinTab,
}: {
  children: ReactNode;
  canPin?: boolean;
  closeTab: (tabId: string) => void;
  closeTabs: (tabIds: readonly string[]) => void;
  disabled?: boolean;
  openTabs: readonly string[];
  pinTab: (tabId: string) => void;
  pinnedTabIds: readonly string[];
  tabId: string;
  unpinTab: (tabId: string) => void;
}) {
  if (disabled) return children;

  const isPinned = canPin && pinnedTabIds.includes(tabId);
  const otherTabIds = filterClosableTabIds(
    openTabs.filter((openTabId) => openTabId !== tabId),
    pinnedTabIds,
  );
  const closableTabIds = filterClosableTabIds(openTabs, pinnedTabIds);
  const closeAllLabel = pinnedTabIds.length ? 'Close all unpinned' : 'Close all';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        <ContextMenuItem disabled={isPinned} onSelect={() => closeTab(tabId)}>
          Close
        </ContextMenuItem>
        <ContextMenuItem
          disabled={otherTabIds.length === 0}
          onSelect={() => {
            closeTabs(otherTabIds);
          }}
        >
          Close others
        </ContextMenuItem>
        <ContextMenuItem
          disabled={closableTabIds.length === 0}
          onSelect={() => {
            closeTabs(closableTabIds);
          }}
        >
          {closeAllLabel}
        </ContextMenuItem>
        {canPin && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => (isPinned ? unpinTab(tabId) : pinTab(tabId))}>
              {isPinned ? 'Unpin tab' : 'Pin tab'}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TabPinOrCloseButton({
  accessibleLabel,
  closeTab,
  isPinned,
  tabId,
  unpinTab,
}: {
  accessibleLabel: string;
  closeTab: (tabId: string) => void;
  isPinned: boolean;
  tabId: string;
  unpinTab: (tabId: string) => void;
}) {
  if (isPinned) {
    return (
      <Button
        variant="ghost"
        size="icon-xs"
        type="button"
        aria-label={`Unpin ${accessibleLabel}`}
        className="mr-2 text-primary! hover:bg-primary/10!"
        onClick={(event) => {
          event.stopPropagation();
          unpinTab(tabId);
        }}
      >
        <PinIcon aria-hidden="true" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={`Close ${accessibleLabel}`}
      className="mr-2"
      onClick={(event) => {
        event.stopPropagation();
        closeTab(tabId);
      }}
    >
      <XIcon aria-hidden="true" />
    </Button>
  );
}

export function EditorTabs() {
  const {
    activeDocName,
    activeTabId: activeContextTabId,
    activeNewTabId,
    activeTarget,
    activateTab,
    activateNewTab,
    closeAndClearForRename,
    closeNewTab,
    closeTab,
    closeTabs,
    isNewTabActive,
    newTabIds,
    openNewTab,
    openTabs,
    pinTab,
    pinnedTabIds,
    remapTabsForRename,
    unpinTab,
    visibleTabIds,
  } = useDocumentContext();
  const { pageMeta } = usePageList();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [renamingTab, setRenamingTab] = useState<{ docName: string; tabId: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenameLoading, setIsRenameLoading] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const commitInProgressRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const lastFailedValueRef = useRef<string | null>(null);
  const activeDocNameRef = useRef(activeDocName);
  const activeTabId =
    activeContextTabId ??
    (activeTarget
      ? tabIdForNavigationTarget(activeTarget)
      : activeDocName
        ? docTabId(activeDocName)
        : null);
  const activeTabScrollKey = isNewTabActive
    ? `${activeNewTabId ?? '__new-tab__'}\u0000${openTabs.join('\u0000')}\u0000${newTabIds.join('\u0000')}`
    : activeTabId
      ? `${activeTabId}\u0000${openTabs.join('\u0000')}`
      : '';

  useEffect(() => {
    activeDocNameRef.current = activeDocName;
  }, [activeDocName]);

  useEffect(() => {
    if (!activeTabScrollKey) return;
    const activeTab = tabListRef.current?.querySelector<HTMLElement>('[data-active-tab="true"]');
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabScrollKey]);

  useEffect(() => {
    if (!renamingTab) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingTab]);

  useEffect(() => {
    if (!renamingTab || openTabs.includes(renamingTab.tabId)) return;
    cancelRequestedRef.current = true;
    lastFailedValueRef.current = null;
    setRenamingTab(null);
    setRenameValue('');
    setRenameError(null);
    setIsRenameLoading(false);
  }, [openTabs, renamingTab]);

  function enterRenameMode(tabId: string, docName: string) {
    const segments = docName.split('/');
    cancelRequestedRef.current = false;
    lastFailedValueRef.current = null;
    setRenamingTab({ docName, tabId });
    setRenameValue(segments[segments.length - 1]);
    setRenameError(null);
  }

  function cancelRename() {
    cancelRequestedRef.current = true;
    lastFailedValueRef.current = null;
    setRenamingTab(null);
    setRenameValue('');
    setRenameError(null);
    setIsRenameLoading(false);
  }

  async function commitRename() {
    if (cancelRequestedRef.current) {
      cancelRequestedRef.current = false;
      return;
    }
    if (commitInProgressRef.current) return;

    const docName = renamingTab?.docName;
    if (!docName) {
      cancelRename();
      return;
    }

    const docExt = pageMeta.get(docName)?.docExt ?? '.md';
    const normalized = normalizeRenameValue(
      'file',
      stripRenameExtensionSuffix(renameValue, docExt),
    );
    const segments = docName.split('/');
    const currentName = segments[segments.length - 1];

    if (normalized === currentName) {
      cancelRename();
      return;
    }
    if (normalized === lastFailedValueRef.current) {
      renameInputRef.current?.focus();
      return;
    }

    if (!isValidNodeName(normalized)) {
      setRenameError('Name can’t be empty, ".", "..", or contain / or \\');
      renameInputRef.current?.focus();
      return;
    }

    const newDocName = buildRenamedNodePath(
      { kind: 'file', path: docName, name: currentName },
      normalized,
    );

    commitInProgressRef.current = true;
    setIsRenameLoading(true);
    setRenameError(null);

    try {
      const res = await fetch('/api/rename-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'file', fromPath: docName, toPath: newDocName }),
      });

      if (cancelRequestedRef.current) {
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        return;
      }

      const parsed = await parseServerResponse(res, `Server error (HTTP ${res.status})`);

      if (!parsed.ok) {
        setRenameError(parsed.title);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        renameInputRef.current?.focus();
        return;
      }

      const success = parseSuccessOrWarn(RenamePathSuccessSchema, parsed.body, 'rename-path:tab', {
        renamed: [],
      });
      const renamed = success.renamed;
      const currentActiveDocName = activeDocNameRef.current;
      const nextActiveDocName = remapActiveDocName(currentActiveDocName, renamed);

      await Promise.all(
        renamed.flatMap((entry) => [
          closeAndClearForRename(entry.fromDocName),
          closeAndClearForRename(entry.toDocName),
        ]),
      );
      remapTabsForRename(renamed);
      emitDocumentsChanged(['files', 'backlinks', 'graph']);

      cancelRequestedRef.current = true;
      setRenamingTab(null);
      setRenameValue('');
      setRenameError(null);
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
      lastFailedValueRef.current = null;

      if (nextActiveDocName && nextActiveDocName !== currentActiveDocName) {
        navigateToDoc(nextActiveDocName);
      }
    } catch (err) {
      console.warn('[EditorTabs] rename failed', { err, docName, newDocName, normalized });
      setRenameError('Network error — please try again');
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
      lastFailedValueRef.current = normalized;
      renameInputRef.current?.focus();
    }
  }

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const newTabIdSet = new Set(newTabIds);

  function closeVisibleTabs(tabIds: readonly string[]) {
    const documentTabIds: string[] = [];
    const emptyTabIds: string[] = [];

    for (const tabId of tabIds) {
      if (newTabIdSet.has(tabId)) {
        emptyTabIds.push(tabId);
      } else {
        documentTabIds.push(tabId);
      }
    }

    if (documentTabIds.length > 0) closeTabs(documentTabIds);
    for (const tabId of emptyTabIds) closeNewTab(tabId);
  }

  return (
    <div
      ref={tabListRef}
      className={cn(
        'pl-2 flex h-12 min-w-0 touch-manipulation flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-fade-mask-x [scrollbar-width:none]',
        isElectronHost && '[-webkit-app-region:drag]',
      )}
      onWheel={scrollTabListOnWheel}
    >
      {visibleTabIds.map((tabId) => {
        if (newTabIdSet.has(tabId)) {
          const isActive = tabId === activeNewTabId;
          return (
            <EditorTabContextMenu
              key={tabId}
              tabId={tabId}
              canPin={false}
              openTabs={visibleTabIds}
              closeTab={closeNewTab}
              closeTabs={closeVisibleTabs}
              pinTab={pinTab}
              pinnedTabIds={pinnedTabIds}
              unpinTab={unpinTab}
            >
              {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only dead-zone fill; keyboard activation stays on the inner tab button */}
              <div
                role="presentation"
                data-active-tab={isActive ? 'true' : undefined}
                className={cn(
                  TAB_BASE_CLASS,
                  isActive ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS,
                  isElectronHost && '[-webkit-app-region:no-drag]',
                )}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  closeNewTab(tabId);
                }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  activateNewTab(tabId);
                }}
              >
                <button
                  type="button"
                  aria-label="Activate new tab"
                  className={TAB_BUTTON_CLASS}
                  onClick={() => activateNewTab(tabId)}
                >
                  <span className="min-w-0 truncate">New tab</span>
                </button>
                <button
                  type="button"
                  aria-label="Close new tab"
                  className={tabCloseButtonClass(isActive)}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeNewTab(tabId);
                  }}
                >
                  <XIcon aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            </EditorTabContextMenu>
          );
        }

        const tab = parseEditorTabId(tabId);
        const isActive = tabId === activeTabId;
        const isPinned = pinnedTabIds.includes(tabId);
        if (tab.kind === 'folder') {
          const { baseName, label, prefix } = tabParts(tab.folderPath, '/');
          const accessibleLabel = `${prefix}${label}`;
          return (
            <EditorTabContextMenu
              key={tabId}
              tabId={tabId}
              openTabs={visibleTabIds}
              closeTab={closeTab}
              closeTabs={closeVisibleTabs}
              pinTab={pinTab}
              pinnedTabIds={pinnedTabIds}
              unpinTab={unpinTab}
            >
              {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only dead-zone fill; keyboard activation stays on the inner tab button */}
              <div
                role="presentation"
                data-active-tab={isActive ? 'true' : undefined}
                className={cn(
                  TAB_BASE_CLASS,
                  isActive ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS,
                  isElectronHost && '[-webkit-app-region:no-drag]',
                )}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  if (isPinned) return;
                  closeTab(tabId);
                }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  activateTab(tabId);
                }}
              >
                <button
                  type="button"
                  aria-label={accessibleLabel}
                  className={TAB_BUTTON_CLASS}
                  onClick={() => {
                    activateTab(tabId);
                  }}
                >
                  {prefix && (
                    <span
                      className={cn('min-w-0 flex-1 truncate', isActive && 'text-muted-foreground')}
                    >
                      {prefix}
                    </span>
                  )}
                  <span
                    className={cn(
                      'flex min-w-0 items-center',
                      prefix ? 'max-w-[70%] shrink-0' : 'flex-1',
                    )}
                  >
                    <span className="min-w-0 truncate">{baseName}</span>
                    <span className="shrink-0">/</span>
                  </span>
                </button>
                <TabPinOrCloseButton
                  accessibleLabel={accessibleLabel}
                  closeTab={closeTab}
                  isPinned={isPinned}
                  tabId={tabId}
                  unpinTab={unpinTab}
                />
              </div>
            </EditorTabContextMenu>
          );
        }

        if (tab.kind === 'asset') {
          const { baseName, label, prefix } = tabParts(tab.assetPath, '');
          const accessibleLabel = `${prefix}${label}`;
          return (
            <EditorTabContextMenu
              key={tabId}
              tabId={tabId}
              openTabs={visibleTabIds}
              closeTab={closeTab}
              closeTabs={closeVisibleTabs}
              pinTab={pinTab}
              pinnedTabIds={pinnedTabIds}
              unpinTab={unpinTab}
            >
              {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only dead-zone fill; keyboard activation stays on the inner tab button */}
              <div
                role="presentation"
                data-active-tab={isActive ? 'true' : undefined}
                className={cn(
                  TAB_BASE_CLASS,
                  isActive ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS,
                  isElectronHost && '[-webkit-app-region:no-drag]',
                )}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  if (isPinned) return;
                  closeTab(tabId);
                }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  activateTab(tabId);
                }}
              >
                <button
                  type="button"
                  aria-label={accessibleLabel}
                  className={TAB_BUTTON_CLASS}
                  onClick={() => {
                    activateTab(tabId);
                  }}
                >
                  {prefix ? (
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-muted-foreground/60',
                        isActive && 'text-muted-foreground',
                      )}
                    >
                      {prefix}
                    </span>
                  ) : null}
                  <span
                    className={cn('min-w-0 truncate', prefix ? 'max-w-[70%] shrink-0' : 'flex-1')}
                  >
                    {baseName}
                  </span>
                </button>
                <TabPinOrCloseButton
                  accessibleLabel={accessibleLabel}
                  closeTab={closeTab}
                  isPinned={isPinned}
                  tabId={tabId}
                  unpinTab={unpinTab}
                />
              </div>
            </EditorTabContextMenu>
          );
        }

        const docName = tab.docName;
        const docExt = pageMeta.get(docName)?.docExt ?? '.md';
        const { baseName, extension, label, prefix } = tabParts(docName, docExt);
        const accessibleLabel = `${prefix}${label}`;
        const isRenaming = renamingTab?.tabId === tabId;
        const renameErrorId = `editor-tab-rename-error-${tabDomIdPart(docName)}`;
        return (
          <EditorTabContextMenu
            key={tabId}
            disabled={isRenaming}
            tabId={tabId}
            openTabs={visibleTabIds}
            closeTab={closeTab}
            closeTabs={closeVisibleTabs}
            pinTab={pinTab}
            pinnedTabIds={pinnedTabIds}
            unpinTab={unpinTab}
          >
            {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only dead-zone fill; keyboard activation stays on the inner tab button */}
            <div
              role="presentation"
              data-active-tab={isActive ? 'true' : undefined}
              className={cn(
                TAB_BASE_CLASS,
                isActive ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS,
                isRenaming && renameError && 'border-destructive',
                isElectronHost && '[-webkit-app-region:no-drag]',
              )}
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                if (isPinned) return;
                closeTab(tabId);
              }}
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                activateTab(tabId);
              }}
            >
              {isRenaming ? (
                <>
                  <InputGroup className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent dark:bg-transparent">
                    <InputGroupInput
                      ref={renameInputRef}
                      value={renameValue}
                      disabled={isRenameLoading}
                      aria-label={`Rename ${label}`}
                      aria-invalid={renameError ? true : undefined}
                      aria-describedby={renameError ? renameErrorId : undefined}
                      aria-busy={isRenameLoading || undefined}
                      title={renameError ?? docName}
                      className="h-full min-w-0 px-2 py-0 font-medium text-foreground text-xs selection:bg-primary selection:text-primary-foreground"
                      onChange={(event) => {
                        setRenameValue(stripRenameExtensionSuffix(event.target.value, docExt));
                        setRenameError(null);
                        lastFailedValueRef.current = null;
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void commitRename();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={commitRename}
                    />
                    <InputGroupAddon align="inline-end" aria-hidden="true" className="pr-2 text-xs">
                      <InputGroupText className="text-muted-foreground/60 text-xs">
                        {docExt}
                      </InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {renameError ? (
                    <span id={renameErrorId} role="alert" className="sr-only">
                      {renameError}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={accessibleLabel}
                    className={TAB_BUTTON_CLASS}
                    onClick={() => {
                      activateTab(tabId);
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      enterRenameMode(tabId, docName);
                    }}
                  >
                    {prefix && (
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-muted-foreground/60',
                          isActive && 'text-muted-foreground',
                        )}
                      >
                        {prefix}
                      </span>
                    )}
                    <span
                      className={cn(
                        'flex min-w-0 items-center',
                        prefix ? 'max-w-[70%] shrink-0' : 'flex-1',
                      )}
                    >
                      <span className="min-w-0 truncate">{baseName}</span>
                      <span className="shrink-0">{extension}</span>
                    </span>
                  </button>
                  <TabPinOrCloseButton
                    accessibleLabel={accessibleLabel}
                    closeTab={closeTab}
                    isPinned={isPinned}
                    tabId={tabId}
                    unpinTab={unpinTab}
                  />
                </>
              )}
            </div>
          </EditorTabContextMenu>
        );
      })}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="New tab"
            className={cn('first:mb-3 mb-1.5', isElectronHost && '[-webkit-app-region:no-drag]')}
            onClick={openNewTab}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New tab</TooltipContent>
      </Tooltip>
    </div>
  );
}
