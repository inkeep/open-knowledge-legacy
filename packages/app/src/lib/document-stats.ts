import { stripFrontmatter } from '@inkeep/open-knowledge-core';

export interface DocumentStats {
  words: number;
  chars: number;
  tokens: number;
}

export const EMPTY_STATS: DocumentStats = {
  words: 0,
  chars: 0,
  tokens: 0,
};

/** CJK / Thai / Khmer etc. have no whitespace word boundaries — detect and route to Intl.Segmenter. */
const NON_SPACE_SCRIPT_RE = /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯฀-๿ក-៿]/;

function countWordsByWhitespace(text: string): number {
  return text ? text.split(/\s+/).length : 0;
}

function countWordsBySegmenter(text: string): number {
  const SegmenterCtor = (globalThis as { Intl: { Segmenter?: typeof Intl.Segmenter } }).Intl
    .Segmenter;
  if (!SegmenterCtor) return countWordsByWhitespace(text);
  const segmenter = new SegmenterCtor(undefined, { granularity: 'word' });
  let count = 0;
  for (const seg of segmenter.segment(text)) {
    if (seg.isWordLike) count++;
  }
  return count;
}

/**
 * Rough token estimate. ~4 chars/token is the average for English under
 * cl100k_base / o200k_base BPE; CJK tokenizes much denser (each ideograph is
 * typically 1–2 tokens), so any document containing CJK / Thai / Khmer drops
 * to ~1.5 chars/token. Mixed-script docs pick the denser ratio globally —
 * coarse but matches the existing word-counting branch.
 */
function estimateTokens(text: string): number {
  const ratio = NON_SPACE_SCRIPT_RE.test(text) ? 1.5 : 4;
  return Math.ceil(text.length / ratio);
}

/**
 * Compute body-only stats (words, chars, tokens) from raw markdown text.
 *
 * Frontmatter is excluded so counts match a writer's intuition ("how long is
 * my article?"). Handles CJK / Thai / Khmer via Intl.Segmenter when the input
 * contains non-space-separated scripts.
 */
export function computeBodyStats(fullText: string): DocumentStats {
  if (!fullText) return { words: 0, chars: 0, tokens: 0 };
  const { body } = stripFrontmatter(fullText);
  const trimmed = body.trim();
  if (!trimmed) return { words: 0, chars: 0, tokens: 0 };
  const words = NON_SPACE_SCRIPT_RE.test(trimmed)
    ? countWordsBySegmenter(trimmed)
    : countWordsByWhitespace(trimmed);
  return { words, chars: trimmed.length, tokens: estimateTokens(trimmed) };
}
