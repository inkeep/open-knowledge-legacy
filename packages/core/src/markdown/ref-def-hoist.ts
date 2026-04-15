/**
 * R11: Reference-definition hoisting for R6 block-level split-then-rejoin.
 *
 * When R6 splits source at a fallback boundary, top-level `[label]: url`
 * definitions from the first half must be prepended to the second half
 * so cross-block link semantics survive the split. Ref-def-looking lines
 * inside fenced code blocks are excluded.
 */
import { findFencedRegions, isInsideFence } from './fence-regions.ts';

const REF_DEF_RE = /^[ \t]{0,3}\[([^\]]+)\]:\s*(\S+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/gm;

/**
 * Extract top-level reference definitions from source text, excluding those
 * inside fenced code blocks. Returns a newline-joined string suitable for
 * prepending to a split half.
 */
export function hoistRefDefs(src: string): string {
  const fences = findFencedRegions(src);
  const defs: string[] = [];

  for (const match of src.matchAll(REF_DEF_RE)) {
    if (!isInsideFence(match.index, fences)) {
      defs.push(match[0].trimEnd());
    }
  }

  return defs.length > 0 ? `${defs.join('\n')}\n\n` : '';
}
