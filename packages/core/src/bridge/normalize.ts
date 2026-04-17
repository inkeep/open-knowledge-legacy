/**
 * Normalize a string for bridge-invariant comparison.
 *
 * Bridge invariant (CLAUDE.md §Bridge invariant):
 *   `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`
 *
 * This function implements that normalization deterministically across
 * all comparison sites so the comparison semantics are consistent
 * everywhere. Used by:
 *   - Server observer's already-in-sync gate
 *     (`packages/server/src/server-observers.ts`)
 *   - Test-harness bridge invariant check
 *     (`packages/app/tests/integration/test-harness.ts`)
 *
 * Applies three normalizations:
 *   1. Strip trailing whitespace per line (matches editor-on-save behavior)
 *   2. Collapse 3+ consecutive newlines to 2 (matches markdown pipeline
 *      NG1 — blank-line count between blocks normalizes to 1 blank line)
 *   3. Strip trailing newlines (whole-string)
 */
export function normalizeBridge(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}
