import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { ArrowDownToLine, Columns2, FolderOpen, History, Pin, PinOff, Rows2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  buildRenamedNodePath,
  isValidNodeName,
  normalizeRenameValue,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { PresenceBar } from '@/presence/PresenceBar';
import { useSyncStatus } from '@/presence/use-sync-status';
import type { DiffLayout } from './DiffView';
import type { EditorMode } from './EditorPane';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';
import { ThemeToggle } from './ThemeToggle';
import { displayAuthor, formatRelativeTime } from './TimelinePanel';

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
}: EditorHeaderProps) {
  const { activeDocName, activeProvider, activeTarget, closeDocument, pinnedDoc, pin, unpin } =
    useDocumentContext();
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

  // Exit rename mode when the active doc changes (e.g. navigation)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset rename on doc change
  useEffect(() => {
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
    setRenameValue(segments[segments.length - 1]);
    setRenameError(null);
    setIsRenaming(true);
  }

  function cancelRename() {
    setIsRenaming(false);
    setRenameValue('');
    setRenameError(null);
  }

  async function commitRename() {
    if (commitInProgressRef.current) return;
    if (!activeDocName) {
      cancelRename();
      return;
    }

    const normalized = normalizeRenameValue('file', renameValue);
    const segments = activeDocName.split('/');
    const currentName = segments[segments.length - 1];

    // No-op: name unchanged
    if (normalized === currentName) {
      cancelRename();
      return;
    }

    // Validation
    if (!isValidNodeName(normalized)) {
      setRenameError('Invalid name — cannot be empty, ".", "..", or contain "/" or "\\"');
      return;
    }

    const newDocName = buildRenamedNodePath(
      { kind: 'file', path: activeDocName, name: currentName },
      normalized,
    );

    commitInProgressRef.current = true;
    setIsRenameLoading(true);
    setRenameError(null);

    try {
      const res = await fetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName: activeDocName, newDocName }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setRenameError(data.error ?? 'Failed to rename');
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        return;
      }

      const renamed: Array<{ fromDocName: string; toDocName: string }> = Array.isArray(data.renamed)
        ? data.renamed
        : [];
      const nextActiveDocName = remapActiveDocName(activeDocName, renamed);

      for (const entry of renamed) closeDocument(entry.fromDocName);
      emitDocumentsChanged(['files', 'backlinks', 'graph']);

      setIsRenaming(false);
      setRenameValue('');
      setIsRenameLoading(false);
      commitInProgressRef.current = false;

      if (nextActiveDocName && nextActiveDocName !== activeDocName) {
        window.location.hash = `#/${nextActiveDocName}`;
      }
    } catch (_err) {
      setRenameError('Network error — please try again');
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
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
        <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
        <Separator orientation="vertical" className="mr-1 h-4 shrink-0 data-vertical:self-center" />
        {isFolderTarget ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="size-4 shrink-0" />
            <span className="truncate">{displayName}</span>
          </span>
        ) : isRenaming && activeDocName ? (
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-0">
              <Input
                ref={renameInputRef}
                value={renameValue}
                disabled={isRenameLoading}
                aria-label="Rename file"
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  setRenameError(null);
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
                className="h-7 min-w-0 flex-1 bg-background text-sm"
              />
              <span className="shrink-0 text-xs text-muted-foreground/40">.md</span>
            </div>
            {renameError && <span className="text-xs text-destructive mt-0.5">{renameError}</span>}
          </div>
        ) : activeDocName ? (
          <button
            type="button"
            onClick={enterRenameMode}
            className="text-sm text-muted-foreground truncate min-w-0 cursor-pointer hover:text-foreground transition-colors bg-transparent border-none p-0"
          >
            {displayName}
          </button>
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
        {isNewDoc && (
          <span className="ml-1.5 shrink-0 rounded border border-dashed border-blue-400/50 px-1.5 py-0.5 text-xs text-blue-500 dark:border-blue-400/40 dark:text-blue-400">
            New file
          </span>
        )}
        {isFolderTarget && (
          <span className="ml-1.5 shrink-0 rounded border border-dashed border-emerald-400/50 px-1.5 py-0.5 text-xs text-emerald-600 dark:border-emerald-400/40 dark:text-emerald-400">
            Folder overview
          </span>
        )}
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
          <ToggleGroupItem value="visual" aria-label="Visual editor" className="gap-1.5 text-xs">
            <Textbox className="size-4 text-muted-foreground" />
            Visual
          </ToggleGroupItem>
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
                  Markdown
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            {sourceDisabled && !activeDocName ? null : sourceDisabled ? (
              <TooltipContent>
                Source mode requires a live connection — your edits are saved and will appear when
                you reconnect.
              </TooltipContent>
            ) : null}
          </Tooltip>
        </ToggleGroup>
      )}

      {/* Diff mode: version label + layout toggle + controls */}
      {isDiffMode && previewEntry && !confirmingRestore && (
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs ${restoreError ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {restoreError ||
              `Viewing: ${formatRelativeTime(previewEntry.timestamp)} — ${displayAuthor(previewEntry)}`}
          </span>
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
            <ToggleGroupItem
              value="unified"
              aria-label="Unified diff"
              className="gap-1 text-xs px-2"
            >
              <Rows2 className="size-3.5" />
              Unified
            </ToggleGroupItem>
            <ToggleGroupItem value="split" aria-label="Split diff" className="gap-1 text-xs px-2">
              <Columns2 className="size-3.5" />
              Split
            </ToggleGroupItem>
          </ToggleGroup>
          <Button variant="ghost" size="xs" onClick={() => setConfirmingRestore(true)}>
            Restore
          </Button>
          <Button variant="ghost" size="xs" onClick={onExitPreview}>
            Exit preview
          </Button>
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
        {!isDiffMode && activeDocName && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Save Version"
            onClick={onSaveVersion}
            disabled={saving}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <ArrowDownToLine className="size-3.5" />
            {saving ? 'Saving…' : 'Save Version'}
          </Button>
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
        <PresenceBar />
        <Separator orientation="vertical" className="h-4 shrink-0 data-vertical:self-center" />
        <ThemeToggle />
      </div>
    </header>
  );
}
