/**
 * Comment promoter — recognises literal authoring annotations in markdown
 * source and promotes them to the inline `comment` mark or block
 * `commentBlock` node. Both PM bindings render with `display: none` +
 * `data-clipboard-omit="true"` so comments are invisible in WYSIWYG and
 * dropped from cross-app clipboard payloads. Source mode is the only
 * authoring surface — there is no slash command and no JSX form.
 *
 * Four source forms collapse onto two mdast types (inline `comment`,
 * block `commentBlock`):
 *
 *   1. `%%text%%` markdown (inline)        — heuristic walker over `text`
 *      mdast nodes; emits `comment` with `data.sourceForm: 'percent'`.
 *   2. `<!-- text -->` HTML comment (inline) — same `text`-node walker;
 *      emits `comment` with `data.sourceForm: 'html'`.
 *   3. `%%\n…\n%%` markdown block fence    — root-level paragraph walker
 *      (`handleBlockCommentsAtRoot`) recognising both Case A (single-
 *      paragraph compact) and Case B (blank-line-padded multi-paragraph)
 *      shapes; emits `commentBlock` with `data.sourceForm: 'percent'`.
 *   4. `<!-- … -->` HTML comment block     — same root-level walker;
 *      emits `commentBlock` with `data.sourceForm: 'html'`. Recognises
 *      both single-text-node paragraphs (Case D) AND multi-child
 *      paragraphs whose first/last text nodes carry the `<!--`/`-->`
 *      delimiters (Case E) — needed because remark-parse splits the
 *      paragraph on inline markdown (backticks, asterisks, etc.) inside
 *      the comment body.
 *
 * On serialize, the matching `to-markdown-handlers.ts` `comment` /
 * `commentBlock` handlers branch on `data.sourceForm` so each form
 * round-trips byte-stable: `%%` stays `%%`, `<!--` stays `<!--`. This
 * preserves authoring intent AND avoids a round-trip data-loss bug
 * where canonicalising HTML comments to `%%body%%` produces invalid
 * byte sequences whenever the body contains literal `%%` (the inline
 * `%%` walker re-claims part of the span on re-parse, splitting one
 * comment into two and leaving leftover prose).
 *
 * Multi-block bodies are only representable in `%%`-fenced form
 * (CommonMark HTML comments hold opaque text, no nested paragraphs /
 * lists / headings). The to-markdown handler falls back to `%%` form
 * for `commentBlock` nodes whose `sourceForm` is `'html'` but whose
 * children include more than one block — that case is rare (the parser
 * only produces it from `%%`-fenced source today) and the fallback is
 * the only stable round-trip.
 *
 * ## Heuristic for inline `%%…%%` (matches Obsidian behavior)
 *
 *   1. Opening `%%` is NOT preceded by another `%` (rejects `%%%`
 *      left edges).
 *   2. The body contains no newline (the inline walker stays inline;
 *      multi-line block comments use `%%\n…\n%%`).
 *   3. The body's last character is non-`%` (rejects `%%%` right
 *      edges and `%%text%%%` triple-percent close ambiguity).
 *   4. The body contains at least one non-whitespace character (so
 *      `%%   %%` doesn't claim — it's not a meaningful comment).
 *   5. Closing `%%` is NOT followed by another `%` (rejects `%%%%`
 *      right edges).
 *
 * Whitespace-flanked content is allowed: `%% text %%` (with leading
 * and trailing space inside the delimiters) parses as a comment with
 * body ` text `. Matches Obsidian's behavior — the original strict
 * "non-whitespace-flanking" rules were inherited from CommonMark
 * emphasis without justification, and surprised authors who wrote
 * sentence-shaped comments like `%% This is a note. %%`.
 *
 * Trade-off: relaxed rules use lazy matching, so `%%a %% b%%` matches
 * as `%%a %%` (body `a `) plus orphan trailing ` b%%`. The strict
 * rules previously kept the lazy quantifier from claiming the inner
 * `%%` as a close, matching `%%a %% b%%` as ONE comment with body
 * `a %% b`. Authors who want literal `%%` inside a comment body
 * should use `<!-- text with %% inside -->` instead.
 *
 * ## Heuristic for inline `<!-- … -->`
 *
 * Plain literal: the body is whatever sits between `<!--` and `-->`,
 * trimmed. No flanking rules — HTML comments are unambiguous.
 *
 * ## Block-level multi-child paragraph recognition (Cases E + F)
 *
 * remark-parse splits paragraphs whose body contains inline markdown
 * (backticks, emphasis, links) into separate phrasing children:
 *
 *   `<!-- text with `code` more -->`  →  paragraph
 *                                          text "<!-- text with "
 *                                          inlineCode "code"
 *                                          text " more -->"
 *
 *   `%% text with `code` more %%`     →  paragraph
 *                                          text "%% text with "
 *                                          inlineCode "code"
 *                                          text " more %%"
 *
 * The inline walker only sees one text node at a time, so neither the
 * open delimiter nor the close ends up in the same text node and
 * matching fails — the user sees the raw `<!--` / `%%` characters as
 * visible prose in WYSIWYG.
 *
 * Cases E (`<!--`-form) and F (`%%`-form) recognise this shape: first
 * child is text starting with the open delimiter, last child is text
 * ending with the close delimiter, no internal delimiters in any text
 * child. The delimiters are stripped from the boundary text nodes
 * (with surrounding whitespace trimmed) and the rest of the paragraph
 * becomes the commentBlock body. Inline markdown inside the body
 * (inlineCode, emphasis, etc.) is preserved structurally; the body is
 * invisible in WYSIWYG via the commentBlock's `display: none` so the
 * inline structure is purely a serialization concern.
 *
 * Single-child paragraphs (no inline markdown in the body) continue
 * to use the inline walker — `%%hello%%\n` parses as a paragraph
 * holding a single comment-marked text run, and round-trips
 * byte-stable as `%%hello%%\n`. Promoting it to a `commentBlock`
 * would force the canonical padded `%%\n\nhello\n\n%%` shape on
 * save (precedent #38 byte-stable round-trip).
 *
 * ## When it runs
 *
 * Wired in `pipeline.ts` AFTER `highlightPromoterPlugin` (so highlight
 * claims its `==` bytes first; `==` and `%%` don't overlap, but the
 * ordering keeps the chain consistent and predictable) and BEFORE
 * `mergedPostParseWalkerPlugin`. Code spans (`inlineCode`), block code
 * (`code`), math nodes (`math`, `inlineMath`), and wiki-link atoms are
 * leaf mdast types — `visit` with type `'text'` does not descend into
 * their `value` strings, so `%%` and `<!--` literals inside them stay
 * intact.
 */

