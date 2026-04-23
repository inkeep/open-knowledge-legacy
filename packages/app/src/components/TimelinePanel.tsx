/**
 * TimelinePanel — document edit history content for the DocPanel timeline tab.
 *
 * Fetches GET /api/history on mount, polls every 10s while mounted.
 * Checkpoint entries are always visible; WIP entries between checkpoints
 * are collapsed behind a "Show N auto-saves" expander.
 * Current (pre-checkpoint) WIP entries are expanded by default at top.
 */
import {
  AGENT_ICON_COLORS,
  colorFromSeed,
  iconFromClientName,
  type TimelineEntry,
} from '@inkeep/open-knowledge-core';
import { AlertTriangle, ChevronDown, ChevronRight, Diamond, FileArchive } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Public props ────────────────────────────────────────────────────────────

interface TimelineContentProps {
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

/** Map internal author names to user-friendly display names. Uses structured contributors when available. */
export function displayAuthor(entry: TimelineEntry): string {
  if (entry.type === 'upstream') return 'Upstream sync';
  if (entry.contributors.length === 1) return entry.contributors[0].name;
  if (entry.contributors.length > 1) return entry.contributors.map((c) => c.name).join(', ');
  // Pre-attribution fallback
  if (entry.author === 'openknowledge-server' || entry.author === 'server') return 'Auto-save';
  return entry.author;
}

/**
 * Dot color for an entry. Returns either a Tailwind className or an inline hex color.
 * Structured contributors take precedence; pre-attribution entries use the existing heuristic.
 *
 * Contributor color derivation matches the presence bar: first look up the
 * per-client-type brand color via `AGENT_ICON_COLORS[iconFromClientName(seed)]`
 * (so `claude-code` is always Claude-orange, `cursor-vscode` is always
 * Cursor-dark, etc.), and fall back to the hash-based `colorFromSeed` palette
 * only for unknown client names. Previously this used `colorFromSeed` directly
 * on the contributor name, which hashes into a 7-color palette and could
 * collide across different client types (e.g. `claude-code` and
 * `cursor-vscode` both mapped to the indigo `bot` color).
 */
function getAuthorColor(
  entry: TimelineEntry,
): { className: string; hex?: undefined } | { hex: string; className?: undefined } {
  if (entry.contributors.length > 0) {
    const c = entry.contributors[0];
    const seed = c.colorSeed ?? c.name;
    const icon = iconFromClientName(seed);
    const brandColor = AGENT_ICON_COLORS[icon];
    return { hex: brandColor ?? colorFromSeed(seed) };
  }
  if (entry.type === 'upstream') return { className: 'bg-muted-foreground/50' };
  if (entry.authorEmail.includes('openknowledge.local') || entry.type === 'wip') {
    if (
      entry.authorEmail.includes('agent') ||
      entry.author.includes('agent') ||
      entry.authorEmail.includes('cursor') ||
      entry.authorEmail.includes('claude')
    ) {
      return { className: 'bg-[--color-agent]' };
    }
  }
  return { className: 'bg-[--color-azure-blue]' };
}

function authorDot(entry: TimelineEntry) {
  const color = getAuthorColor(entry);
  return (
    <span
      aria-hidden="true"
      style={color.hex ? { backgroundColor: color.hex } : undefined}
      className={`inline-block size-2 rounded-full shrink-0 ${color.className ?? ''}`}
    />
  );
}

// ─── "Current version" pinned row ────────────────────────────────────────────

function CurrentVersionRow({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={[
        'group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset border-b border-border/50',
        selected ? 'bg-muted' : 'hover:bg-muted/40',
      ].join(' ')}
      onClick={onSelect}
    >
      <span className="mt-1.5 flex shrink-0 items-center">
        <span className="inline-block size-2 rounded-full bg-emerald-500" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">Current version</p>
        <p className="text-xs text-muted-foreground">Live document</p>
      </div>
    </button>
  );
}

// ─── Empty entry sentinel (for current-version clicks) ──────────────────────

const EMPTY_ENTRY: TimelineEntry = {
  sha: '',
  timestamp: '',
  author: '',
  authorEmail: '',
  type: 'wip',
  message: '',
  contributors: [],
  checkpoint: null,
};

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
  selected: boolean;
  onSelect?: (entry: TimelineEntry) => void;
  prominent?: boolean;
}

