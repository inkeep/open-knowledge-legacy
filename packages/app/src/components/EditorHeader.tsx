import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import {
  Columns2,
  FolderOpen,
  GitFork,
  History,
  Pin,
  PinOff,
  RotateCcw,
  Rows2,
  Save,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  buildRenamedNodePath,
  isValidNodeName,
  normalizeRenameValue,
  type RenamedDocMapping,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { PresenceBar } from '@/presence/PresenceBar';
import { useSyncStatus } from '@/presence/use-sync-status';
import type { DiffLayout } from './DiffView';
import type { EditorMode } from './EditorPane';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';
import { SyncStatusBadge } from './SyncStatusBadge';
import { ThemeToggle } from './ThemeToggle';
import { Badge } from './ui/badge';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

type RenameResponse =
  | {
      ok: true;
      renamed: RenamedDocMapping[];
      rewrittenDocs: Array<{ docName: string; rewrites: number }>;
    }
  | { ok: false; error: string };

function isRenamedDocMapping(v: unknown): v is RenamedDocMapping {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { fromDocName: unknown }).fromDocName === 'string' &&
    typeof (v as { toDocName: unknown }).toDocName === 'string'
  );
}

function isRenameResponse(v: unknown): v is RenameResponse {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.ok === true) {
    return (
      Array.isArray(obj.renamed) &&
      obj.renamed.every(isRenamedDocMapping) &&
      Array.isArray(obj.rewrittenDocs)
    );
  }
  if (obj.ok === false) {
    return typeof obj.error === 'string';
  }
  return false;
}

interface EditorHeaderProps {
  editorMode: EditorMode;
  onModeChange: (mode: 'wysiwyg' | 'source') => void;
  onTimelineToggle: () => void;
  onSaveVersion: () => void;
  saving: boolean;
  previewEntry: TimelineEntry | null;
  restoring: boolean;
  restoreError: string | null;
  onExitPreview: () => void;
  onRestore: () => void;
  diffLayout: DiffLayout;
  onDiffLayoutChange: (layout: DiffLayout) => void;
  onSignIn?: () => void;
  onSetIdentity?: () => void;
  onOpenConflictResolver?: () => void;
  onOpenClone?: () => void;
}

