/**
 * TimelinePanel — document edit history content for the DocPanel timeline tab.
 *
 * Fetches GET /api/history on mount, polls every 10s while mounted.
 * Checkpoint entries are always visible; WIP entries between checkpoints
 * are collapsed behind a "Show N auto-saves" expander.
 * Current (pre-checkpoint) WIP entries are expanded by default at top.
 *
 * Per-row UX (shape parity with AgentActivityPanel's burst rows):
 *   - Click anywhere on a row except the Restore icon → toggle inline expand.
 *     Expanded rows render <ActivityPanelDiffView> below the header showing
 *     the diff between that commit and the live Y.Text. Multi-expand is
 *     supported; the displayed diff is a snapshot at expand time.
 *   - The per-row Restore icon (lucide Undo2, ghost variant) sits in the row
 *     header and is always visible (collapsed and expanded states alike).
 *     Click → shadcn Dialog confirmation → POST /api/rollback. On success the
 *     row collapses and any other expanded rows from this mount also collapse
 *     — their cached `current` baseline is now stale.
 */
import {
  AGENT_ICON_COLORS,
  AGENT_ICON_COLORS_DARK,
  colorFromSeed,
  iconFromClientName,
  type TimelineEntry,
} from '@inkeep/open-knowledge-core';
import type { LucideProps } from 'lucide-react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Diamond,
  FileArchive,
  GitBranch,
  HardDrive,
  Loader2,
  Sparkles,
  Undo2,
  User,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { SVGProps } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ActivityPanelDiffView } from '@/components/ActivityPanelDiffView';
import type { DiffLayout } from '@/components/DiffView';
import { ClaudeIcon } from '@/components/icons/claude';
import { ClineIcon } from '@/components/icons/cline';
import { CodexIcon } from '@/components/icons/codex';
import { CopilotIcon } from '@/components/icons/copilot';
import { CursorIcon } from '@/components/icons/cursor';
import { WindsurfIcon } from '@/components/icons/windsurf';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HistoricalContentCache, useTimelineEntryDiff } from '@/lib/use-timeline-entry-diff';

// ─── Public props ────────────────────────────────────────────────────────────

interface TimelineContentProps {
  docName: string;
  diffLayout: DiffLayout;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
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

/** Map internal author names to user-friendly display names. Uses structured contributors when available. */
function displayAuthor(entry: TimelineEntry): string {
  if (entry.type === 'upstream') return 'Upstream sync';
  if (entry.contributors.length === 1) return entry.contributors[0].name;
  if (entry.contributors.length > 1) return entry.contributors.map((c) => c.name).join(', ');
  // Pre-attribution fallback
  if (entry.author === 'openknowledge-server' || entry.author === 'server') return 'Auto-save';
  return entry.author;
}

function AgentBrandIcon({ icon, ...props }: { icon?: string } & SVGProps<SVGSVGElement>) {
  if (icon === 'claude') return <ClaudeIcon {...props} />;
  if (icon === 'cursor') return <CursorIcon {...props} />;
  if (icon === 'windsurf') return <WindsurfIcon {...props} />;
  if (icon === 'openai') return <CodexIcon {...props} />;
  if (icon === 'cline') return <ClineIcon {...props} />;
  if (icon === 'github') return <CopilotIcon {...props} />;
  return <Sparkles strokeWidth={1.5} {...(props as LucideProps)} />;
}

/** Icon for a timeline entry contributor. Brand icons for agents, lucide icons for system writers. */
function ContributorIcon({ entry, isDark }: { entry: TimelineEntry; isDark: boolean }) {
  const iconClass = 'size-3.5 shrink-0 text-muted-foreground';

  if (entry.type === 'upstream') return <GitBranch className={iconClass} />;

  if (entry.contributors.length > 0) {
    const c = entry.contributors[0];
    const seed = c.colorSeed ?? c.name;
    const icon = iconFromClientName(seed);
    const brandColor = isDark
      ? (AGENT_ICON_COLORS_DARK[icon] ?? AGENT_ICON_COLORS[icon])
      : AGENT_ICON_COLORS[icon];
    const color = brandColor ?? colorFromSeed(seed);

    // Known agent brand → brand icon with brand color (dark override when available)
    if (icon !== 'bot') {
      return (
        <AgentBrandIcon icon={icon} width={14} height={14} className="shrink-0" style={{ color }} />
      );
    }

    // Classified system writers
    if (c.name === 'File System') return <HardDrive className={iconClass} />;
    if (c.name === 'Open Knowledge (service)' || c.name === 'Git (upstream)') {
      return <ArrowDownToLine className={iconClass} />;
    }

    // Human or unknown contributor
    return <User className={iconClass} />;
  }

  // Pre-attribution fallback
  if (
    entry.authorEmail.includes('agent') ||
    entry.author.includes('agent') ||
    entry.authorEmail.includes('cursor') ||
    entry.authorEmail.includes('claude')
  ) {
    return <Sparkles className={iconClass} />;
  }
  if (entry.author === 'openknowledge-server' || entry.author === 'server') {
    return <ArrowDownToLine className={iconClass} />;
  }
  return <User className={iconClass} />;
}

// ─── "Current version" pinned row ────────────────────────────────────────────

function CurrentVersionRow() {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-center w-3.5 h-3.5">
        <span className="inline-block size-2 rounded-full bg-emerald-500 shrink-0" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">Current version</p>
      </div>
    </div>
  );
}

