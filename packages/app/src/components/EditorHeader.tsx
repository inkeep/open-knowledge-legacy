import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDocumentContext } from '@/editor/DocumentContext';
import { AgentUndoButton } from '@/presence/AgentUndoButton';
import { PresenceBar } from '@/presence/PresenceBar';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';
import { ThemeToggle } from './ThemeToggle';
import type { TimelineEntry } from './TimelinePanel';
import { displayAuthor, formatRelativeTime } from './TimelinePanel';

interface EditorHeaderProps {
  isSourceMode: boolean;
  onSourceModeChange: (value: boolean) => void;
  onTimelineToggle: () => void;
  previewEntry: TimelineEntry | null;
  restoring: boolean;
  restoreError: string | null;
  onExitPreview: () => void;
  onRestore: () => void;
}

export function EditorHeader({
  isSourceMode,
  onSourceModeChange,
  onTimelineToggle,
  previewEntry,
  restoring,
  restoreError,
  onExitPreview,
  onRestore,
}: EditorHeaderProps) {
  const { activeDocName } = useDocumentContext();

  const displayName = activeDocName ? `${activeDocName}.md` : 'No document';
  const isPreviewMode = previewEntry !== null && previewEntry.sha !== '';
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  // Reset confirmation state when the previewed entry changes.
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
      </div>

      {/* Normal editing mode: Visual/Markdown toggle */}
      {!isPreviewMode && (
        <ToggleGroup
          type="single"
          value={isSourceMode ? 'source' : 'visual'}
          onValueChange={(v) => {
            if (v) onSourceModeChange(v === 'source');
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
          <ToggleGroupItem value="source" aria-label="Markdown source" className="gap-1.5 text-xs">
            <Markdown className="size-4 text-muted-foreground" />
            Markdown
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {/* Preview mode: version label + controls */}
      {isPreviewMode && previewEntry && !confirmingRestore && (
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs ${restoreError ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {restoreError ||
              `Viewing: ${formatRelativeTime(previewEntry.timestamp)} — ${displayAuthor(previewEntry)}`}
          </span>
          <Button variant="ghost" size="xs" onClick={() => setConfirmingRestore(true)}>
            Restore
          </Button>
          <Button variant="ghost" size="xs" onClick={onExitPreview}>
            Exit preview
          </Button>
        </div>
      )}

      {/* Restore confirmation */}
      {isPreviewMode && previewEntry && confirmingRestore && (
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
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open timeline"
          onClick={onTimelineToggle}
        >
          <Clock className="size-4" />
        </Button>
        <PresenceBar />
        <AgentUndoButton />
        <Separator orientation="vertical" className="h-4 shrink-0 data-vertical:self-center" />
        <ThemeToggle />
      </div>
    </header>
  );
}
