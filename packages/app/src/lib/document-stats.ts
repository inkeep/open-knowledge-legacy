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

const NON_SPACE_SCRIPT_RE = /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯฀-๿ក-៿]/;

const WORD_LIKE_RE = /[\p{L}\p{N}]/u;

function countWordsByWhitespace(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const tok of text.split(/\s+/)) {
    if (WORD_LIKE_RE.test(tok)) count++;
  }
  return count;
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

function estimateTokens(text: string): number {
  const ratio = NON_SPACE_SCRIPT_RE.test(text) ? 1.5 : 4;
  return Math.ceil(text.length / ratio);
}

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