// ─── WIP Group component ──────────────────────────────────────────────────────

interface WipGroupProps {
  entries: TimelineEntry[];
  defaultExpanded: boolean;
  isDark: boolean;
  diffLayout: DiffLayout;
  cache: HistoricalContentCache;
  docName: string;
  collapseAllSignal: number;
  onRestoreSuccess: () => void;
}

function WipGroup({
  entries,
  defaultExpanded,
  isDark,
  diffLayout,
  cache,
  docName,
  collapseAllSignal,
  onRestoreSuccess,
}: WipGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left"
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
            isDark={isDark}
            diffLayout={diffLayout}
            cache={cache}
            docName={docName}
            collapseAllSignal={collapseAllSignal}
            onRestoreSuccess={onRestoreSuccess}
          />
        ))}
    </div>
  );
}

// ─── Checkpoint kind → label + icon (bridge-correctness SPEC §6 R7c) ────────

type CheckpointVariant = 'save' | 'bridge-merge-loss' | 'external-change-rescue';

export function checkpointVariant(entry: TimelineEntry): CheckpointVariant {
  if (!entry.checkpoint) return 'save';
  return entry.checkpoint.kind;
}

export function checkpointHeadlineLabel(entry: TimelineEntry): string {
  const variant = checkpointVariant(entry);
  if (variant === 'save') return 'Save Version';
  const size = entry.checkpoint?.size ?? null;
  const sizeSuffix = size != null && size > 0 ? ` (${formatBytes(size)})` : '';
  if (variant === 'bridge-merge-loss') {
    return `Auto-saved before a concurrent edit${sizeSuffix}`;
  }
  return `Recovered from an external change${sizeSuffix}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / 104857.6) / 10} MB`;
}

// ─── Summary bullets (spec D16 + D25) ─────────────────────────────────────────
//
// Agent-provided summaries render as a collapsible bullet list under the author
// line. First bullet inline, further bullets behind a "Show N more" expander
// matching the existing WipGroup pattern.
// The doc-list line ALWAYS renders alongside (D16 — it stays ground truth;
// bullets enrich, they don't replace).

/**
 * Flatten summaries across contributors (D23 flat shape) preserving insertion
 * order. Multi-contributor commits coalesce into one flat list — per-bullet
 * contributor identity is deliberately deferred (NG4 / D26). Exported so the
 * test suite can lock the flatten invariant without touching React.
 */