import type { Nodes, Paragraph, PhrasingContent, Root, RootContent, Text } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';
import type { CommentBlockMdast, CommentMdast } from './mdast-augmentation.ts';

const PERCENT_COMMENT_RE = /(?<!%)%%([^\n]*?[^\n%])%%(?!%)/g;

const HTML_COMMENT_INLINE_RE = /<!--([\s\S]*?)-->/g;

export function commentPromoterPlugin() {
  return (tree: Root) => {
    handleBlockCommentsAtRoot(tree);

    visit(tree, 'text', (node: Text, index, parent) => {
      if (parent === undefined || index === undefined || index === null) return;

      const value = node.value;
      if (value.indexOf('%%') === -1 && value.indexOf('<!--') === -1) return;

      const matches = collectInlineCommentMatches(value);
      if (matches.length === 0) return;

      const replacements: PhrasingContent[] = [];
      let cursor = 0;
      for (const match of matches) {
        if (match.start > cursor) {
          replacements.push({ type: 'text', value: value.slice(cursor, match.start) });
        }
        const commentNode: CommentMdast = {
          type: 'comment',
          children: [{ type: 'text', value: match.body }],
          data: { sourceForm: match.sourceForm },
        };
        replacements.push(commentNode as unknown as PhrasingContent);
        cursor = match.end;
      }
      if (cursor < value.length) {
        replacements.push({ type: 'text', value: value.slice(cursor) });
      }

      const arr = (parent as { children: PhrasingContent[] }).children;
      arr.splice(index, 1, ...replacements);
      return [SKIP, index + replacements.length];
    });
  };
}

interface InlineCommentMatch {
  start: number;
  end: number;
  body: string;
  sourceForm: 'percent' | 'html';
}

