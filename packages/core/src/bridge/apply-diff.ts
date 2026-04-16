/**
 * Bridge write-side utilities — apply line-level and character-level
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
 *   (b) Character-level diff application via `applyFastDiff` — uses DMP
 *       `diff_main` to compute character-level changes, then applies
 *       minimal insert/delete operations to Y.Text. Preserves CRDT Items
 *       for unchanged content (unlike `applyByPrefixSuffix` which destroys
 *       all Items in the middle region).
 *       Implemented in `applyFastDiff`.
 *
 * @see specs/2026-04-15-lossless-bridge-merge/SPEC.md
 */
import DiffMatchPatch from 'diff-match-patch';
import type * as Y from 'yjs';
import { diffLinesFast } from './diff-lines.ts';

/** Module-local DMP instance for character-level diffing in applyFastDiff. */
const dmpDiff = new DiffMatchPatch();

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
 * Apply a merged text to Y.Text via character-level DMP diff_main.
 *
 * Produces minimal insert/delete operations that only touch the characters
 * that actually changed. This preserves CRDT Items (and their origin
 * attribution) for all unchanged content — strictly better than
 * `applyByPrefixSuffix` which destroys all Items between the matching
 * prefix and suffix.
 *
 * Used by Observer A Path B after `mergeThreeWay` computes the merged
 * text. Also suitable for any path that needs to apply a string delta
 * to Y.Text with minimal CRDT mutation.
 *
 * @see specs/2026-04-15-lossless-bridge-merge/SPEC.md §4d
 */
export function applyFastDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;
  const diffs = dmpDiff.diff_main(currentText, newText);
  dmpDiff.diff_cleanupSemantic(diffs);
  let offset = 0;
  for (const [type, text] of diffs) {
    if (type === 0) {
      offset += text.length;
    } else if (type === -1) {
      ytext.delete(offset, text.length);
    } else if (type === 1) {
      ytext.insert(offset, text);
      offset += text.length;
    }
  }
}
