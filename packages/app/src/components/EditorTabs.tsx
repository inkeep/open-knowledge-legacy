import { RenamePathSuccessSchema } from '@inkeep/open-knowledge-core';
import { FileIcon, FolderOpen, PlusIcon, XIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState, type WheelEvent } from 'react';
import {
  buildRenamedNodePath,
  isValidNodeName,
  normalizeRenameValue,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { useDocumentContext } from '@/editor/DocumentContext';
import { docTabId, parseEditorTabId, tabIdForNavigationTarget } from '@/editor/editor-tabs';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';
import { cn } from '@/lib/utils';
import { usePageList } from './PageListContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const TAB_RENAME_EXTENSIONS = ['.md', '.mdx'] as const;
const TAB_BASE_CLASS =
  'group flex h-10 -mb-px min-w-28 max-w-64 shrink-0 cursor-pointer self-end items-center overflow-hidden rounded-lg border relative';
const TAB_ACTIVE_CLASS =
  'rounded-b-none border-border border-b-background bg-background text-foreground';
const TAB_INACTIVE_CLASS = 'border-transparent text-muted-foreground hover:text-foreground';
const TAB_BUTTON_CLASS =
  'flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 overflow-hidden px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
const TAB_CLOSE_BUTTON_CLASS =
  'mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:opacity-100';

function tabCloseButtonClass(isActive: boolean): string {
  return cn(
    TAB_CLOSE_BUTTON_CLASS,
    isActive ? 'opacity-70' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-70',
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
  disabled = false,
  openTabs,
  tabId,
}: {
  children: ReactNode;
  closeTab: (tabId: string) => void;
  closeTabs: (tabIds: readonly string[]) => void;
  disabled?: boolean;
  openTabs: readonly string[];
  tabId: string;
}) {
  if (disabled) return children;

  const otherTabIds = openTabs.filter((openTabId) => openTabId !== tabId);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        <ContextMenuItem onSelect={() => closeTab(tabId)}>Close</ContextMenuItem>
        <ContextMenuItem
          disabled={otherTabIds.length === 0}
          onSelect={() => {
            closeTabs(otherTabIds);
          }}
        >
          Close others
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            closeTabs(openTabs);
          }}
        >
          Close all
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
    remapTabsForRename,
    visibleTabIds,
  } = useDocumentContext();
  const { pageMeta } = usePageList();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [renamingDocName, setRenamingDocName] = useState<string | null>(null);
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
    if (!renamingDocName) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingDocName]);

  useEffect(() => {
    if (!renamingDocName || openTabs.includes(docTabId(renamingDocName))) return;
    cancelRequestedRef.current = true;
    lastFailedValueRef.current = null;
    setRenamingDocName(null);
    setRenameValue('');
    setRenameError(null);
    setIsRenameLoading(false);
  }, [openTabs, renamingDocName]);

  function enterRenameMode(docName: string) {
    const segments = docName.split('/');
    cancelRequestedRef.current = false;
    lastFailedValueRef.current = null;
    setRenamingDocName(docName);
    setRenameValue(segments[segments.length - 1]);
    setRenameError(null);
  }

  function cancelRename() {
    cancelRequestedRef.current = true;
    lastFailedValueRef.current = null;
    setRenamingDocName(null);
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

    const docName = renamingDocName;
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
      setRenamingDocName(null);
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
        'pl-2 flex h-10 min-w-0 touch-manipulation flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-fade-mask-x [scrollbar-width:none]',
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
              openTabs={visibleTabIds}
              closeTab={closeNewTab}
              closeTabs={closeVisibleTabs}
            >
              {
                // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only dead-zone fill; keyboard activation stays on the inner tab button.
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
                    title="New tab"
                    className={TAB_BUTTON_CLASS}
                    onClick={() => activateNewTab(tabId)}
                  >
                    <span className="min-w-0 truncate text-muted-foreground">New tab</span>
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
              }
            </EditorTabContextMenu>
          );
        }

        const tab = parseEditorTabId(tabId);
        const isActive = tabId === activeTabId;
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
            >
              {
                // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only dead-zone fill; keyboard activation stays on the inner tab button.
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
                    title={accessibleLabel}
                    className={TAB_BUTTON_CLASS}
                    onClick={() => {
                      activateTab(tabId);
                    }}
                  >
                    <FolderOpen aria-hidden="true" className="size-3.5 shrink-0" />
                    {prefix ? (
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          isActive && 'text-muted-foreground',
                        )}
                      >
                        {prefix}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        'flex min-w-0 items-center font-medium',
                        prefix ? 'max-w-[70%] shrink-0' : 'flex-1',
                      )}
                    >
                      <span className="min-w-0 truncate">{baseName}</span>
                      <span className="shrink-0">/</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${accessibleLabel}`}
                    className={tabCloseButtonClass(isActive)}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tabId);
                    }}
                  >
                    <XIcon aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              }
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
            >
              {
                // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only dead-zone fill; keyboard activation stays on the inner tab button.
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
                    title={accessibleLabel}
                    className={TAB_BUTTON_CLASS}
                    onClick={() => {
                      activateTab(tabId);
                    }}
                  >
                    <FileIcon aria-hidden="true" className="size-3.5 shrink-0" />
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
                      className={cn(
                        'min-w-0 truncate font-medium',
                        prefix ? 'max-w-[70%] shrink-0' : 'flex-1',
                      )}
                    >
                      {baseName}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${accessibleLabel}`}
                    className={tabCloseButtonClass(isActive)}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tabId);
                    }}
                  >
                    <XIcon aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              }
            </EditorTabContextMenu>
          );
        }

        const docName = tab.docName;
        const docExt = pageMeta.get(docName)?.docExt ?? '.md';
        const { baseName, extension, label, prefix } = tabParts(docName, docExt);
        const accessibleLabel = `${prefix}${label}`;
        const isRenaming = renamingDocName === docName;
        const renameErrorId = `editor-tab-rename-error-${tabDomIdPart(docName)}`;
        return (
          <EditorTabContextMenu
            key={tabId}
            disabled={isRenaming}
            tabId={tabId}
            openTabs={visibleTabIds}
            closeTab={closeTab}
            closeTabs={closeVisibleTabs}
          >
            {
              // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only dead-zone fill; keyboard activation stays on the inner tab button.
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
                      <InputGroupAddon
                        align="inline-end"
                        aria-hidden="true"
                        className="pr-2 text-xs"
                      >
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
                      title={accessibleLabel}
                      className={TAB_BUTTON_CLASS}
                      onClick={() => {
                        activateTab(tabId);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        enterRenameMode(docName);
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
                        className={cn(
                          'flex min-w-0 items-center font-medium',
                          prefix ? 'max-w-[70%] shrink-0' : 'flex-1',
                        )}
                      >
                        <span className="min-w-0 truncate">{baseName}</span>
                        <span className="shrink-0">{extension}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Close ${accessibleLabel}`}
                      className={tabCloseButtonClass(isActive)}
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tabId);
                      }}
                    >
                      <XIcon aria-hidden="true" className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            }
          </EditorTabContextMenu>
        );
      })}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="New tab"
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
              isElectronHost && '[-webkit-app-region:no-drag]',
            )}
            onClick={openNewTab}
          >
            <PlusIcon aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>New tab</TooltipContent>
      </Tooltip>
    </div>
  );
}