export function allSummariesFor(entry: TimelineEntry): string[] {
  const out: string[] = [];
  for (const c of entry.contributors) {
    if (!c.summaries) continue;
    for (const s of c.summaries) out.push(s);
  }
  return out;
}

interface SummaryBulletsProps {
  summaries: string[];
}

/**
 * Collapsible bullet renderer. Default is collapsed so coalesced-heavy rows
 * don't dominate the panel. The expander is a real `<button>` — this works
 * because EntryRow is a `<div role="button">` (nested `<button>` inside a
 * `<button>` is invalid HTML; see EntryRow comment). The expander's
 * onClick stops propagation so the row's onSelect doesn't also fire.
 *
 * Markup shape: a SINGLE `<ul>` containing the always-visible first bullet
 * AND the expanded rest (conditionally rendered) — screen-reader list
 * navigation (VoiceOver rotor, JAWS list mode, NVDA) treats every bullet as
 * part of the same list instead of seeing the first as a free-floating
 * paragraph. The expander lives OUTSIDE the `<ul>` because `<button>` is not
 * a valid `<ul>` child per HTML spec.
 *
 * Keys combine the bullet's positional index with its text. The contributor
 * accumulator explicitly permits duplicate summaries within a debounce window
 * (`contributor-tracker.ts:87-91` — "No dedup: an agent may legitimately log
 * the same summary twice"), so a text-only key would collide on duplicates
 * and trigger React's "two children with the same key" warning + subtly wrong
 * reconciliation. The list is append-only with no reorder within a row, so a
 * positional component is safe.
 */
function SummaryBullets({ summaries }: SummaryBulletsProps) {
  const [expanded, setExpanded] = useState(false);
  // `useId` is React 19's idiomatic source for associating the expander
  // `<button aria-controls>` with its `<ul>` — each row instance gets its own
  // unique id, so multiple TimelinePanel rows mounted on one page don't
  // collide. NVDA and JAWS use this association to announce which region
  // just grew/shrank when the user activates "Show N more"; without it the
  // user only hears "expanded" with no cue about what changed.
  const listId = useId();
  if (summaries.length === 0) return null;
  const [first, ...rest] = summaries;
  return (
    <div className="mt-0.5">
      <ul id={listId} className="list-none">
        <li className="text-xs text-foreground/90">
          <span aria-hidden="true">• </span>
          {first}
        </li>
        {expanded &&
          rest.map((s, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: bullet list is append-only within a debounce window — no reorder, no insertion, no deletion. Index in the composite key is needed because contributor-tracker.ts:87-91 explicitly permits duplicate summaries (text-only key collides on dupes and breaks React reconciliation).
            <li key={`${idx}-${s}`} className="text-xs text-foreground/90">
              <span aria-hidden="true">• </span>
              {s}
            </li>
          ))}
      </ul>
      {rest.length > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((prev) => !prev);
          }}
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {expanded ? `Hide ${rest.length} more` : `Show ${rest.length} more`}
        </button>
      )}
    </div>
  );
}

// ─── Entry row ────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: TimelineEntry;
  prominent?: boolean;
  isDark: boolean;
  diffLayout: DiffLayout;
  cache: HistoricalContentCache;
  docName: string;
  collapseAllSignal: number;
  onRestoreSuccess: () => void;
}

