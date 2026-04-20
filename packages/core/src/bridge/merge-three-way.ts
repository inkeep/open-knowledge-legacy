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
 *
 * Post-condition (bridge-correctness SPEC §6 R1, D2/D9 LOCKED): the returned
 * result satisfies `assertContentPreservation(baseline, userText, agentText, result)`
 * — every maximal contiguous substring unique to `(userText \ baseline)` or
 * `(agentText \ baseline)` appears in the result AND retains its relative
 * order within its own side. Violation throws `BridgeMergeContentLossError`
 * upward; callers decide policy (dev/test: let it throw; prod Observer A
 * Path B: catch, log structured event, create silent checkpoint, apply
 * merge as-computed). Post-condition is a structural guardrail against the
 * academic limit of state-based three-way merge (Khanna-Kunal-Pierce 2007)
 * — the algorithm can still drop content under adversarial interleavings,
 * but silently dropping it cannot: every drop becomes an observable event.
 */
export function mergeThreeWay(baseline: string, userText: string, agentText: string): string {
  const result = mergeThreeWayImpl(baseline, userText, agentText);
  assertContentPreservation(baseline, userText, agentText, result);
  return result;
}

function mergeThreeWayImpl(baseline: string, userText: string, agentText: string): string {
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

// ─────────────────────────────────────────────────────────────────────────
// Content-preservation post-condition (SPEC §6 R1, D2/D9 LOCKED)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Discriminated side — which input's unique content the violation relates to.
 * Carried on `BridgeMergeContentLossError.info.side` so telemetry + recovery
 * can distinguish "user's keystrokes dropped" from "source-mode edits dropped".
 */
export type BridgeMergeContentLossSide = 'user' | 'agent';

/**
 * Discriminated violation kind — which half of invariant (c + order) fired.
 *   - 'substring': a maximal-unique-substring of `side \ baseline` is NOT
 *     present anywhere in `result`. This is the primary content-loss case.
 *   - 'order': all maximal-unique-substrings are present, but their relative
 *     order within `side` disagrees with their relative order in `result`.
 *     Rare in practice; guards against D9's reordering counter-example class.
 */
export type BridgeMergeContentLossWhich = 'substring' | 'order';

/** Structured payload available on the thrown error + via `toLog()`. */
export interface BridgeMergeContentLossInfo {
  baseline: string;
  userText: string;
  agentText: string;
  result: string;
  /** The maximal-unique substring(s) that are missing or reordered. */
  lostSubstrings: string[];
  which: BridgeMergeContentLossWhich;
  side: BridgeMergeContentLossSide;
}

/**
 * One lost substring in redacted telemetry form: its byte length plus a
 * short non-cryptographic digest. Preserves the "something was lost" +
 * "how much" + "is it the same substring across events" signals for rate
 * charting + deduplication without leaking raw user content into logs.
 */
interface RedactedLostSubstring {
  len: number;
  digest: string;
}

/** Serializable shape emitted to the `bridge-merge-content-loss` structured log. */
export interface BridgeMergeContentLossLogPayload {
  event: 'bridge-merge-content-loss';
  which: BridgeMergeContentLossWhich;
  side: BridgeMergeContentLossSide;
  baselineLen: number;
  userTextLen: number;
  agentTextLen: number;
  resultLen: number;
  /**
   * Redacted-by-default (length + short FNV-1a digest). Gate raw strings on
   * `OK_TELEMETRY_VERBOSE=1` via `toLog({ verbose: true })` — opt-in because
   * the raw content can contain user paragraphs that would otherwise flow
   * into log aggregators with weaker data-handling posture than the
   * application store itself.
   */
  lostSubstrings: RedactedLostSubstring[] | string[];
  /** `true` when `lostSubstrings` carries `RedactedLostSubstring[]`. */
  redacted: boolean;
}

/** Small FNV-1a 32-bit digest, hex-encoded. Non-cryptographic — stable-across-runs identity only. */
function fnv1aDigest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function redactLostSubstrings(lost: string[]): RedactedLostSubstring[] {
  return lost.map((s) => ({ len: s.length, digest: fnv1aDigest(s) }));
}

/**
 * Thrown by `mergeThreeWay` when the content-preservation post-condition
 * (maximal-unique-substring + order-preservation side-check) fails.
 *
 * Callers in dev/test let this propagate. The Observer A Path B caller in
 * production (see US-005 integration) catches the error, emits the
 * `bridge-merge-content-loss` structured log via `toLog()`, creates a
 * silent version-history checkpoint of the pre-merge state via
 * `saveInMemoryCheckpoint`, and returns the merged result as-computed so
 * the editor stays responsive (D3-LOCKED).
 */
export class BridgeMergeContentLossError extends Error {
  readonly info: BridgeMergeContentLossInfo;

  constructor(info: BridgeMergeContentLossInfo) {
    const preview = info.lostSubstrings
      .map((s) => JSON.stringify(s.length > 80 ? `${s.slice(0, 77)}...` : s))
      .join(', ');
    super(`Bridge merge content loss (which=${info.which}, side=${info.side}): ${preview}`);
    this.name = 'BridgeMergeContentLossError';
    this.info = info;
  }

  /**
   * Serialize the error for the `bridge-merge-content-loss` structured log.
   *
   * Default: `lostSubstrings` carries redacted `{ len, digest }` entries so
   * verbatim user content never reaches log aggregators. Callers that need
   * the raw strings (debug-replay harnesses, local spike scripts) opt in
   * via `{ verbose: true }`. The Observer A Path B caller reads the
   * `OK_TELEMETRY_VERBOSE` env var once to decide.
   */
  toLog(opts?: { verbose?: boolean }): BridgeMergeContentLossLogPayload {
    const verbose = opts?.verbose === true;
    return {
      event: 'bridge-merge-content-loss',
      which: this.info.which,
      side: this.info.side,
      baselineLen: this.info.baseline.length,
      userTextLen: this.info.userText.length,
      agentTextLen: this.info.agentText.length,
      resultLen: this.info.result.length,
      lostSubstrings: verbose
        ? this.info.lostSubstrings
        : redactLostSubstrings(this.info.lostSubstrings),
      redacted: !verbose,
    };
  }
}

/**
 * Extract the maximal contiguous substrings unique to `derived` relative to
 * `base`, using DMP's `diff_main` + semantic cleanup. Adjacent same-op
 * segments are merged by construction, so each INSERT represents a maximal
 * run of characters present in `derived` but not in `base` at that position.
 *
 * Each INSERT is further split on newline boundaries and whitespace-only
 * lines are dropped. Rationale: the hybrid diff3+DMP merge legitimately
 * interleaves content from both sides at line boundaries (three-way merges
 * of same-position inserts weave paragraphs; conflict-region DMP
 * concatenates within a line). The SPEC's "maximal contiguous substring"
 * wording (R1) treats the full raw INSERT as the unit, but that granularity
 * reports false positives on legitimate merges where every line of the
 * inserted block survives in isolation (C3-mixed-mode's "three clients:
 * two WYSIWYG + one source" is the canonical example — all three client
 * markers reach the final state, just interleaved). K3 risk calibration
 * per SPEC §13: split at line boundaries. Content loss means a distinct
 * non-whitespace line disappearing, not interleaving.
 *
 * Returns segments in derived-order — load-bearing for D9's order check.
 */
function extractUniqueSegments(base: string, derived: string): string[] {
  if (base === derived) return [];
  const diffs = dmp.diff_main(base, derived);
  dmp.diff_cleanupSemantic(diffs);
  const out: string[] = [];
  for (const [op, data] of diffs) {
    if (op !== 1 /* INSERT */) continue;
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Greedy order-preservation check. Walks `segments` in the order they appear
 * in `derived` and looks up each in `result` starting after the previous
 * match. Returns the first segment that exists elsewhere in `result` but not
 * in monotonic order — or `null` if the order is preserved (or a segment
 * is entirely absent, which the substring check catches separately).
 */
function findReorderedSegment(result: string, segments: string[]): string | null {
  let cursor = 0;
  for (const seg of segments) {
    const idx = result.indexOf(seg, cursor);
    if (idx < 0) {
      // Either absent entirely (caught by substring check) or only appears
      // before cursor. Distinguish by searching from zero.
      const earlierIdx = result.indexOf(seg);
      if (earlierIdx < 0) continue; // absent → substring check reports it
      return seg; // appears earlier → order violation
    }
    cursor = idx + seg.length;
  }
  return null;
}

/**
 * Invariant (c) + order side-check: every maximal-unique-substring of
 * `(userText \ baseline)` and `(agentText \ baseline)` appears in `result`,
 * and each side's segments appear in result in the same relative order
 * they appear in their source. Throws `BridgeMergeContentLossError`
 * on the first violation; callers decide environment policy.
 *
 * Complexity: O(n log n) for DMP diff per side + O(k · m) for substring
 * checks (k = segment count, m = result length) + O(k) for order check.
 * Empirically sub-millisecond on ~10 KB markdown with k ≤ ~10 segments.
 */
export function assertContentPreservation(
  baseline: string,
  userText: string,
  agentText: string,
  result: string,
): void {
  const userSegments = extractUniqueSegments(baseline, userText);
  const agentSegments = extractUniqueSegments(baseline, agentText);

  // Substring invariant (c) — both sides
  const userMissing = userSegments.filter((s) => !result.includes(s));
  if (userMissing.length > 0) {
    throw new BridgeMergeContentLossError({
      baseline,
      userText,
      agentText,
      result,
      lostSubstrings: userMissing,
      which: 'substring',
      side: 'user',
    });
  }
  const agentMissing = agentSegments.filter((s) => !result.includes(s));
  if (agentMissing.length > 0) {
    throw new BridgeMergeContentLossError({
      baseline,
      userText,
      agentText,
      result,
      lostSubstrings: agentMissing,
      which: 'substring',
      side: 'agent',
    });
  }

  // Order-preservation side-check (D9)
  const userReordered = findReorderedSegment(result, userSegments);
  if (userReordered !== null) {
    throw new BridgeMergeContentLossError({
      baseline,
      userText,
      agentText,
      result,
      lostSubstrings: [userReordered],
      which: 'order',
      side: 'user',
    });
  }
  const agentReordered = findReorderedSegment(result, agentSegments);
  if (agentReordered !== null) {
    throw new BridgeMergeContentLossError({
      baseline,
      userText,
      agentText,
      result,
      lostSubstrings: [agentReordered],
      which: 'order',
      side: 'agent',
    });
  }
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
