/**
 * Comment (`%%text%%`) promoter — Obsidian-aligned hidden-text recognizer.
 *
 * Four source forms collapse onto two mdast types: an inline `comment`
 * mark and a block-level `commentBlock` node. `index.ts` maps the inline
 * mark onto the PM `comment` mark (custom `CommentMark` extension in
 * `extensions/comment-mark.ts`) and the block onto the PM `commentBlock`
 * node (`extensions/comment-block.ts`):
 *
 *   1. `%%text%%` markdown (inline)        — heuristic walker over
 *      `text` mdast nodes; emits `comment`.
 *   2. `<Comment>text</Comment>` MDX inline JSX — promotion of
 *      `mdxJsxTextElement` whose `name === 'Comment'`; emits `comment`.
 *   3. `<Comment>...</Comment>` MDX flow JSX  — promotion of
 *      `mdxJsxFlowElement` whose `name === 'Comment'`; emits
 *      `commentBlock`.
 *   4. `%%\n…\n%%` markdown (block fence)  — root-level paragraph
 *      walker (`handleBlockCommentsAtRoot`) recognizing both Case A
 *      (single-paragraph compact) and Case B (blank-line-padded multi-
 *      paragraph) shapes; emits `commentBlock`.
 *
 * Extends the shape of `highlight-promoter.ts` (which mirrored
 * `single-dollar-math-promoter.ts`): a single `unified` plugin factory,
 * four passes inside one transformer (two `unist-util-visit` passes for
 * inline forms, one for MDX flow JSX, one root-children walker for the
 * block fence). Highlight has only the inline pair; comment adds the
 * block-level pair because hidden multi-paragraph blocks are a distinct
 * Obsidian-parity authoring shape — multi-line blocks like `%%\n…\n%%`
 * are common author-private notes that don't fit on one line.
 *
 * ## Heuristic (matches Obsidian behavior for inline `%%…%%`)
 *
 * `%%text%%` parses as inline comment when ALL of:
 *
 *   1. Opening `%%` is NOT preceded by another `%` (so URL-encoded
 *      `%2F`-class sequences and triple-percent edges don't claim a
 *      phantom open).
 *   2. Opening `%%` is followed by a non-whitespace character.
 *   3. The body contains no newline (inline-only — multi-line hidden
 *      blocks live via the `%%\n…\n%%` markdown fence or the
 *      `<Comment>…</Comment>` MDX flow form, both handled below).
 *   4. The body's last character is non-whitespace AND non-`%`
 *      (right-flanking + rejects triple-`%` edges).
 *   5. Closing `%%` is NOT followed by another `%`.
 *
 * The lazy quantifier in the body PLUS the right-flanking rule give
 * flanking-aware behavior despite a simple regex, mirroring the
 * highlight precedent:
 *
 *   - `%%a%% %%b%%`        → two comments `a`, `b`.
 *   - `%%a%%b%%`           → one comment `a`; trailing `b%%` stays prose.
 *   - `%%a %% b%%`          → one comment with body `a %% b` (the inner
 *      `%%` is whitespace-flanked on both sides, so it can't close —
 *      body extends to the next valid right-flanking close).
 *
 * ## Rejection cases (stay prose)
 *
 *   - `%text%`              — single `%` is not a delimiter.
 *   - `%%%` / `%%%%`        — no body slot ending in non-`%`.
 *   - `%% text%%`           — open is space-before content (rule 2 fails).
 *   - `%%text %%`           — close is space-after content (rule 4 fails).
 *   - `%%text\n more%%`     — body crosses newline (rule 3 fails).
 *   - `100%% off`           — paired `%%` at word-end with no closing
 *                             pair on the line; stays prose.
 *   - URL-encoded chars     — `https://example.com/%20%40` has single
 *                             `%` chars separated by hex; no contiguous
 *                             `%%` pair, no claim.
 *
 * ## Source-form fidelity
 *
 * `data.sourceForm` distinguishes which authoring form produced the node:
 *
 *   - `'markdown'` — came from `%%…%%`. Serializes back to `%%…%%`.
 *   - `'mdx'`      — came from `<Comment>…</Comment>`. Serializes back to
 *      `<Comment>…</Comment>` so authors who wrote MDX get MDX back.
 *
 * `to-markdown-handlers.ts` reads `data.sourceForm` and dispatches; default
 * (no `sourceForm`, e.g. for marks created in the editor) is `%%…%%` (the
 * shorter canonical form, matching Obsidian and the slash-menu insertion).
 *
 * The PM `comment` mark drops sourceForm on round-trip (no `sourceForm`
 * attribute), so MDX-authored `<Comment>` collapses to `%%…%%` on first
 * save — same one-way normalization documented for `$x$` → `$$x$$` on
 * the math side and `<Highlight>` → `==…==` on the highlight side.
 *
 * ## When it runs
 *
 * Wired in `pipeline.ts` AFTER `highlightPromoterPlugin` (so highlight
 * claims its `==` bytes first; `==` and `%%` don't overlap, but the
 * ordering keeps the chain consistent and predictable) and BEFORE
 * `mergedPostParseWalkerPlugin`. Code spans (`inlineCode`), block code
 * (`code`), math nodes (`math`, `inlineMath`), and wiki-link atoms are
 * leaf mdast types — `visit` with type `'text'` does not descend into
 * their `value` strings, so `%%` literals inside them stay intact.
 */

