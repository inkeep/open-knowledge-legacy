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
  docs: Set<string>;
}

/** Module-level accumulator — shared between api-extension and persistence. */
const pendingContributors = new Map<string, ContributorEntry>();

/**
 * Record that an agent contributed to a document.
 * Accumulates into the module-level Map keyed by agentId.
 */
export function recordContributor(docName: string, agentId: string, displayName: string): void {
  let entry = pendingContributors.get(agentId);
  if (!entry) {
    entry = { agentId, displayName, docs: new Set() };
    pendingContributors.set(agentId, entry);
  }
  entry.docs.add(docName);
}

/**
 * Format pending contributors as JSON lines for a commit message body.
 * Each line: `ok-contributors: {"id":"...","name":"...","docs":["..."]}`
 *
 * Returns an empty string when no contributors are pending.
 * Does NOT clear the map (read-only — call clearContributors() after commit success).
 */
export function formatContributors(): string {
  if (pendingContributors.size === 0) return '';
  const lines: string[] = [''];
  for (const entry of pendingContributors.values()) {
    lines.push(
      `ok-contributors: ${JSON.stringify({
        id: entry.agentId,
        name: entry.displayName,
        docs: [...entry.docs],
      })}`,
    );
  }
  return lines.join('\n');
}

/**
 * Clear the pending contributors map.
 * Call only after a successful commit to avoid losing attribution on commit failure.
 */
export function clearContributors(): void {
  pendingContributors.clear();
}

/** Return current contributor count (for testing/diagnostics). */
export function contributorCount(): number {
  return pendingContributors.size;
}
