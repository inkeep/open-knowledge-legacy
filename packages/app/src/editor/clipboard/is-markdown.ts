/**
 * Heuristic: does a text/plain clipboard payload look like markdown?
 *
 * Follows Outline's signal-count pattern. We look for distinctive markdown
 * signals — fenced code, ATX headings, bullet markers, latex dollar pairs,
 * pipe-delimited tables, literal links, blockquotes, inline code, paired
 * emphasis, JSX open tags (capitalized + lowercase-with-attr), and raw HTML
 * inline. The threshold scales with line count: `min(3, floor(lineCount / 5))`,
 * floored at 1.
 *
 * The heuristic is intentionally coarse: small snippets need at most one
 * signal to count, long snippets need up to three. Prose with occasional
 * stars ("Tom's *favorite* movie") stays below threshold on short inputs
 * and far below it on long ones. The goal is to catch authored markdown
 * pasted from GitHub textareas / Obsidian / AI chat / cross-machine raw
 * markdown transport (email/Slack/file) without false-firing on plain
 * email bodies.
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
// Blockquote: line beginning with `> ` (one of the most common AI-chat
// copy-button shapes; also frequent in cross-machine markdown transport).
const BLOCKQUOTE_RE = /^> /m;
// Inline code: backtick-wrapped span. Distinctive enough that a single
// match is meaningful, even in short prose.
const INLINE_CODE_RE = /`[^`\n]+`/;
// Paired emphasis: `**bold**` / `__bold__` / `~~strike~~`. Three
// alternatives mapped to one signal — distinct from incidental single
// `*`/`_`/`~` characters in prose.
const STRONG_STAR_RE = /\*\*[^*\n]+\*\*/;
const STRONG_UNDER_RE = /__[^_\n]+__/;
const STRIKE_RE = /~~[^~\n]+~~/;
// Capitalized JSX open tag: `<Callout`, `<Accordion`, `<Image`, etc.
// Catches cross-machine D4 paste (single-line `<Callout type="note">…`
// shared via email/Slack as raw markdown).
const JSX_CAPITAL_OPEN_RE = /<[A-Z]\w*[\s/>]/;
// Lowercase JSX/HTML with attribute: `<img src="x">`, `<a href="…">`.
// Needed for the `<img/>` JSX regression and for any HTML inline that
// carries attributes — distinct from raw-HTML-inline which requires a
// matching closing tag.
const JSX_LOWERCASE_ATTR_RE = /<[a-z]+\s+\w+="[^"]*"/;
// Raw HTML inline: `<u>foo</u>`, `<mark>…</mark>`. Requires BOTH opening
// AND closing tag on the same line (rare in non-markdown prose).
const HTML_INLINE_RE = /<[a-z]+>[^<\n]*<\/[a-z]+>/;

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
  if (BLOCKQUOTE_RE.test(text)) signals++;
  if (INLINE_CODE_RE.test(text)) signals++;
  if (STRONG_STAR_RE.test(text) || STRONG_UNDER_RE.test(text) || STRIKE_RE.test(text)) signals++;
  if (JSX_CAPITAL_OPEN_RE.test(text)) signals++;
  if (JSX_LOWERCASE_ATTR_RE.test(text)) signals++;
  if (HTML_INLINE_RE.test(text)) signals++;

  const lineCount = text.split('\n').length;
  const threshold = Math.min(3, Math.floor(lineCount / 5));
  return signals >= Math.max(1, threshold);
}
