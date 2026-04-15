import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { Clock, Columns2, Pin, PinOff, Rows2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
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
  const { activeDocName, activeProvider, pinnedDoc, pin, unpin } = useDocumentContext();
  const syncStatus = useSyncStatus(activeProvider);
  const isConnected = syncStatus === 'connected' || syncStatus === 'synced';
  const sourceDisabled = !activeDocName || !isConnected;

  const displayName = activeDocName ? `${activeDocName}.md` : 'No document';
  const isPinned = pinnedDoc !== null;

  function togglePin() {
    if (!activeDocName) return;
    if (isPinned) unpin();
    else pin(activeDocName);
  }
  const isDiffMode = editorMode === 'diff';
  const [confirmingRestore, setConfirmingRestore] = useState(false);

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
        <span className="text-sm text-muted-foreground truncate min-w-0">{displayName}</span>
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
                ? 'Pinned — click to resume following agent nav'
                : 'Pin to stay here while agent works elsewhere'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Normal editing mode: Visual/Markdown toggle */}
      {!isDiffMode && (
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
        {!isDiffMode && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Save Version"
            onClick={onSaveVersion}
            disabled={saving}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <Save className="size-3.5" />
            {saving ? 'Saving…' : 'Save Version'}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open timeline"
          onClick={onTimelineToggle}
        >
          <Clock className="size-4" />
        </Button>
        <PresenceBar />
        <Separator orientation="vertical" className="h-4 shrink-0 data-vertical:self-center" />
        <ThemeToggle />
      </div>
    </header>
  );
}
