/**
 * TimelinePanel — right-side Sheet showing document edit history.
 *
 * Fetches GET /api/history on open, polls every 10s while open.
 * Checkpoint entries are always visible; WIP entries between checkpoints
 * are collapsed behind a "Show N auto-saves" expander.
 * Current (pre-checkpoint) WIP entries are expanded by default at top.
 */
import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { ChevronDown, ChevronRight, Diamond, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

interface TimelinePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docName: string;
  onEntrySelect?: (entry: TimelineEntry) => void;
  selectedSha?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins} min ago`;
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return `${hrs}h ago`;
  }
  if (diffSec < 86400 * 2) return 'yesterday';
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

/** Map internal author names to user-friendly display names. */
export function displayAuthor(entry: TimelineEntry): string {
  if (entry.type === 'upstream') return 'Upstream sync';
  if (entry.author === 'openknowledge-server' || entry.author === 'server') return 'Auto-save';
  return entry.author;
}

/** Dot color by entry type / author heuristic. */
function getAuthorColor(entry: TimelineEntry): string {
  if (entry.type === 'upstream') return 'bg-muted-foreground/50';
  if (entry.authorEmail.includes('openknowledge.local') || entry.type === 'wip') {
    // Agent writes typically have openknowledge.local domain
    if (
      entry.authorEmail.includes('agent') ||
      entry.author.includes('agent') ||
      entry.authorEmail.includes('cursor') ||
      entry.authorEmail.includes('claude')
    ) {
      return 'bg-[--color-agent]';
    }
  }
  // Human = blue
  return 'bg-[--color-azure-blue]';
}

function authorDot(entry: TimelineEntry) {
  const color = getAuthorColor(entry);
  return (
    <span aria-hidden="true" className={`inline-block size-2 rounded-full shrink-0 ${color}`} />
  );
}

// ─── WIP Group component ──────────────────────────────────────────────────────

interface WipGroupProps {
  entries: TimelineEntry[];
  defaultExpanded: boolean;
  selectedSha?: string;
  onSelect?: (entry: TimelineEntry) => void;
}

function WipGroup({ entries, defaultExpanded, selectedSha, onSelect }: WipGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex items-center gap-1 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {expanded
          ? `Hide ${entries.length} auto-save${entries.length > 1 ? 's' : ''}`
          : `Show ${entries.length} auto-save${entries.length > 1 ? 's' : ''}`}
      </button>
      {expanded &&
        entries.map((entry) => (
          <EntryRow
            key={entry.sha}
            entry={entry}
            selected={entry.sha === selectedSha}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

// ─── Entry row ────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: TimelineEntry;
  selected: boolean;
  onSelect?: (entry: TimelineEntry) => void;
  prominent?: boolean;
}

function EntryRow({ entry, selected, onSelect, prominent = false }: EntryRowProps) {
  const relative = formatRelativeTime(entry.timestamp);

  return (
    <button
      type="button"
      className={[
        'group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors',
        selected ? 'bg-muted' : 'hover:bg-muted/40',
        prominent ? 'border-b border-border/50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect?.(entry)}
    >
      {prominent ? (
        <Diamond className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <div className="mt-1.5 flex shrink-0 items-center">{authorDot(entry)}</div>
      )}

      <div className="min-w-0 flex-1">
        {prominent && (
          <div className="mb-0.5 flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground">Save Version</span>
            {authorDot(entry)}
            <span className="truncate text-xs text-muted-foreground">{entry.author}</span>
          </div>
        )}
        {!prominent && <p className="truncate text-xs text-foreground">{entry.author}</p>}
        <p className="truncate text-xs text-muted-foreground" title={entry.message}>
          {entry.message}
        </p>
      </div>

      <time
        className="shrink-0 text-xs text-muted-foreground"
        dateTime={entry.timestamp}
        title={entry.timestamp}
      >
        {relative}
      </time>
    </button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function TimelinePanel({
  open,
  onOpenChange,
  docName,
  onEntrySelect,
  selectedSha,
}: TimelinePanelProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch on open, poll while open
  useEffect(() => {
    if (!open) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    async function fetchHistory() {
      if (!docName) return;
      try {
        const res = await fetch(`/api/history?docName=${encodeURIComponent(docName)}&limit=100`);
        if (!res.ok) {
          setError('History unavailable');
          return;
        }
        const data = (await res.json()) as { entries: TimelineEntry[] };
        setEntries(data.entries ?? []);
        setError(null);
      } catch (e) {
        setError('History unavailable');
        console.error('[timeline]', e);
      }
    }

    setLoading(true);
    fetchHistory().finally(() => setLoading(false));
    intervalRef.current = setInterval(fetchHistory, 10_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, docName]);

  // ── Group entries ──────────────────────────────────────────────────────────

  // Split entries into: pre-checkpoint WIP (top, expanded) and groups between checkpoints
  const groups: Array<
    | { kind: 'checkpoint'; entry: TimelineEntry }
    | { kind: 'wip-group'; entries: TimelineEntry[]; isPreCheckpoint: boolean }
  > = [];

  let pendingWip: TimelineEntry[] = [];
  let hasSeenCheckpoint = false;

  for (const entry of entries) {
    if (entry.type === 'checkpoint') {
      if (pendingWip.length > 0) {
        groups.push({
          kind: 'wip-group',
          entries: pendingWip,
          isPreCheckpoint: !hasSeenCheckpoint,
        });
        pendingWip = [];
      }
      groups.push({ kind: 'checkpoint', entry });
      hasSeenCheckpoint = true;
    } else {
      pendingWip.push(entry);
    }
  }
  if (pendingWip.length > 0) {
    groups.push({
      kind: 'wip-group',
      entries: pendingWip,
      isPreCheckpoint: !hasSeenCheckpoint,
    });
  }

  const hasNoCheckpoints = !entries.some((e) => e.type === 'checkpoint');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[350px] p-0 flex flex-col overflow-hidden sm:max-w-[350px]"
        showCloseButton
      >
        <SheetHeader className="border-b px-4 py-3 pb-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm">Timeline</SheetTitle>
            {selectedSha && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  onEntrySelect?.({
                    sha: '',
                    timestamp: '',
                    author: '',
                    authorEmail: '',
                    type: 'wip',
                    message: '',
                    contributors: [],
                  })
                }
                className="text-xs text-muted-foreground"
              >
                Now
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Loading skeleton */}
          {loading && (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Skeleton className="size-3.5 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="px-4 py-3">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && entries.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground">No history yet</p>
            </div>
          )}

          {/* Flat list when no checkpoints */}
          {!loading && !error && hasNoCheckpoints && entries.length > 0 && (
            <div className="flex flex-col">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.sha}
                  entry={entry}
                  selected={entry.sha === selectedSha}
                  onSelect={onEntrySelect}
                />
              ))}
            </div>
          )}

          {/* Grouped list with checkpoints */}
          {!loading && !error && !hasNoCheckpoints && (
            <div className="flex flex-col">
              {groups.map((group, idx) => {
                if (group.kind === 'checkpoint') {
                  return (
                    <EntryRow
                      key={group.entry.sha}
                      entry={group.entry}
                      selected={group.entry.sha === selectedSha}
                      onSelect={onEntrySelect}
                      prominent
                    />
                  );
                }
                // wip-group
                return (
                  <WipGroup
                    key={group.entries[0]?.sha ?? `wip-${idx}`}
                    entries={group.entries}
                    defaultExpanded={group.isPreCheckpoint}
                    selectedSha={selectedSha}
                    onSelect={onEntrySelect}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Restore hint when entry selected */}
        {selectedSha && (
          <div className="border-t p-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Viewing historical version</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                onEntrySelect?.({
                  sha: '',
                  timestamp: '',
                  author: '',
                  authorEmail: '',
                  type: 'wip',
                  message: '',
                  contributors: [],
                })
              }
            >
              <RotateCcw className="size-3" />
              Exit
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
