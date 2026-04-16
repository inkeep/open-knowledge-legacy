/**
 * ConflictResolver — right-side Sheet for resolving merge conflicts.
 *
 * Lists conflicted files from GET /api/sync/conflicts. Per-file actions:
 *   - Keep my version  → POST /api/sync/resolve-conflict { strategy: 'mine' }
 *   - Keep team's version → POST /api/sync/resolve-conflict { strategy: 'theirs' }
 *   - Resolve manually → placeholder toast (DiffView conflict mode in US-025)
 *
 * Progress shows "N of M resolved". "Exit merge" aborts and closes.
 * When all files are resolved the sheet closes with a success toast.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

interface ConflictEntry {
  file: string;
  detectedAt: string;
}

type ResolveStrategy = 'mine' | 'theirs';

async function fetchConflicts(): Promise<ConflictEntry[]> {
  try {
    const res = await fetch('/api/sync/conflicts');
    if (!res.ok) return [];
    return (await res.json()) as ConflictEntry[];
  } catch {
    return [];
  }
}

async function resolveConflict(file: string, strategy: ResolveStrategy): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/resolve-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, strategy }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface ConflictResolverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConflictResolver({ open, onOpenChange }: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<Set<string>>(new Set());

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

  async function handleResolve(file: string, strategy: ResolveStrategy) {
    setResolving((prev) => new Set([...prev, file]));
    const ok = await resolveConflict(file, strategy);
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
    toast.info(`Manual resolution for ${file} — coming in a future update`);
  }

  function handleAbort() {
    onOpenChange(false);
    setResolved(new Set());
    toast.info('Exited merge — conflicts remain unresolved');
  }

  const total = conflicts.length;
  const resolvedCount = resolved.size;

  return (
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
  );
}