export function EditorHeader({
  editorMode,
  onModeChange,
  onTimelineToggle,
  onSaveVersion,
  saving,
  previewEntry,
  restoring,
  restoreError,
  onExitPreview,
  onRestore,
  diffLayout,
  onDiffLayoutChange,
  onSignIn,
  onSetIdentity,
  onOpenConflictResolver,
  onOpenClone,
}: EditorHeaderProps) {
  const { activeDocName, activeProvider, activeTarget, closeDocument, pinnedDoc, pin, unpin } =
    useDocumentContext();
  const { state: sidebarState } = useSidebar();
  const syncStatus = useSyncStatus(activeProvider);
  const isConnected = syncStatus === 'connected' || syncStatus === 'synced';
  const sourceDisabled = !activeDocName || !isConnected;
  const isFolderTarget = activeTarget?.kind === 'folder';
  const isNewDoc = activeTarget?.kind === 'missing';
  const displayName = isFolderTarget
    ? `${activeTarget.folderPath}/`
    : activeDocName
      ? `${activeDocName}.md`
      : '';

  // Split doc path into prefix (truncatable) and filename (prioritized).
  // e.g. "reports/some-report/REPORT" → prefix="reports/some-report/" filename="REPORT"
  const pathPrefix = activeDocName?.includes('/')
    ? `${activeDocName.substring(0, activeDocName.lastIndexOf('/') + 1)}`
    : '';
  const fileBaseName = activeDocName
    ? activeDocName.substring(activeDocName.lastIndexOf('/') + 1)
    : '';
  const isPinned = pinnedDoc !== null;

  function togglePin() {
    if (!activeDocName) return;
    if (isPinned) unpin();
    else pin(activeDocName);
  }
  const isDiffMode = editorMode === 'diff';
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  // --- Inline rename state ---
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenameLoading, setIsRenameLoading] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const commitInProgressRef = useRef(false);
  // Set by cancelRename/reset-effect to block the blur→commitRename race
  // (unmounting a focused Input fires blur; this prevents commit-after-cancel).
  const cancelRequestedRef = useRef(false);
  // Captures activeDocName at rename entry to prevent wrong-doc rename
  // if the user navigates mid-rename and blur fires with the new doc's closure.
  const renameDocRef = useRef<string | null>(null);
  // Last normalized value the server (or network) rejected. Blocks re-POST of
  // the same value on every outside-click blur; the user must edit the input
  // (which clears this ref in onChange) to retry.
  const lastFailedValueRef = useRef<string | null>(null);

  // Exit rename mode when the active doc changes (e.g. navigation).
  // cancelRequestedRef suppresses the blur→commitRename race on unmount, and
  // is also checked post-await in commitRename to skip side effects if the user
  // navigated while a rename was in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeDocName is a trigger-only dep — the effect body only needs to re-run on change, not to read its value.
  useEffect(() => {
    cancelRequestedRef.current = true;
    renameDocRef.current = null;
    lastFailedValueRef.current = null;
    setIsRenaming(false);
    setRenameError(null);
  }, [activeDocName]);

  // Auto-focus and select when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      const timer = setTimeout(() => {
        const el = renameInputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isRenaming]);

  function enterRenameMode() {
    if (!activeDocName || isFolderTarget) return;
    const segments = activeDocName.split('/');
    cancelRequestedRef.current = false;
    renameDocRef.current = activeDocName;
    setRenameValue(segments[segments.length - 1]);
    setRenameError(null);
    lastFailedValueRef.current = null;
    setIsRenaming(true);
  }

  function cancelRename() {
    cancelRequestedRef.current = true;
    renameDocRef.current = null;
    lastFailedValueRef.current = null;
    setIsRenaming(false);
    setRenameValue('');
    setRenameError(null);
  }

  async function commitRename() {
    if (cancelRequestedRef.current) {
      cancelRequestedRef.current = false;
      return;
    }
    if (commitInProgressRef.current) return;

    // Use the doc name captured at rename entry to prevent wrong-doc rename
    // if activeDocName changed due to navigation mid-rename.
    const docName = renameDocRef.current;
    if (!docName) {
      cancelRename();
      return;
    }

    const normalized = normalizeRenameValue('file', renameValue);
    const segments = docName.split('/');
    const currentName = segments[segments.length - 1];

    // No-op: name unchanged
    if (normalized === currentName) {
      cancelRename();
      return;
    }

    // The server already rejected this exact value — don't re-POST on every
    // outside click. User must edit the input to clear lastFailedValueRef.
    if (normalized === lastFailedValueRef.current) return;

    // Validation
    if (!isValidNodeName(normalized)) {
      setRenameError('Name can’t be empty, ".", "..", or contain / or \\');
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
      const res = await fetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName: docName, newDocName }),
      });

      // Post-await cancel check: if the user navigated while the fetch was in
      // flight, the reset-effect already set cancelRequestedRef. Skip all side
      // effects (close/emit/hash-navigate) so we don't force the user away from
      // the doc they navigated to.
      if (cancelRequestedRef.current) {
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        return;
      }

      let raw: unknown;
      try {
        raw = await res.json();
      } catch (parseErr) {
        console.warn('[EditorHeader] rename response JSON parse failed', {
          parseErr,
          status: res.status,
          docName,
          newDocName,
        });
        setRenameError(`Server error (HTTP ${res.status})`);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        return;
      }

      if (!res.ok || !isRenameResponse(raw)) {
        const errorBody = raw as { error?: string } | null;
        console.warn('[EditorHeader] rename failed', {
          status: res.status,
          docName,
          newDocName,
        });
        setRenameError(errorBody?.error || `Server error (HTTP ${res.status})`);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        return;
      }

      if (!raw.ok) {
        setRenameError(raw.error || 'Failed to rename path');
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        return;
      }

      const renamed = raw.renamed;
      const nextActiveDocName = remapActiveDocName(docName, renamed);

      for (const entry of renamed) closeDocument(entry.fromDocName);
      emitDocumentsChanged(['files', 'backlinks', 'graph']);

      setIsRenaming(false);
      setRenameValue('');
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
      lastFailedValueRef.current = null;
      renameDocRef.current = null;

      if (nextActiveDocName && nextActiveDocName !== docName) {
        window.location.hash = hashFromDocName(nextActiveDocName);
      }
    } catch (err) {
      console.warn('[EditorHeader] rename failed', { err, docName, newDocName, normalized });
      setRenameError('Network error — please try again');
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
      lastFailedValueRef.current = normalized;
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: previewEntry is a prop; re-run on identity change is intentional
  useEffect(() => {
    setConfirmingRestore(false);
  }, [previewEntry]);

  function handleConfirmRestore() {
    setConfirmingRestore(false);
    onRestore();
  }

  return (
    <header className="flex h-12 shrink-0 items-center border-b">
      <div className="flex flex-1 items-center gap-1 px-3 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            {sidebarState === 'expanded' ? 'Hide Files' : 'Show Files'}
          </TooltipContent>
        </Tooltip>
        {typeof window !== 'undefined' && window.okDesktop ? (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 shrink-0 data-vertical:self-center"
            />
            <WorkspaceSwitcher bridge={window.okDesktop} />
          </>
        ) : null}
        <Separator orientation="vertical" className="mr-1 h-4 shrink-0 data-vertical:self-center" />
        {isFolderTarget ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="size-4 shrink-0" />
            <span className="truncate">{displayName}</span>
          </span>
        ) : activeDocName ? (
          <div className="flex min-w-0 items-center overflow-hidden">
            {/* Path prefix — shrinks first so filename stays visible */}
            {pathPrefix && (
              <span
                className="flex shrink items-center overflow-hidden text-sm text-muted-foreground/60 transition-[max-width,opacity] duration-200 ease-in-out"
                style={isRenaming ? { maxWidth: 0, opacity: 0 } : { maxWidth: '20rem', opacity: 1 }}
              >
                <span className="truncate">{pathPrefix.slice(0, -1)}</span>
                <span className="shrink-0 pl-2">/</span>
              </span>
            )}
            {isRenaming ? (
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    ref={renameInputRef}
                    value={renameValue}
                    disabled={isRenameLoading}
                    aria-label={`Rename ${activeDocName}`}
                    aria-invalid={renameError ? true : undefined}
                    aria-describedby={renameError ? 'editor-header-rename-error' : undefined}
                    aria-busy={isRenameLoading || undefined}
                    onChange={(e) => {
                      setRenameValue(e.target.value);
                      setRenameError(null);
                      lastFailedValueRef.current = null;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitRename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => void commitRename()}
                    className="h-7 min-w-0 flex-1 border-none bg-background text-sm shadow-none focus-visible:ring-0"
                  />
                  <span aria-hidden="true" className="shrink-0 text-xs text-muted-foreground/40">
                    .md
                  </span>
                </div>
                {renameError && (
                  <span
                    id="editor-header-rename-error"
                    role="alert"
                    className="text-xs text-destructive mt-0.5"
                  >
                    {renameError}
                  </span>
                )}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={enterRenameMode}
                className="h-7 shrink-0 px-2 text-sm font-normal text-muted-foreground hover:text-foreground"
              >
                {fileBaseName}.md
              </Button>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground truncate min-w-0">{displayName}</span>
        )}
        {activeDocName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0 text-muted-foreground"
                onClick={togglePin}
                aria-label={
                  isPinned
                    ? 'Unpin — resume following agent'
                    : 'Pin this doc — stop following agent'
                }
                aria-pressed={isPinned}
                data-pinned={isPinned ? 'true' : 'false'}
              >
                {isPinned ? (
                  <Pin className="size-4 text-foreground" fill="currentColor" />
                ) : (
                  <PinOff className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isPinned
                ? 'Pinned — click to resume following agent navigation'
                : 'Pin to stay on this doc — browser won’t auto-navigate to the agent’s current focus'}
            </TooltipContent>
          </Tooltip>
        )}
        {isNewDoc && <Badge variant="dashed">New file</Badge>}
      </div>

      {/* Normal editing mode: Visual/Markdown toggle */}
      {!isDiffMode && activeDocName && (
        <ToggleGroup
          type="single"
          value={editorMode === 'source' ? 'source' : 'visual'}
          onValueChange={(v) => {
            if (v) onModeChange(v === 'source' ? 'source' : 'wysiwyg');
          }}
          aria-label="Editor mode"
          variant="segmented"
          size="sm"
          spacing={1}
          className="bg-muted dark:bg-background p-0.5 rounded-lg shrink-0"
          disabled={!activeDocName}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <ToggleGroupItem
                  value="visual"
                  aria-label="Visual editor"
                  className="gap-1.5 text-xs"
                >
                  <Textbox className="size-4 text-muted-foreground" />
                  <span className="hidden md:inline">Visual</span>
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent className="md:hidden">Visual</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={sourceDisabled ? 0 : undefined}>
                <ToggleGroupItem
                  value="source"
                  aria-label="Markdown source"
                  className="gap-1.5 text-xs"
                  disabled={sourceDisabled}
                >
                  <Markdown className="size-4 text-muted-foreground" />
                  <span className="hidden md:inline">Markdown</span>
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            {sourceDisabled && !activeDocName ? null : sourceDisabled ? (
              <TooltipContent>
                Source mode requires a live connection — your edits are saved and will appear when
                you reconnect.
              </TooltipContent>
            ) : (
              <TooltipContent className="md:hidden">Markdown</TooltipContent>
            )}
          </Tooltip>
        </ToggleGroup>
      )}

      {/* Diff mode: layout toggle + controls (viewing banner is a separate row in EditorPane) */}
      {isDiffMode && previewEntry && !confirmingRestore && (
        <div className="flex items-center gap-2 shrink-0">
          {restoreError && <span className="text-xs text-destructive">{restoreError}</span>}
          <ToggleGroup
            type="single"
            value={diffLayout}
            onValueChange={(v) => {
              if (v) onDiffLayoutChange(v as DiffLayout);
            }}
            aria-label="Diff layout"
            variant="segmented"
            size="sm"
            spacing={1}
            className="bg-muted dark:bg-background p-0.5 rounded-lg shrink-0"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <ToggleGroupItem
                    value="unified"
                    aria-label="Unified diff"
                    className="gap-1 text-xs px-2"
                  >
                    <Rows2 className="size-3.5" />
                    <span className="hidden md:inline">Unified</span>
                  </ToggleGroupItem>
                </span>
              </TooltipTrigger>
              <TooltipContent className="md:hidden">Unified</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <ToggleGroupItem
                    value="split"
                    aria-label="Split diff"
                    className="gap-1 text-xs px-2"
                  >
                    <Columns2 className="size-3.5" />
                    <span className="hidden md:inline">Split</span>
                  </ToggleGroupItem>
                </span>
              </TooltipTrigger>
              <TooltipContent className="md:hidden">Split</TooltipContent>
            </Tooltip>
          </ToggleGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" onClick={() => setConfirmingRestore(true)}>
                <RotateCcw className="size-3.5 md:hidden" />
                <span className="hidden md:inline">Restore</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="md:hidden">Restore</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" onClick={onExitPreview}>
                <X className="size-3.5 md:hidden" />
                <span className="hidden md:inline">Exit preview</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="md:hidden">Exit preview</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Restore confirmation */}
      {isDiffMode && previewEntry && confirmingRestore && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            Replace current content with this version?
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setConfirmingRestore(false)}
            disabled={restoring}
          >
            Cancel
          </Button>
          <Button variant="default" size="xs" onClick={handleConfirmRestore} disabled={restoring}>
            {restoring ? 'Restoring…' : 'Restore'}
          </Button>
        </div>
      )}

      <div className="flex flex-1 items-center justify-end gap-2 px-3">
        {!isDiffMode && onOpenClone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clone from GitHub"
                onClick={onOpenClone}
                className="text-muted-foreground"
              >
                <GitFork className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clone from GitHub…</TooltipContent>
          </Tooltip>
        )}
        {!isDiffMode && activeDocName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Checkpoint version"
                onClick={onSaveVersion}
                disabled={saving}
                className="text-muted-foreground"
              >
                <Save className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{saving ? 'Saving…' : 'Checkpoint version'}</TooltipContent>
          </Tooltip>
        )}
        {activeDocName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Document timeline"
                onClick={onTimelineToggle}
              >
                <History className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Document timeline</TooltipContent>
          </Tooltip>
        )}
        <SyncStatusBadge
          onSignIn={onSignIn}
          onSetIdentity={onSetIdentity}
          onOpenConflictResolver={onOpenConflictResolver}
        />
        <PresenceBar />
        <Separator orientation="vertical" className="h-4 shrink-0 data-vertical:self-center" />
        <ThemeToggle />
      </div>
    </header>
  );
}