import type { Nodes, Paragraph, Parent, PhrasingContent, Root, RootContent, Text } from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';
import { SKIP, visit } from 'unist-util-visit';
import type { CommentBlockMdast, CommentMdast } from './mdast-augmentation.ts';

const COMMENT_RE = /(?<!%)%%(?=\S)([^\n]*?[^\s%])%%(?!%)/g;

export function commentPromoterPlugin() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (parent === undefined || index === undefined || index === null) return;

      const value = node.value;
      if (value.indexOf('%%') === -1) return;

      COMMENT_RE.lastIndex = 0;
      const matches: RegExpExecArray[] = [];
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
      while ((m = COMMENT_RE.exec(value)) !== null) {
        matches.push(m);
      }
      if (matches.length === 0) return;

      const replacements: PhrasingContent[] = [];
      let cursor = 0;
      for (const match of matches) {
        const start = match.index;
        const end = start + match[0].length;
        if (start > cursor) {
          const lead: Text = { type: 'text', value: value.slice(cursor, start) };
          replacements.push(lead);
        }
        const commentNode: CommentMdast = {
          type: 'comment',
          children: [{ type: 'text', value: match[1] }],
          data: { sourceForm: 'markdown' },
        };
        replacements.push(commentNode as unknown as PhrasingContent);
        cursor = end;
      }
      if (cursor < value.length) {
        const tail: Text = { type: 'text', value: value.slice(cursor) };
        replacements.push(tail);
      }

      const arr = (parent as { children: PhrasingContent[] }).children;
      arr.splice(index, 1, ...replacements);
      return [SKIP, index + replacements.length];
    });

    visit(tree, 'mdxJsxTextElement', (node: MdxJsxTextElement, index, parent) => {
      if (parent === undefined || index === undefined || index === null) return;
      if (node.name !== 'Comment') return;

      const commentNode: CommentMdast = {
        type: 'comment',
        children: (node.children as Nodes[]) ?? [],
        data: { sourceForm: 'mdx' },
      };

      const arr = (parent as Parent).children;
      arr.splice(index, 1, commentNode as unknown as (typeof arr)[number]);
      return index + 1;
    });

    visit(tree, 'mdxJsxFlowElement', (node: MdxJsxFlowElement, index, parent) => {
      if (parent === undefined || index === undefined || index === null) return;
      if (node.name !== 'Comment') return;

      const block: CommentBlockMdast = {
        type: 'commentBlock',
        children: (node.children as Nodes[]) ?? [],
        data: { sourceForm: 'mdx' },
      };

      const arr = (parent as Parent).children;
      arr.splice(index, 1, block as unknown as (typeof arr)[number]);
      return index + 1;
    });

    handleBlockCommentsAtRoot(tree);
  };
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
            data: { sourceForm: 'markdown' },
          };
          children.splice(i, 1, block as unknown as RootContent);
          i += 1;
          continue;
        }
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
          data: { sourceForm: 'markdown' },
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

function isFenceOnlyParagraph(p: Paragraph): boolean {
  const text = isSingleTextParagraph(p);
  if (text === null) return false;
  return text.trim() === '%%';
}
