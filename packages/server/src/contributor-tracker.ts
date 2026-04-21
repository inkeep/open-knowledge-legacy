/**
 * Contributor accumulator — tracks which writers wrote which docs between L2 commits.
 *
 * Write-time concern: api-extension.ts calls recordContributor() after each agent write;
 * applyExternalChange calls it for file-system writes (D41).
 * Drain-time concern: persistence.ts calls formatContributors() + clearContributors()
 * in commitToWipRef() after a successful commit.
 *
 * Drain ordering: formatContributors() reads without clearing; clearContributors() is
 * called only AFTER commitWip() succeeds to prevent data loss on failed commits (D16).
 */

export interface ContributorEntry {
  /** Writer ID — any taxonomy value: agent-<uuid>, principal-<uuid>, file-system, etc. */
  writerId: string;
  displayName: string;
  colorSeed: string;
  docs: Set<string>;
  /**
   * Optional per-action commit subject override (reconcile:, rollback:, rename:, etc.).
   * When set, replaces the default formatWipSubject(docs) subject in the L2 drain.
   * Last non-undefined value wins within a drain cycle (US-015, D53).
   */
  subjectOverride?: string;
}

/** Module-level accumulator — shared between api-extension and persistence. */
let pendingContributors = new Map<string, ContributorEntry>();

/**
 * Record that a writer contributed to a document.
 * Accumulates into the module-level Map keyed by writerId.
 * Accepts any writer taxonomy value: agent-<uuid>, principal-<uuid>, file-system, etc. (D41).
 *
 * @param subjectOverride - Optional commit subject to use instead of the default
 *   formatWipSubject(docs) in the L2 drain. Use for action-specific subjects:
 *   `reconcile: <docName>`, `rollback: <docName> to <sha>`, `rename: <old> -> <new>`.
 */
export function recordContributor(
  docName: string,
  writerId: string,
  displayName: string,
  colorSeed?: string,
  subjectOverride?: string,
): void {
  let entry = pendingContributors.get(writerId);
  if (!entry) {
    entry = {
      writerId,
      displayName,
      colorSeed: colorSeed ?? displayName,
      docs: new Set(),
      subjectOverride,
    };
    pendingContributors.set(writerId, entry);
  }
  entry.docs.add(docName);
  // Last non-undefined subjectOverride wins (most specific action in the drain window).
  if (subjectOverride !== undefined) {
    entry.subjectOverride = subjectOverride;
  }
}

/**
 * Atomically swap the live accumulator with a fresh empty map.
 * Returns the snapshot of in-flight contributors at the moment of the swap.
 * Callers (persistence.ts) hold the snapshot for commit; on failure they call
 * restoreContributors(snapshot) to merge it back.
 */
export function swapContributors(): Map<string, ContributorEntry> {
  const snapshot = pendingContributors;
  pendingContributors = new Map();
  return snapshot;
}

/**
 * Merge a snapshot back into the live accumulator.
 * Called by persistence.ts when a shadow commit fails (D16) to avoid losing
 * attribution data accumulated between formatContributorsFrom() and commit failure.
 */
export function restoreContributors(snapshot: Map<string, ContributorEntry>): void {
  for (const [writerId, entry] of snapshot) {
    let live = pendingContributors.get(writerId);
    if (!live) {
      live = {
        writerId,
        displayName: entry.displayName,
        colorSeed: entry.colorSeed,
        docs: new Set(),
      };
      pendingContributors.set(writerId, live);
    }
    for (const doc of entry.docs) live.docs.add(doc);
  }
}

/**
 * Format a contributor snapshot as JSON lines for a commit message body.
 * Each line: `ok-contributors: {"v":1,"id":"...","name":"...","docs":["..."]}`
 *
 * Returns an empty string when the snapshot is empty.
 */
export function formatContributorsFrom(snapshot: Map<string, ContributorEntry>): string {
  if (snapshot.size === 0) return '';
  const lines: string[] = [''];
  for (const entry of snapshot.values()) {
    lines.push(
      `ok-contributors: ${JSON.stringify({
        v: 1,
        id: entry.writerId,
        name: entry.displayName,
        colorSeed: entry.colorSeed,
        docs: [...entry.docs],
      })}`,
    );
  }
  return lines.join('\n');
}

/**
 * @deprecated Use swapContributors() + formatContributorsFrom() + restoreContributors()
 * for the race-free drain pattern. Kept for backward compatibility.
 */
export function formatContributors(): string {
  return formatContributorsFrom(pendingContributors);
}

/**
 * Re-insert a single writer's entries back into the live accumulator.
 * Called by persistence.ts when commitWipFromTree fails for a specific writer
 * so that writer's attribution is not lost (D38 per-writer partition).
 */
export function restoreContributorEntry(writerId: string, entry: ContributorEntry): void {
  let live = pendingContributors.get(writerId);
  if (!live) {
    live = {
      writerId,
      displayName: entry.displayName,
      colorSeed: entry.colorSeed,
      docs: new Set(),
    };
    pendingContributors.set(writerId, live);
  }
  for (const doc of entry.docs) live.docs.add(doc);
}

/**
 * @deprecated Use swapContributors() for atomic drain. Kept for backward compatibility.
 * Clear the pending contributors map.
 */
export function clearContributors(): void {
  pendingContributors.clear();
}

/** Return current contributor count (for testing/diagnostics). */
export function contributorCount(): number {
  return pendingContributors.size;
}