function collectInlineCommentMatches(value: string): InlineCommentMatch[] {
  const out: InlineCommentMatch[] = [];

  PERCENT_COMMENT_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
  while ((pm = PERCENT_COMMENT_RE.exec(value)) !== null) {
    if (pm[1].trim().length === 0) continue;
    out.push({
      start: pm.index,
      end: pm.index + pm[0].length,
      body: pm[1],
      sourceForm: 'percent',
    });
  }

  HTML_COMMENT_INLINE_RE.lastIndex = 0;
  let hm: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
  while ((hm = HTML_COMMENT_INLINE_RE.exec(value)) !== null) {
    const body = hm[1].trim();
    if (body === '') continue;
    out.push({
      start: hm.index,
      end: hm.index + hm[0].length,
      body,
      sourceForm: 'html',
    });
  }

  out.sort((a, b) => a.start - b.start);
  const deduped: InlineCommentMatch[] = [];
  let lastEnd = -1;
  for (const m of out) {
    if (m.start < lastEnd) continue;
    deduped.push(m);
    lastEnd = m.end;
  }
  return deduped;
}

function handleBlockCommentsAtRoot(tree: Root): void {
  const children = tree.children;
  let i = 0;
  while (i < children.length) {
    const child = children[i];

    if (child.type === 'paragraph') {
      const single = isSingleTextParagraph(child);
      if (single !== null) {
        const fenced = matchSingleParagraphFence(single);
        if (fenced !== null) {
          const block: CommentBlockMdast = {
            type: 'commentBlock',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: fenced }],
              } as Paragraph,
            ],
            data: { sourceForm: 'percent', sourceLayout: 'block' },
          };
          children.splice(i, 1, block as unknown as RootContent);
          i += 1;
          continue;
        }

        const htmlBlockBody = matchHtmlCommentBlock(single);
        if (htmlBlockBody !== null) {
          const block: CommentBlockMdast = {
            type: 'commentBlock',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: htmlBlockBody }],
              } as Paragraph,
            ],
            data: { sourceForm: 'html', sourceLayout: 'inline' },
          };
          children.splice(i, 1, block as unknown as RootContent);
          i += 1;
          continue;
        }
      }

      const strippedHtml = stripHtmlCommentDelimiters(child);
      if (strippedHtml !== null) {
        const block: CommentBlockMdast = {
          type: 'commentBlock',
          children: [strippedHtml],
          data: { sourceForm: 'html', sourceLayout: 'inline' },
        };
        children.splice(i, 1, block as unknown as RootContent);
        i += 1;
        continue;
      }

      const strippedPercent = stripPercentDelimiters(child);
      if (strippedPercent !== null) {
        const block: CommentBlockMdast = {
          type: 'commentBlock',
          children: [strippedPercent],
          data: { sourceForm: 'percent', sourceLayout: 'inline' },
        };
        children.splice(i, 1, block as unknown as RootContent);
        i += 1;
        continue;
      }
    }

    if (child.type === 'paragraph' && isFenceOnlyParagraph(child)) {
      let j = i + 1;
      while (j < children.length) {
        const sibling = children[j];
        if (sibling.type === 'paragraph' && isFenceOnlyParagraph(sibling)) break;
        j += 1;
      }
      if (j < children.length && j > i + 1) {
        const inner = children.slice(i + 1, j);
        const block: CommentBlockMdast = {
          type: 'commentBlock',
          children: inner as Nodes[],
          data: { sourceForm: 'percent', sourceLayout: 'block' },
        };
        children.splice(i, j - i + 1, block as unknown as RootContent);
        i += 1;
        continue;
      }
    }

    i += 1;
  }
}

function isSingleTextParagraph(p: Paragraph): string | null {
  if (p.children.length !== 1) return null;
  const only = p.children[0];
  if (only.type !== 'text') return null;
  return only.value;
}

function matchSingleParagraphFence(value: string): string | null {
  const m = value.match(/^%%\n((?:.|\n(?!\n))+?)\n%%$/);
  return m === null ? null : m[1];
}

function matchHtmlCommentBlock(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('<!--') || !trimmed.endsWith('-->')) return null;
  const body = trimmed.slice(4, -3);
  if (body.includes('-->') || body.includes('<!--')) return null;
  const trimmedBody = body.trim();
  if (trimmedBody === '') return null;
  return trimmedBody;
}

