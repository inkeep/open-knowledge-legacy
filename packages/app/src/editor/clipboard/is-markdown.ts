/**
 * Heuristic: does a text/plain clipboard payload look like markdown?
 *
 * Follows Outline's signal-count pattern (FR-14). We look for distinctive
 * markdown signals — fenced code, ATX headings, bullet markers, latex
 * dollar pairs, pipe-delimited tables, and literal links. The threshold
 * scales with line count: `min(3, floor(lineCount / 5))`.
 *
 * The heuristic is intentionally coarse: small snippets need at most one
 * signal to count, long snippets need up to three. Prose with occasional
 * stars ("Tom's *favorite* movie") stays below threshold on short inputs
 * and far below it on long ones. The goal is to catch authored markdown
 * pasted from GitHub textareas / Obsidian / AI chat without false-firing
 * on plain email bodies.
 */

const FENCE_RE = /^```/m;
const HEADING_RE = /^#{1,6} /m;
const BULLET_RE = /^[-*+] /m;
const NUMBERED_RE = /^\d+[.)] /m;
// Inline link: [label](url). Matches are strong signals because the
// shape is unusual in plain prose.
const INLINE_LINK_RE = /\[[^\]\n]+\]\([^)\n]+\)/;
// GFM table row: at least one `|` at the start, `|` at the end, and a
// separator row like `|---|---|` or `| --- | --- |`.
const TABLE_ROW_RE = /^\|.*\|$/m;
const TABLE_SEPARATOR_RE = /^\|?\s*(:?-+:?)(\s*\|\s*:?-+:?)+\s*\|?$/m;
// LaTeX math: `$$...$$` block or `$...$` inline with at least two $ pairs.
const MATH_BLOCK_RE = /\$\$[\s\S]+?\$\$/;

export function isMarkdown(text: string): boolean {
  if (!text) return false;
  let signals = 0;
  if (FENCE_RE.test(text)) signals++;
  if (HEADING_RE.test(text)) signals++;
  if (BULLET_RE.test(text)) signals++;
  if (NUMBERED_RE.test(text)) signals++;
  if (INLINE_LINK_RE.test(text)) signals++;
  if (TABLE_ROW_RE.test(text) && TABLE_SEPARATOR_RE.test(text)) signals++;
  if (MATH_BLOCK_RE.test(text)) signals++;

  const lineCount = text.split('\n').length;
  const threshold = Math.min(3, Math.floor(lineCount / 5));
  return signals >= Math.max(1, threshold);
}
