/**
 * Hybrid line-level diff3 + character-level DMP three-way merge.
 *
 * Replaces the DMP-only `applyUserDelta` approach for Observer A's Path B
 * (XmlFragment→Y.Text when Y.Text has diverged from the baseline).
 *
 * Algorithm (spec §4a):
 *   Phase 1: Line-level diff3 — structural merge + conflict detection.
 *            diff3's excludeFalseConflicts deduplicates identical edits (D8/T3).
 *   Phase 2: Per-region resolution — clean regions pass through; conflict
 *            regions go through character-level DMP merge (safe on short strings).
 *
 * Why hybrid:
 *   - diff3 alone loses sub-line edits (T6) — line-level granularity
 *   - DMP alone duplicates identical edits (T3) and corrupts delete/edit (T7)
 *   - OT duplicates D8 and corrupts delete/edit
 *   - Hybrid handles all 7 experimentally-validated scenarios correctly
 *
 * Performance: line-level diff3 is 11ms p50 on 69K-char docs; character-level
 * DMP within conflict regions adds <1ms (regions are typically <200 chars).
 *
 * @see specs/2026-04-15-lossless-bridge-merge/SPEC.md §4
 * @see specs/2026-04-15-lossless-bridge-merge/evidence/algorithm-comparison-experiment.md
 */
import DiffMatchPatch from 'diff-match-patch';
import { diff3Merge } from 'node-diff3';

/** Module-local DMP instance for conflict-region merges. */
const dmp = new DiffMatchPatch();
dmp.Match_Threshold = 0.5;

/**
 * Three-way merge: `baseline` (common ancestor), `userText` (XmlFragment
 * serialization), `agentText` (current Y.Text). Returns the merged string.
 *
 * Naming follows the Observer A convention in `server-observers.ts`:
 *   - baseline = lastSyncedXmlMd (the snapshot both sides diverged from)
 *   - userText = current XmlFragment serialized to markdown (newXmlMd)
 *   - agentText = current Y.Text (may have concurrent source-mode edits)
 */
export function mergeThreeWay(baseline: string, userText: string, agentText: string): string {
  if (baseline === userText) return agentText;
  if (baseline === agentText) return userText;
  if (userText === agentText) return userText;

  // Phase 1: Line-level diff3 — structure + conflict detection
  // diff3Merge(a, o, b) where a = user, o = base, b = agent
  // excludeFalseConflicts (default true) deduplicates identical edits (T3/D8)
  const userLines = userText.split('\n');
  const baseLines = baseline.split('\n');
  const agentLines = agentText.split('\n');
  const regions = diff3Merge(userLines, baseLines, agentLines);

  // Phase 2: Per-region resolution
  const parts: string[] = [];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if ('ok' in region && region.ok) {
      // Clean region — no conflict. Append directly.
      parts.push(region.ok.join('\n'));
    } else if ('conflict' in region && region.conflict) {
      // Conflict region — both sides edited the same lines.
      const conflictBase = region.conflict.o.join('\n');
      const conflictUser = region.conflict.a.join('\n');
      const conflictAgent = region.conflict.b.join('\n');
      parts.push(mergeConflictRegion(conflictBase, conflictUser, conflictAgent));
    }
  }

  return parts.join('\n');
}

/**
 * Resolve a single conflict region using character-level DMP merge.
 *
 * Handles three cases (spec §4a):
 *   1. User deleted the region entirely → return agent's version (T7: preserve edits over deletions)
 *   2. Agent deleted the region entirely → return user's version
 *   3. Both modified → DMP character-level merge on the small conflict region
 *
 * DMP is safe within conflict regions (typically <200 chars) because its
 * failure mode (fuzzy context mismatch) only manifests on large documents
 * where context windows span hundreds of characters. Within a small region,
 * the entire string IS the context — Match_Threshold misses don't occur.
 */
function mergeConflictRegion(base: string, user: string, agent: string): string {
  // Delete/edit resolution (T7): preserve the editor's work over deletion
  if (user === '') return agent;
  if (agent === '') return user;

  // Both sides modified — character-level merge via DMP on the small region
  const patches = dmp.patch_make(base, user);
  const [merged, flags] = dmp.patch_apply(patches, agent);

  // Per spec §4c, conflict regions are typically <200 chars so DMP's fuzzy-match
  // failure mode should not manifest. Log if the assumption is violated.
  if (flags.some((f) => !f)) {
    console.warn(
      JSON.stringify({
        event: 'bridge-merge-patch-drop',
        applied: flags.filter(Boolean).length,
        total: flags.length,
        regionSize: agent.length,
      }),
    );
  }

  return merged;
}
