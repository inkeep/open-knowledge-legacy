/**
 * ConflictResolver — right-side Sheet for resolving merge conflicts.
 *
 * Lists conflicted files from GET /api/sync/conflicts. Per-file actions:
 *   - Keep my version  → POST /api/sync/resolve-conflict { strategy: 'mine' }
 *   - Keep team's version → POST /api/sync/resolve-conflict { strategy: 'theirs' }
 *   - Resolve manually → opens DiffView in conflictMode (US-025)
 *
 * Progress shows "N of M resolved". "Exit merge" aborts and closes.
 * When all files are resolved the sheet closes with a success toast.
 */
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

async function fetchConflicts(): Promise<ConflictEntry[]> {
  try {
    const res = await fetch('/api/sync/conflicts');
    if (!res.ok) return [];
    return (await res.json()) as ConflictEntry[];
  } catch {
    return [];
  }
}

async function fetchDocumentContent(file: string): Promise<string> {
  try {
    // Strip leading path and .md extension to get docName
    const docName = file.replace(/\.md$/, '');
    const res = await fetch(`/api/document?docName=${encodeURIComponent(docName)}`);
    if (!res.ok) return '';
    const data = (await res.json()) as { content?: string };
    return data.content ?? '';
  } catch {
    return '';
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

function ManualResolveDialog({ file, onResolve, onAbort }: ManualResolveDialogProps) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    void fetchDocumentContent(file).then(setContent);
  }, [file]);

  if (content === null) {
    return (
      <Dialog open onOpenChange={(o) => !o && onAbort()}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
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
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 shrink-0">
          <DialogTitle className="text-sm font-medium">Resolving: {file}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Accept or reject each hunk, then confirm the merged result.
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <DiffView
            oldContent=""
            newContent={content}
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
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [manualFile, setManualFile] = useState<string | null>(null);

  function refresh() {
    void fetchConflicts().then((list) => {
      setConflicts(list);
      // Remove resolved entries that no longer appear in the list
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

  // Auto-close when all conflicts resolved
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

  function handleAbort() {
    onOpenChange(false);
    setResolved(new Set());
    toast.info('Exited merge — conflicts remain unresolved');
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

          <div className="flex-1 overflow-y-auto">
            {conflicts.length === 0 ? (
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
