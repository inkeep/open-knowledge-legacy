import { ChevronDown, ChevronRight, Rewind, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { FileData } from '@/lib/use-activity-panel';
import { ActivityPanelBurstRow } from './ActivityPanelBurstRow';

interface ActivityPanelFileRowProps {
  file: FileData;
  sessionAlive: boolean;
  isWriting: boolean;
  onNavigate: (docName: string) => void;
  onUndoLast: (docName: string) => void | Promise<void>;
  onUndoAll: (docName: string) => void | Promise<void>;
  fetchBurstDiff: (docName: string, stackIndex: number) => Promise<string>;
}

function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  const hours = Math.round(diff / 3_600_000);
  return `${hours}h ago`;
}

export function ActivityPanelFileRow({
  file,
  sessionAlive,
  isWriting,
  onNavigate,
  onUndoLast,
  onUndoAll,
  fetchBurstDiff,
}: ActivityPanelFileRowProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [undoInFlight, setUndoInFlight] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (file.bursts.length === 0) return null;

  const disabled = !sessionAlive || file.bursts.length === 0 || undoInFlight;
  const disabledReason = !sessionAlive
    ? 'Session ended — undo unavailable'
    : file.bursts.length === 0
      ? 'Nothing to undo on this file'
      : null;

  const handleUndoLast = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (disabled) return;
    setUndoInFlight(true);
    Promise.resolve(onUndoLast(file.docName)).finally(() => setUndoInFlight(false));
  };

  const handleUndoAllClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (disabled) return;
    setConfirmOpen(true);
  };

  const handleUndoAllConfirm = (): void => {
    setConfirmOpen(false);
    if (disabled) return;
    setUndoInFlight(true);
    Promise.resolve(onUndoAll(file.docName)).finally(() => setUndoInFlight(false));
  };

  return (
    <div className="border-b border-border" data-testid="activity-panel-file-row">
      {/* Header row: carrot | filename | undo-last | undo-all | stat | ts | writing. */}
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${file.docName}` : `Expand ${file.docName}`}
          data-testid="activity-panel-file-row-carrot"
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onNavigate(file.docName)}
          className="min-w-0 flex-1 truncate text-left text-foreground hover:underline focus-visible:outline-ring"
          aria-label={`Navigate to ${file.docName}`}
          data-testid="activity-panel-file-row-filename"
          title={file.docName}
        >
          {file.docName}
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={handleUndoLast}
              disabled={disabled}
              aria-label={`Undo last edit on ${file.docName}`}
              data-testid="activity-panel-undo-last"
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{disabledReason ?? 'Undo last edit'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={handleUndoAllClick}
              disabled={disabled}
              aria-label={`Undo all edits on ${file.docName}`}
              data-testid="activity-panel-undo-all"
            >
              <Rewind className="size-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{disabledReason ?? 'Undo all edits'}</TooltipContent>
        </Tooltip>
        <span className="shrink-0 font-mono text-xs">
          <span className="text-green-600 dark:text-green-400">+{file.additionsTotal}</span>{' '}
          <span className="text-red-600 dark:text-red-400">−{file.deletionsTotal}</span>
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {formatRelative(file.lastTs, now)}
        </span>
        {isWriting ? (
          <span className="shrink-0 text-[11px] text-primary animate-pulse" role="status">
            writing…
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div>
          {file.bursts.map((burst) => (
            <ActivityPanelBurstRow
              key={`${file.docName}:${burst.stackIndex}`}
              burst={burst}
              docName={file.docName}
              fetchBurstDiff={fetchBurstDiff}
            />
          ))}
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Undo all edits on this file?</DialogTitle>
            <DialogDescription>
              This will revert every change this agent has made to{' '}
              <span className="font-mono text-foreground">{file.docName}</span> in their current
              session ({file.bursts.length} burst
              {file.bursts.length === 1 ? '' : 's'}). Other files and other writers are not
              affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              data-testid="activity-panel-undo-all-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleUndoAllConfirm}
              data-testid="activity-panel-undo-all-confirm"
            >
              Undo all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
