import { stripFrontmatter } from '@inkeep/open-knowledge-core';

export interface DocumentStats {
  words: number;
  chars: number;
  /** null = not yet computed, too large, or encoder unavailable. */
  tokens: number | null;
}

export const EMPTY_STATS: DocumentStats = {
  words: 0,
  chars: 0,
  tokens: 0,
};

/**
 * Large-doc gate for token computation. tiktoken is pure-JS BPE on the main
 * thread and scales roughly linearly with input length; above this threshold
 * we show "—" in the UI instead of blocking the editor for tens of ms.
 */
export const TOKEN_SIZE_LIMIT = 200_000;

/** CJK / Thai / Khmer etc. have no whitespace word boundaries — detect and route to Intl.Segmenter. */
const NON_SPACE_SCRIPT_RE =
  /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u0e00-\u0e7f\u1780-\u17ff]/;

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
 * Compute body-only stats (words, chars) from raw markdown text.
 *
 * Synchronous and cheap — frontmatter is excluded so counts match a writer's
 * intuition ("how long is my article?"). Handles CJK / Thai / Khmer via
 * Intl.Segmenter when the input contains non-space-separated scripts.
 */
export function computeBodyStats(fullText: string): { words: number; chars: number } {
  if (!fullText) return { words: 0, chars: 0 };
  const { body } = stripFrontmatter(fullText);
  const trimmed = body.trim();
  if (!trimmed) return { words: 0, chars: 0 };
  const words = NON_SPACE_SCRIPT_RE.test(trimmed)
    ? countWordsBySegmenter(trimmed)
    : countWordsByWhitespace(trimmed);
  return { words, chars: trimmed.length };
}