function stripHtmlCommentDelimiters(p: Paragraph): Paragraph | null {
  if (p.children.length < 2) return null;
  const first = p.children[0];
  const last = p.children[p.children.length - 1];
  if (first.type !== 'text' || last.type !== 'text') return null;

  const firstTrimmed = first.value.trimStart();
  if (!firstTrimmed.startsWith('<!--')) return null;
  const lastTrimmed = last.value.trimEnd();
  if (!lastTrimmed.endsWith('-->')) return null;

  for (let i = 0; i < p.children.length; i++) {
    const ch = p.children[i];
    if (ch.type !== 'text') continue;
    const v = ch.value;
    if (i === 0) {
      if (countOccurrences(v, '<!--') > 1 || countOccurrences(v, '-->') > 0) return null;
    } else if (i === p.children.length - 1) {
      if (countOccurrences(v, '<!--') > 0 || countOccurrences(v, '-->') > 1) return null;
    } else {
      if (v.includes('<!--') || v.includes('-->')) return null;
    }
  }

  let strippedFirst = firstTrimmed.slice(4);
  if (strippedFirst.startsWith(' ')) strippedFirst = strippedFirst.slice(1);
  let strippedLast = lastTrimmed.slice(0, -3);
  if (strippedLast.endsWith(' ')) strippedLast = strippedLast.slice(0, -1);

  const newChildren: Paragraph['children'] = [];
  if (strippedFirst.length > 0) {
    newChildren.push({ ...first, value: strippedFirst } as Text);
  }
  for (let i = 1; i < p.children.length - 1; i++) {
    newChildren.push(p.children[i]);
  }
  if (strippedLast.length > 0) {
    newChildren.push({ ...last, value: strippedLast } as Text);
  }
  if (newChildren.length === 0) return null;

  return { type: 'paragraph', children: newChildren };
}

function stripPercentDelimiters(p: Paragraph): Paragraph | null {
  if (p.children.length < 2) return null;
  const first = p.children[0];
  const last = p.children[p.children.length - 1];
  if (first.type !== 'text' || last.type !== 'text') return null;

  const firstTrimmed = first.value.trimStart();
  if (!firstTrimmed.startsWith('%%') || firstTrimmed.startsWith('%%%')) return null;
  const lastTrimmed = last.value.trimEnd();
  if (!lastTrimmed.endsWith('%%') || lastTrimmed.endsWith('%%%')) return null;

  let strippedFirst = firstTrimmed.slice(2);
  if (strippedFirst.startsWith(' ')) strippedFirst = strippedFirst.slice(1);
  let strippedLast = lastTrimmed.slice(0, -2);
  if (strippedLast.endsWith(' ')) strippedLast = strippedLast.slice(0, -1);

  if (strippedFirst.indexOf('%%') !== -1) return null;
  if (strippedLast.indexOf('%%') !== -1) return null;
  for (let i = 1; i < p.children.length - 1; i++) {
    const ch = p.children[i];
    if (ch.type === 'text' && ch.value.indexOf('%%') !== -1) return null;
  }

  const middleHasContent = p.children.slice(1, -1).some((ch) => {
    if (ch.type === 'text') return ch.value.trim().length > 0;
    return true; // any non-text child counts as content
  });
  const hasContent =
    middleHasContent || strippedFirst.trim().length > 0 || strippedLast.trim().length > 0;
  if (!hasContent) return null;

  const newChildren: Paragraph['children'] = [];
  if (strippedFirst.length > 0) {
    newChildren.push({ ...first, value: strippedFirst } as Text);
  }
  for (let i = 1; i < p.children.length - 1; i++) {
    newChildren.push(p.children[i]);
  }
  if (strippedLast.length > 0) {
    newChildren.push({ ...last, value: strippedLast } as Text);
  }
  if (newChildren.length === 0) return null;

  return { type: 'paragraph', children: newChildren };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count += 1;
    from = idx + needle.length;
  }
  return count;
}

function isFenceOnlyParagraph(p: Paragraph): boolean {
  const text = isSingleTextParagraph(p);
  if (text === null) return false;
  return text.trim() === '%%';
}