function EntryRow({
  entry,
  prominent = false,
  isDark,
  diffLayout,
  cache,
  docName,
  collapseAllSignal,
  onRestoreSuccess,
}: EntryRowProps) {
  const relative = formatRelativeTime(entry.timestamp);
  const authorName = displayAuthor(entry);
  const allDocs = entry.contributors.flatMap((c) => c.docs);
  const allSummaries = allSummariesFor(entry);
  const [diffExpanded, setDiffExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { diff, status } = useTimelineEntryDiff(diffExpanded ? entry.sha : null, docName, cache);

  // Collapse this row whenever a restore succeeded elsewhere in the panel
  useEffect(() => {
    if (collapseAllSignal > 0) {
      setDiffExpanded(false);
    }
  }, [collapseAllSignal]);

  // Clear error timer on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const handleActivate = () => setDiffExpanded((prev) => !prev);

  async function handleRestore() {
    setRestoring(true);
    setRestoreError(null);
    try {
      const res = await fetch('/api/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName, commitSha: entry.sha }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setDiffExpanded(false);
        onRestoreSuccess();
      } else {
        const msg = 'Restore failed — document unchanged';
        setRestoreError(msg);
        toast.error(msg, { duration: 4000 });
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setRestoreError(null), 4000);
      }
    } catch {
      const msg = 'Restore failed — document unchanged';
      setRestoreError(msg);
      toast.error(msg, { duration: 4000 });
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setRestoreError(null), 4000);
    }
    setRestoring(false);
  }

  // Leading icon: checkpoint variants get special icons, others get contributor icon
  const leadingIcon = prominent ? (
    (() => {
      const variant = checkpointVariant(entry);
      if (variant === 'bridge-merge-loss') {
        return (
          <AlertTriangle
            className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
        );
      }
      if (variant === 'external-change-rescue') {
        return (
          <FileArchive
            className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400"
            aria-hidden="true"
          />
        );
      }
      return <Diamond className="size-3.5 shrink-0 text-muted-foreground" />;
    })()
  ) : (
    <ContributorIcon entry={entry} isDark={isDark} />
  );

  return (
    <>
      <div className="flex flex-col rounded-lg">
        {/* biome-ignore lint/a11y/useSemanticElements: row contains a nested SummaryBullets expander and a Restore <button>; native nested buttons inside a <button> are invalid HTML, so the row uses div[role=button] to preserve keyboard activation while allowing the nested interactive children. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={diffExpanded}
          data-testid="timeline-entry-expand"
          className={[
            'group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
            diffExpanded ? 'bg-muted' : 'hover:bg-muted/50',
          ].join(' ')}
          onClick={handleActivate}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleActivate();
            }
          }}
        >
          {/* mt-0.5 aligns the icon to the center of the first text line rather than the full content block */}
          <span className="mt-0.5 shrink-0">{leadingIcon}</span>

          <div className="min-w-0 flex-1 space-y-0.5">
            {/* Row 1: title + date + Restore icon, vertically centered with the icon */}
            <div className="flex items-center gap-1.5">
              {prominent ? (
                <>
                  <span className="text-xs text-foreground truncate">
                    {checkpointHeadlineLabel(entry)}
                  </span>
                  <span className="text-xs text-muted-foreground/50">·</span>
                  <span className="truncate text-xs text-muted-foreground">{authorName}</span>
                </>
              ) : (
                <span className="truncate text-xs text-foreground">{authorName}</span>
              )}
              <time
                className="ml-auto shrink-0 text-xs text-muted-foreground/80"
                dateTime={entry.timestamp}
                title={entry.timestamp}
              >
                {relative}
              </time>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 shrink-0"
                    data-testid="timeline-entry-restore"
                    aria-label="Restore this version"
                    disabled={restoring}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDialogOpen(true);
                    }}
                  >
                    {restoring ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Undo2 className="size-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Restore this version</TooltipContent>
              </Tooltip>
            </div>

            {/* Row 2: details, aligned with title start */}
            {allSummaries.length > 0 && <SummaryBullets summaries={allSummaries} />}
            {allDocs.length > 0 ? (
              <p className="truncate text-xs text-muted-foreground" title={allDocs.join(', ')}>
                {allDocs.join(', ')}
              </p>
            ) : (
              <p className="truncate text-xs text-muted-foreground" title={entry.message}>
                {entry.message}
              </p>
            )}
          </div>
        </div>

        {diffExpanded && (
          <div className="px-3 pb-2" data-testid="timeline-entry-diff">
            {status === 'loading' && (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading diff…
              </div>
            )}
            {status === 'error' && (
              <p className="py-2 text-xs text-destructive">Diff unavailable</p>
            )}
            {status === 'ready' && diff !== null && (
              <ActivityPanelDiffView diff={diff} viewType={diffLayout} />
            )}
            {restoreError && <p className="mt-1 text-xs text-destructive">{restoreError}</p>}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this version?</DialogTitle>
            <DialogDescription>
              This will replace the current document content with the version from {relative} by{' '}
              {authorName}. Your current content is already saved in the timeline — you can restore
              it anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              data-testid="timeline-entry-restore-cancel"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid="timeline-entry-restore-confirm"
              disabled={restoring}
              onClick={() => handleRestore()}
            >
              {restoring ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main content (no Sheet wrapper) ─────────────────────────────────────────

export function TimelineContent({ docName, diffLayout }: TimelineContentProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cache] = useState(() => new HistoricalContentCache());
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const handleRestoreSuccess = () => setCollapseAllSignal((c) => c + 1);

  useEffect(() => {
    if (!docName) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    async function fetchHistory() {
      if (!docName) return;
      try {
        const res = await fetch(`/api/history?docName=${encodeURIComponent(docName)}&limit=100`);
        if (cancelled) return;
        if (!res.ok) {
          setError('History unavailable');
          return;
        }
        const data = (await res.json()) as { entries: TimelineEntry[] };
        if (cancelled) return;
        setEntries(data.entries ?? []);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError('History unavailable');
        console.error('[timeline]', e);
      }
    }

    setLoading(true);
    fetchHistory().finally(() => {
      if (!cancelled) setLoading(false);
    });
    intervalRef.current = setInterval(fetchHistory, 10_000);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [docName]);

  // ── Group entries ──────────────────────────────────────────────────────────

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
    <div className="flex h-full flex-col">
      {/* Scrollable entry list */}
      <div className="flex-1 overflow-y-auto subtle-scrollbar">
        {/* Loading skeleton */}
        {loading && (
          <div
            className="flex flex-col gap-1 p-2"
            role="status"
            aria-busy="true"
            aria-label="Loading timeline history"
          >
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2.5">
                <Skeleton className="size-3.5 rounded mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
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
          <div className="flex flex-col gap-1 p-2">
            <CurrentVersionRow />
            {entries.map((entry) => (
              <EntryRow
                key={entry.sha}
                entry={entry}
                isDark={isDark}
                diffLayout={diffLayout}
                cache={cache}
                docName={docName}
                collapseAllSignal={collapseAllSignal}
                onRestoreSuccess={handleRestoreSuccess}
              />
            ))}
          </div>
        )}

        {/* Grouped list with checkpoints */}
        {!loading && !error && !hasNoCheckpoints && (
          <div className="flex flex-col gap-1 p-2">
            <CurrentVersionRow />
            {groups.map((group, idx) => {
              if (group.kind === 'checkpoint') {
                return (
                  <EntryRow
                    key={group.entry.sha}
                    entry={group.entry}
                    prominent
                    isDark={isDark}
                    diffLayout={diffLayout}
                    cache={cache}
                    docName={docName}
                    collapseAllSignal={collapseAllSignal}
                    onRestoreSuccess={handleRestoreSuccess}
                  />
                );
              }
              return (
                <WipGroup
                  key={group.entries[0]?.sha ?? `wip-${idx}`}
                  entries={group.entries}
                  defaultExpanded={group.isPreCheckpoint}
                  isDark={isDark}
                  diffLayout={diffLayout}
                  cache={cache}
                  docName={docName}
                  collapseAllSignal={collapseAllSignal}
                  onRestoreSuccess={handleRestoreSuccess}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
