/**
 * Fast line-level diff using Google's diff-match-patch library.
 *
 * Drop-in replacement for jsdiff's `diffLines` — same output format
 * ({ value, added?, removed? }[]) but significantly faster on large inputs.
 * jsdiff's Myers has documented 20,000x worse performance on pathological
 * cases (github.com/kpdecker/jsdiff/issues/239).
 */
import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

export interface DiffChange {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/**
 * Compute a line-level diff between two strings.
 *
 * Uses diff-match-patch's character-level diff with line-mode optimization
 * (converts lines to single characters before diffing, then expands back).
 * This is the same technique diff-match-patch's wiki recommends for
 * line-level granularity.
 */
export function diffLinesFast(oldStr: string, newStr: string): DiffChange[] {
  if (oldStr === newStr) return [{ value: oldStr }];

  // Use diff-match-patch's line mode: encode lines as single chars,
  // diff those chars, then decode back to line strings.
  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(oldStr, newStr);
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_charsToLines_(diffs, lineArray);
  dmp.diff_cleanupSemantic(diffs);

  // Convert to the { value, added?, removed? } format expected by callers
  const result: DiffChange[] = [];
  for (const [op, text] of diffs) {
    if (op === DiffMatchPatch.DIFF_DELETE) {
      result.push({ value: text, removed: true });
    } else if (op === DiffMatchPatch.DIFF_INSERT) {
      result.push({ value: text, added: true });
    } else {
      result.push({ value: text });
    }
  }

  return result;
}