function EntryRow({ entry, selected, onSelect, prominent = false }: EntryRowProps) {
  const relative = formatRelativeTime(entry.timestamp);
  const authorName = displayAuthor(entry);
  const allDocs = entry.contributors.flatMap((c) => c.docs);
  const allSummaries = allSummariesFor(entry);

  // Div-with-role rather than <button>: the row contains a nested SummaryBullets
  // expander that needs to be a real <button> (nested native buttons are
  // invalid HTML). The div is clickable + Enter/Space-activatable to preserve
  // the same keyboard semantics the previous <button> had.
  //
  // Focus styling: native `<button>` gets the UA default focus ring for free;
  // `<div role="button">` gets NOTHING without explicit CSS. Without a
  // focus-visible ring, keyboard users tabbing through the timeline see no
  // visible focus indicator (selected-state `bg-muted` follows `selected`,
  // not focus, so a focused-but-unselected row is invisible). `ring-inset`
  // keeps the ring within the row bounds — the timeline rows are flush with
  // each other, so an outset ring would overflow into neighboring rows.
  const handleActivate = () => onSelect?.(entry);
  return (
    // biome-ignore lint/a11y/useSemanticElements: row contains a nested SummaryBullets expander that is a real <button>; native nested buttons are invalid HTML, so the row uses div[role=button] to preserve keyboard activation while allowing the nested interactive child.
    <div
      role="button"
      tabIndex={0}
      className={[
        'group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        selected ? 'bg-muted' : 'hover:bg-muted/40',
        prominent ? 'border-b border-border/50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      {prominent ? (
        (() => {
          const variant = checkpointVariant(entry);
          if (variant === 'bridge-merge-loss') {
            return (
              <AlertTriangle
                className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
            );
          }
          if (variant === 'external-change-rescue') {
            return (
              <FileArchive
                className="mt-0.5 size-3.5 shrink-0 text-sky-600 dark:text-sky-400"
                aria-hidden="true"
              />
            );
          }
          return <Diamond className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
        })()
      ) : (
        <div className="mt-1.5 flex shrink-0 items-center">{authorDot(entry)}</div>
      )}

      <div className="min-w-0 flex-1">
        {prominent && (
          <div className="mb-0.5 flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground">
              {checkpointHeadlineLabel(entry)}
            </span>
            {authorDot(entry)}
            <span className="truncate text-xs text-muted-foreground">{authorName}</span>
          </div>
        )}
        {!prominent && <p className="truncate text-xs text-foreground">{authorName}</p>}
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

      <time
        className="shrink-0 text-xs text-muted-foreground"
        dateTime={entry.timestamp}
        title={entry.timestamp}
      >
        {relative}
      </time>
    </div>
  );
}

// ─── Main content (no Sheet wrapper) ─────────────────────────────────────────

export function TimelineContent({ docName, onEntrySelect, selectedSha }: TimelineContentProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const isViewingCurrent = !selectedSha;

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable entry list */}
      <div className="flex-1 overflow-y-auto subtle-scrollbar">
        {/* Loading skeleton */}
        {loading && (
          <div
            className="flex flex-col gap-2 p-4"
            role="status"
            aria-busy="true"
            aria-label="Loading timeline history"
          >
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
            <CurrentVersionRow
              selected={isViewingCurrent}
              onSelect={() => onEntrySelect?.(EMPTY_ENTRY)}
            />
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
            <CurrentVersionRow
              selected={isViewingCurrent}
              onSelect={() => onEntrySelect?.(EMPTY_ENTRY)}
            />
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
    </div>
  );
}
