import { XIcon } from 'lucide-react';
import { useEffect, useRef, useState, type WheelEvent } from 'react';
import {
  buildRenamedNodePath,
  isRenamePathResponse,
  isValidNodeName,
  normalizeRenameValue,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { useDocumentContext } from '@/editor/DocumentContext';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { cn } from '@/lib/utils';
import { usePageList } from './PageListContext';

const TAB_RENAME_EXTENSIONS = ['.md', '.mdx'] as const;

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

export function EditorTabs() {
  const { activeDocName, closeAndClearForRename, closeTab, openTabs, remapTabsForRename } =
    useDocumentContext();
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
  const activeTabScrollKey = activeDocName
    ? `${activeDocName}\u0000${openTabs.join('\u0000')}`
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
    if (!renamingDocName || openTabs.includes(renamingDocName)) return;
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

      let raw: unknown;
      try {
        raw = await res.json();
      } catch (parseErr) {
        console.warn('[EditorTabs] rename response JSON parse failed', {
          parseErr,
          status: res.status,
          docName,
          newDocName,
        });
        setRenameError(`Server error (HTTP ${res.status})`);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        renameInputRef.current?.focus();
        return;
      }

      if (!isRenamePathResponse(raw)) {
        console.warn('[EditorTabs] rename failed', {
          status: res.status,
          docName,
          newDocName,
        });
        setRenameError(`Server error (HTTP ${res.status})`);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        renameInputRef.current?.focus();
        return;
      }

      if (!res.ok || !raw.ok) {
        setRenameError(raw.ok ? `Server error (HTTP ${res.status})` : raw.error);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        renameInputRef.current?.focus();
        return;
      }

      const renamed = raw.renamed;
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

  if (openTabs.length === 0) return null;

  return (
    <div
      ref={tabListRef}
      className="ml-2 flex h-8 min-w-0 touch-manipulation flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain subtle-scrollbar"
      onWheel={scrollTabListOnWheel}
    >
      {openTabs.map((docName) => {
        const isActive = docName === activeDocName;
        const docExt = pageMeta.get(docName)?.docExt ?? '.md';
        const { baseName, extension, label, prefix } = tabParts(docName, docExt);
        const accessibleLabel = `${prefix}${label}`;
        const isRenaming = renamingDocName === docName;
        const renameErrorId = `editor-tab-rename-error-${tabDomIdPart(docName)}`;
        return (
          <div
            key={docName}
            role="presentation"
            data-active-tab={isActive ? 'true' : undefined}
            className={cn(
              'group flex h-7 min-w-28 max-w-64 shrink-0 items-center overflow-hidden rounded-md border',
              isActive
                ? 'border-border bg-background text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              isRenaming && renameError && 'border-destructive',
            )}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              closeTab(docName);
            }}
          >
            {isRenaming ? (
              <>
                <InputGroup className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent">
                  <InputGroupInput
                    ref={renameInputRef}
                    value={renameValue}
                    disabled={isRenameLoading}
                    aria-label={`Rename ${label}`}
                    aria-invalid={renameError ? true : undefined}
                    aria-describedby={renameError ? renameErrorId : undefined}
                    aria-busy={isRenameLoading || undefined}
                    title={renameError ?? docName}
                    className="h-full min-w-0 px-2 py-0 text-xs"
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
                    <InputGroupText className="text-xs text-muted-foreground/60">
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
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => {
                    navigateToDoc(docName);
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    enterRenameMode(docName);
                  }}
                >
                  {prefix ? (
                    <span className="min-w-0 flex-1 truncate text-muted-foreground/60">
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
                  aria-label={`Close ${label}`}
                  className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-70 outline-none transition hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(docName);
                  }}
                >
                  <XIcon aria-hidden="true" className="size-3.5" />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
