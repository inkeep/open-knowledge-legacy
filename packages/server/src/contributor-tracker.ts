/**
 * Contributor accumulator — tracks which agents wrote which docs between L2 commits.
 *
 * Write-time concern: api-extension.ts calls recordContributor() after each agent write.
 * Drain-time concern: persistence.ts calls formatContributors() + clearContributors()
 * in commitToWipRef() after a successful commit.
 *
 * Drain ordering: formatContributors() reads without clearing; clearContributors() is
 * called only AFTER commitWip() succeeds to prevent data loss on failed commits (D16).
 */

interface ContributorEntry {
  agentId: string;
  displayName: string;
  colorSeed: string;
  docs: Set<string>;
}

/** Module-level accumulator — shared between api-extension and persistence. */
let pendingContributors = new Map<string, ContributorEntry>();

/**
 * Record that an agent contributed to a document.
 * Accumulates into the module-level Map keyed by agentId.
 */
export function recordContributor(
  docName: string,
  agentId: string,
  displayName: string,
  colorSeed?: string,
): void {
  let entry = pendingContributors.get(agentId);
  if (!entry) {
    entry = { agentId, displayName, colorSeed: colorSeed ?? displayName, docs: new Set() };
    pendingContributors.set(agentId, entry);
  }
  entry.docs.add(docName);
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
  for (const [agentId, entry] of snapshot) {
    let live = pendingContributors.get(agentId);
    if (!live) {
      live = {
        agentId,
        displayName: entry.displayName,
        colorSeed: entry.colorSeed,
        docs: new Set(),
      };
      pendingContributors.set(agentId, live);
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
        id: entry.agentId,
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
