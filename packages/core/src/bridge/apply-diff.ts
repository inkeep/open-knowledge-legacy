/**
 * Bridge write-side utilities — apply line-level and three-way-merge
 * deltas to a Y.Text instance with minimal CRDT mutation.
 *
 * Used by the server-authoritative observer (precedent #14) to sync
 * XmlFragment→Y.Text. Extracted to core so the bridge utilities live in
 * one place — the client observer formerly had identical copies that
 * were removed by FR-7 (server-authoritative observer bridge spec).
 *
 * ## Precedent #11 — minimize CRDT mutation in sync bridges
 *
 * Two sub-principles:
 *
 *   (a) Content-comparison gate before delete+insert — if a sync would
 *       replace content with content already present at the same offset,
 *       skip both operations. Preserves existing CRDT Items (and their
 *       origin-attributed Item ids, important for Y.UndoManager).
 *       Implemented in `applyIncrementalDiff`.
 *
 *   (b) Finer-grained three-way merge via DMP patch_make/patch_apply for
 *       divergent paths. DMP's character-level matching shrinks the
 *       "blast radius" of Items replaced; the final `applyByPrefixSuffix`
 *       preserves matching prefix/suffix regions.
 *       Implemented in `applyUserDelta`.
 *
 * ## D8 known limitation (from 2026-04-13 observer-a-origin-aware-diff spec)
 *
 * Path B's DMP `patch_apply` can silently drop patches when agent text
 * diverges beyond the Match_Threshold (0.5) context window. Non-fatal:
 * `console.warn` fires with full diagnostic (failed-patches count, byte
 * lengths, patch_toText dump). The bridge-convergence fuzzer tolerates
 * up to 5% drops under DMP-tolerance-pct (see
 * `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`).
 */
import DiffMatchPatch from 'diff-match-patch';
import type * as Y from 'yjs';
import { applyByPrefixSuffix } from '../utils/apply-by-prefix-suffix.ts';
import { diffLinesFast } from './diff-lines.ts';

/** Module-local DMP instance for three-way merge. Match_Threshold pinned to
 *  0.5 per audit F15 — depending on the default would silently regress if
 *  a future module mutated a shared singleton. */
const dmpMerge = new DiffMatchPatch();
dmpMerge.Match_Threshold = 0.5;

/**
 * Apply incremental diff from `currentText` to `newText` on a Y.Text
 * instance. Uses diffLines to minimize CRDT mutations — preserves
 * concurrent source-mode edits when the changes are line-aligned, and
 * applies a content-comparison gate to skip no-op replacements
 * (precedent #11(a)).
 *
 * Preconditions: `currentText` must equal `ytext.toString()` at the
 * point of call. Callers wrap in `doc.transact(..., origin)` so the
 * delete+insert pairs commit atomically under one origin.
 */
export function applyIncrementalDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;

  // No padding needed here — this function walks the diff with byte-level
  // `delete(offset, len)` + `insert(offset, value)` operations. Even if
  // `diffLines` produces a spurious `removed: X` + `added: X + Y` pair on
  // an unterminated final line, deleting X then re-inserting X+Y at the
  // same offset produces the correct net effect. The aliasing artifact
  // cancels itself out.
  const changes = diffLinesFast(currentText, newText);
  let offset = 0;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      // Content-comparison gate (D7): if Y.Text already has the added
      // content at this offset, skip both delete and insert — preserve
      // CRDT Items.
      //
      // Note: `offset` tracks the mutated Y.Text position but indexes into
      // the original `currentText` snapshot. After a genuine replacement
      // where change.value.length !== next.value.length, subsequent gate
      // checks read a slightly shifted slice. This is benign: (1) the gate
      // is a pure optimization — misses fall through to correct
      // delete+insert, (2) false positives (coincidental match at wrong
      // offset) self-heal on the next Observer A cycle (≤50ms), (3) Path A
      // only fires when Y.Text is in sync with baseline, making multi-hunk
      // different-length replacements rare.
      const targetSlice = currentText.substring(offset, offset + next.value.length);
      if (targetSlice === next.value) {
        // No-op replacement; advance offset by the (now equal) length.
        offset += next.value.length;
        i++; // consume the paired ADDED
        continue;
      }
      ytext.delete(offset, change.value.length);
      ytext.insert(offset, next.value);
      offset += next.value.length;
      i++; // consume the paired ADDED
    } else if (change.removed) {
      ytext.delete(offset, change.value.length);
    } else if (change.added) {
      ytext.insert(offset, change.value);
      offset += change.value.length;
    } else {
      offset += change.value.length;
    }
  }
}

/**
 * Apply ONLY the user's delta to Y.Text when Y.Text has diverged from the
 * last synced XmlFragment state (Path B — see observer sync algorithm in
 * `packages/server/src/server-observers.ts`). Uses DMP's canonical
 * three-way merge:
 *
 *   - base   = oldXmlMd (lastSyncedXmlMd, the common ancestor)
 *   - user   = newXmlMd (current XmlFragment serialized)
 *   - agent  = currentText (current Y.Text, possibly diverged)
 *
 * `patch_make(base, user)` computes the user's edits as patches; then
 * `patch_apply(patches, agent)` applies them against the agent's diverged
 * text. The result preserves Item-equal prefix/suffix via
 * `applyByPrefixSuffix` (precedent #11(b)).
 *
 * Known merge semantics (LOCKED decisions from 2026-04-13 spec):
 *   - D8: exact-character overlap (`base="hello", user="hello!", agent="hello!"`)
 *     produces `"hello!!"` — inherent to three-way merge; both sides
 *     independently made the same change.
 *   - D9: user-wins on collision — when user deletes a line that agent
 *     modified, the deletion wins (DMP default behavior).
 */
export function applyUserDelta(ytext: Y.Text, oldXmlMd: string, newXmlMd: string): void {
  if (oldXmlMd === newXmlMd) return;
  const currentText = ytext.toString();

  const patches = dmpMerge.patch_make(oldXmlMd, newXmlMd);
  const [mergedText, results] = dmpMerge.patch_apply(patches, currentText);

  // Failed patches indicate the patch's context could not be located in
  // agent's text within Match_Threshold. patch_apply still returns
  // mergedText with the successful patches applied and failed ones
  // skipped — that's "user-wins on what we could merge". Emit a
  // console.warn diagnostic (console.warn is the project convention for
  // bridge-level advisory signals).
  if (results.some((ok: boolean) => !ok)) {
    const failedPatches = results.filter((ok: boolean) => !ok).length;
    const info = {
      failedPatches,
      totalPatches: results.length,
      baseLen: oldXmlMd.length,
      userLen: newXmlMd.length,
      agentLen: currentText.length,
      mergedLen: mergedText.length,
    };
    const failedPatchDetail = dmpMerge.patch_toText(patches.filter((_, idx) => !results[idx]));
    console.warn(
      `[bridge applyUserDelta] patch_apply had ${failedPatches}/${results.length} failed patches`,
      info,
      failedPatchDetail,
    );
  }

  if (mergedText === currentText) return;

  // Apply via prefix/suffix to minimize CRDT mutations beyond what
  // patch_apply already resolved. Items in the matching prefix/suffix are
  // preserved (no delete fires for them).
  applyByPrefixSuffix(ytext, currentText, mergedText);
}
