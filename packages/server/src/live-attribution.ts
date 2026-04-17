/**
 * Live agent attribution — tracks the most recent agent edit per document.
 *
 * Distinct from `contributor-tracker`:
 *   - contributor-tracker: commit-scoped, accumulates contributors between shadow
 *     commits, drained into commit message bodies, transient per-commit.
 *   - live-attribution: edit-scoped, remembers the single most recent agent edit
 *     per document for the lifetime of the server process. Used to drive
 *     real-time halos on the graph view.
 *
 * Both trackers are updated at the same points in the write-path handlers but
 * serve orthogonal UX needs (permanent commit attribution vs ephemeral live
 * signalling). See specs/2026-04-16-graph-demo-iteration-loop/SPEC.md §10 S6.
 */

export interface LiveAttributionEntry {
  agentId: string;
  agentName: string;
  colorSeed: string;
  /** ms since epoch. Consumers diff against Date.now() to compute age. */
  timestamp: number;
}

/** Module-level singleton — mirrors contributor-tracker's shape. */
const entries = new Map<string, LiveAttributionEntry>();

export function recordLiveEdit(docName: string, entry: LiveAttributionEntry): void {
  entries.set(docName, entry);
}

export function getLiveEdit(docName: string): LiveAttributionEntry | null {
  return entries.get(docName) ?? null;
}

/** Returns a read-only copy of the tracker — used by /api/link-graph enrichment. */
export function snapshotLiveEdits(): ReadonlyMap<string, LiveAttributionEntry> {
  return new Map(entries);
}

/**
 * Returns the unique agents with an edit within `windowMs`, most-recent first.
 * Used by the `/api/link-graph` response for the active-agent legend when the
 * client doesn't want to compute it from nodes itself.
 */
export function recentAgents(windowMs: number, now: number = Date.now()): LiveAttributionEntry[] {
  const bestByAgent = new Map<string, LiveAttributionEntry>();
  for (const entry of entries.values()) {
    if (now - entry.timestamp > windowMs) continue;
    const prev = bestByAgent.get(entry.agentId);
    if (!prev || entry.timestamp > prev.timestamp) {
      bestByAgent.set(entry.agentId, entry);
    }
  }
  return [...bestByAgent.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/** Test-only: clear the tracker. */
export function resetLiveAttribution(): void {
  entries.clear();
}

/** Test-only: count. */
export function liveAttributionSize(): number {
  return entries.size;
}
