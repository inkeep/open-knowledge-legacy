import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { DiffView } from './DiffView';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

interface ConflictEntry {
  file: string;
  detectedAt: string;
  oursSha?: string;
  theirsSha?: string;
}

type ResolveStrategy = 'mine' | 'theirs' | 'content';

interface ConflictsFetchResult {
  conflicts: ConflictEntry[];
  error?: 'network' | 'server';
}

async function fetchConflicts(): Promise<ConflictsFetchResult> {
  try {
    const res = await fetch('/api/sync/conflicts');
    if (!res.ok) return { conflicts: [], error: 'server' };
    const data = (await res.json()) as { conflicts?: ConflictEntry[] };
    return { conflicts: data.conflicts ?? [] };
  } catch {
    return { conflicts: [], error: 'network' };
  }
}

interface ConflictSides {
  ours: string;
  theirs: string;
  base: string;
}

async function fetchConflictSides(file: string): Promise<ConflictSides> {
  try {
    const res = await fetch(`/api/sync/conflict-content?file=${encodeURIComponent(file)}`);
    if (!res.ok) return { ours: '', theirs: '', base: '' };
    const data = (await res.json()) as Partial<ConflictSides>;
    return {
      ours: data.ours ?? '',
      theirs: data.theirs ?? '',
      base: data.base ?? '',
    };
  } catch {
    return { ours: '', theirs: '', base: '' };
  }
}

async function resolveConflict(
  file: string,
  strategy: ResolveStrategy,
  content?: string,
): Promise<boolean> {
  try {
    const body: { file: string; strategy: ResolveStrategy; content?: string } = {
      file,
      strategy,
    };
    if (content !== undefined) body.content = content;
    const res = await fetch('/api/sync/resolve-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface ManualResolveDialogProps {
  file: string;
  onResolve: (content: string) => void;
  onAbort: () => void;
}

const DIALOG_SIZE_CLASSES = 'w-[98vw] !max-w-[98vw] h-[96vh] flex flex-col gap-0 sm:!max-w-[98vw]';

function ManualResolveDialog({ file, onResolve, onAbort }: ManualResolveDialogProps) {
  const [sides, setSides] = useState<ConflictSides | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchConflictSides(file).then((result) => {
      if (!cancelled) setSides(result);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (sides === null) {
    return (
      <Dialog open onOpenChange={(o) => !o && onAbort()}>
        <DialogContent className={DIALOG_SIZE_CLASSES}>
          <DialogHeader className="shrink-0">
            <DialogTitle>Resolving: {file}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onAbort()}>
      <DialogContent className={`${DIALOG_SIZE_CLASSES} p-0`}>
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm font-medium">Resolving: {file}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Red = your version (ours). Green = team&apos;s version (theirs). Accept each hunk to
            take theirs, reject to keep yours, then save.
          </p>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <DiffView
            oldContent={sides.ours}
            newContent={sides.theirs}
            layout="unified"
            conflictMode
            onResolve={onResolve}
            onAbort={onAbort}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ConflictResolverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConflictResolver({ open, onOpenChange }: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [fetchError, setFetchError] = useState<'network' | 'server' | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [manualFile, setManualFile] = useState<string | null>(null);

  function refresh() {
    void fetchConflicts().then(({ conflicts: list, error }) => {
      setFetchError(error ?? null);
      setConflicts(list);
      setResolved((prev) => {
        const stillPresent = new Set(list.map((e) => e.file));
        return new Set([...prev].filter((f) => !stillPresent.has(f)));
      });
    });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is intentionally stable
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is intentionally stable
  useEffect(() => {
    return subscribeToDocumentsChanged((channels) => {
      if (channels.includes('sync-status') && open) {
        refresh();
      }
    });
  }, [open]);

  useEffect(() => {
    if (open && conflicts.length > 0 && resolved.size >= conflicts.length) {
      toast.success('All conflicts resolved — sync resuming');
      onOpenChange(false);
      setResolved(new Set());
    }
  }, [open, conflicts.length, resolved.size, onOpenChange]);

  async function handleResolve(file: string, strategy: ResolveStrategy, content?: string) {
    setResolving((prev) => new Set([...prev, file]));
    const ok = await resolveConflict(file, strategy, content);
    setResolving((prev) => {
      const next = new Set(prev);
      next.delete(file);
      return next;
    });
    if (ok) {
      setResolved((prev) => new Set([...prev, file]));
    } else {
      toast.error(`Failed to resolve ${file}`);
    }
  }

  function handleManual(file: string) {
    setManualFile(file);
  }

  async function handleManualResolve(content: string) {
    if (!manualFile) return;
    const file = manualFile;
    setManualFile(null);
    await handleResolve(file, 'content', content);
  }

  function handleManualAbort() {
    setManualFile(null);
  }

  async function handleAbort() {
    try {
      const res = await fetch('/api/sync/abort-merge', { method: 'POST' });
      if (res.ok) {
        toast.info('Merge aborted — sync paused');
      } else {
        toast.error('Failed to abort merge');
      }
    } catch {
      toast.error('Failed to abort merge — connection error');
    }
    onOpenChange(false);
    setResolved(new Set());
  }

  const total = conflicts.length;
  const resolvedCount = resolved.size;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-80 sm:w-96 flex flex-col gap-0 p-0">
          <SheetHeader className="px-4 py-3 border-b shrink-0">
            <SheetTitle className="text-sm font-medium">Resolve conflicts</SheetTitle>
            {total > 0 && (
              <p className="text-xs text-muted-foreground">
                {resolvedCount} of {total} resolved
              </p>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto subtle-scrollbar">
            {fetchError ? (
              <div className="px-4 py-6 text-sm text-center space-y-2">
                <p className="text-destructive">
                  {fetchError === 'network'
                    ? 'Could not reach the sync server — check your connection.'
                    : 'Sync server error — try again in a moment.'}
                </p>
                <Button variant="outline" size="sm" onClick={refresh}>
                  Retry
                </Button>
              </div>
            ) : conflicts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                No conflicts found.
              </p>
            ) : (
              <ul className="divide-y">
                {conflicts.map((entry) => {
                  const isResolved = resolved.has(entry.file);
                  const isResolving = resolving.has(entry.file);
                  const filename = entry.file.split('/').pop() ?? entry.file;
                  return (
                    <li key={entry.file} className={`px-4 py-3 ${isResolved ? 'opacity-50' : ''}`}>
                      <p className="text-sm font-medium truncate mb-2" title={entry.file}>
                        {isResolved ? '✓ ' : ''}
                        {filename}
                      </p>
                      {!isResolved && (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={isResolving}
                            onClick={() => void handleResolve(entry.file, 'mine')}
                          >
                            Keep my version
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={isResolving}
                            onClick={() => void handleResolve(entry.file, 'theirs')}
                          >
                            Keep team&apos;s version
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={isResolving}
                            onClick={() => handleManual(entry.file)}
                          >
                            Resolve manually
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-3 border-t shrink-0">
            <Button variant="ghost" size="sm" className="w-full" onClick={handleAbort}>
              Exit merge
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {manualFile && (
        <ManualResolveDialog
          file={manualFile}
          onResolve={(content) => void handleManualResolve(content)}
          onAbort={handleManualAbort}
        />
      )}
    </>
  );
}
