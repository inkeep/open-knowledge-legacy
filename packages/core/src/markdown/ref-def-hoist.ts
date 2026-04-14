/**
 * R11: Reference-definition hoisting for R6 block-level split-then-rejoin.
 *
 * When R6 splits source at a fallback boundary, top-level `[label]: url`
 * definitions from the first half must be prepended to the second half
 * so cross-block link semantics survive the split. Ref-def-looking lines
 * inside fenced code blocks are excluded.
 */

const REF_DEF_RE = /^[ \t]{0,3}\[([^\]]+)\]:\s*(\S+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/gm;
const FENCE_RE = /^(`{3,}|~{3,})/gm;

/**
 * Identify fenced-code regions in source text.
 * Returns an array of [start, end] offset pairs for each fenced block.
 */
function findFencedRegions(src: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  let openFence: { marker: string; offset: number } | null = null;

  for (const match of src.matchAll(FENCE_RE)) {
    const marker = match[1];
    const offset = match.index;

    if (!openFence) {
      openFence = { marker, offset };
    } else if (marker[0] === openFence.marker[0] && marker.length >= openFence.marker.length) {
      regions.push([openFence.offset, offset + match[0].length]);
      openFence = null;
    }
  }
  // Unclosed fence extends to end of source
  if (openFence) {
    regions.push([openFence.offset, src.length]);
  }

  return regions;
}

function isInsideFence(offset: number, fences: Array<[number, number]>): boolean {
  return fences.some(([start, end]) => offset >= start && offset < end);
}

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
