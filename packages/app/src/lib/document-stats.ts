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

/** Rough token estimate (~4 chars/token for English GPT-family tokenizers). */
function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * Compute body-only stats (words, chars, tokens) from raw markdown text.
 *
 * Frontmatter is excluded so counts match a writer's intuition ("how long is
 * my article?"). Handles CJK / Thai / Khmer via Intl.Segmenter when the input
 * contains non-space-separated scripts. Tokens are estimated as chars/4.
 */
export function computeBodyStats(fullText: string): DocumentStats {
  if (!fullText) return { words: 0, chars: 0, tokens: 0 };
  const { body } = stripFrontmatter(fullText);
  const trimmed = body.trim();
  if (!trimmed) return { words: 0, chars: 0, tokens: 0 };
  const words = NON_SPACE_SCRIPT_RE.test(trimmed)
    ? countWordsBySegmenter(trimmed)
    : countWordsByWhitespace(trimmed);
  const chars = trimmed.length;
  return { words, chars, tokens: estimateTokens(chars) };
}
