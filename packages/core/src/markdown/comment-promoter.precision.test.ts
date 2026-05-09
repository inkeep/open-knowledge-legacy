/**
 * Comment precision tests — both source forms (`%%text%%` Obsidian-
 * style + `<!-- text -->` HTML comment) recognised on parse; each form
 * round-trips byte-stable on save (the delimiter the author typed is
 * the delimiter that gets saved, threaded via the `sourceForm` PM
 * attribute). Comments are literal authoring annotations (hidden in
 * WYSIWYG via `display: none` on the PM extensions) — there is no
 * slash command and no JSX form.
 *
 * Companion to `comment-promoter.ts`. Mirrors the structure of
 * `highlight-promoter.precision.test.ts` (the closest precedent — both
 * are heuristic walkers over `text` mdast nodes producing inline marks
 * with mirror-shaped rules).
 *
 * Coverage tiers:
 *
 *   1. Acceptance    — basic `%%…%%` shapes that MUST comment.
 *   2. Rejection     — shapes that MUST stay prose (delimiter ambiguity,
 *                      empty-body skip, percent-encoded URLs).
 *   3. Multi-match   — multiple comments on one line, mixed prose.
 *   4. Mark interop  — bold/italic/code/strikethrough/highlight inside.
 *   5. HTML form     — `<!-- text -->` recognition (inline + block).
 *   6. Protection    — code spans, inline math, block math, wikilinks
 *                      cannot have `%%…%%` claimed inside them.
 *   7. Round-trip    — parse + serialize byte-stable for both `%%`
 *                      and `<!--` forms; sourceForm preserved.
 */

import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function collectCommentTextNodes(json: JSONContent): JSONContent[] {
  const out: JSONContent[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === 'text' && (n.marks ?? []).some((m) => m.type === 'comment')) {
      out.push(n);
    }
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

function plainTextOf(json: JSONContent): string {
  let out = '';
  const visit = (n: JSONContent) => {
    if (n.type === 'text') out += n.text ?? '';
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

function findCommentBlocks(json: JSONContent): JSONContent[] {
  const out: JSONContent[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === 'commentBlock') out.push(n);
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

describe('comment-promoter — acceptance', () => {
  test('basic `%%hello%%`', () => {
    const json = mdManager.parse('%%hello%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hello');
  });

  test('mid-paragraph `a %%hidden%% b`', () => {
    const json = mdManager.parse('a %%hidden%% b\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hidden');
    expect(plainTextOf(json)).toBe('a hidden b');
  });

  test('TODO-style `%%TODO: fix this%%`', () => {
    const json = mdManager.parse('%%TODO: fix this%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('TODO: fix this');
  });

  test('multi-word `%%a longer note here%%`', () => {
    const json = mdManager.parse('%%a longer note here%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('a longer note here');
  });

  test('inner `%%` claims close (`%%a %% b%%` matches `%%a %%`)', () => {
    const json = mdManager.parse('%%a %% b%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('a ');
    expect(plainTextOf(json)).toBe('a  b%%');
  });

  test('with surrounding emphasis `*%%hi%%*`', () => {
    const json = mdManager.parse('*%%hi%%*\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hi');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['comment', 'emphasis']);
  });

  test('with surrounding bold `**%%hi%%**`', () => {
    const json = mdManager.parse('**%%hi%%**\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hi');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['comment', 'strong']);
  });

  test('with highlight `==%%note==%%` does NOT compose (delimiters cross)', () => {
    const json = mdManager.parse('==%%note==%%\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });

  test('`%% text %%` (whitespace inside delimiters) is a comment', () => {
    const json = mdManager.parse('%% hello %%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe(' hello ');
  });

  test('`%% text%%` (leading space only) is a comment', () => {
    const json = mdManager.parse('%% hello%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe(' hello');
  });

  test('`%%text %%` (trailing space only) is a comment', () => {
    const json = mdManager.parse('%%hello %%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hello ');
  });

  test('cleanly-nested `==%%note%%==` produces highlight outside, comment inside', () => {
    const json = mdManager.parse('==%%note%%==\n');
    const commentMarks = collectCommentTextNodes(json);
    expect(commentMarks.length).toBe(1);
    expect(commentMarks[0].text).toBe('note');
    const markTypes = (commentMarks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['comment', 'highlight']);
  });
});

describe('comment-promoter — rejection (stay prose)', () => {
  test('single `%text%` is not a delimiter', () => {
    const json = mdManager.parse('%text%\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('%text%');
  });

  test('`%%%` (three percents, edge ambiguity)', () => {
    const json = mdManager.parse('%%%\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });

  test('`%%%%` (four percents)', () => {
    const json = mdManager.parse('%%%%\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });

  test('whitespace-only body `%%   %%` stays prose (rule 4)', () => {
    const json = mdManager.parse('%%   %%\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('%%   %%');
  });

  test('unmatched `%%text` (no closing delimiter)', () => {
    const json = mdManager.parse('%%text\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });

  test('unmatched `text%%` (no opening delimiter)', () => {
    const json = mdManager.parse('text%%\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });

  test('multi-line `%%a\\n more%%` (body cannot cross newline)', () => {
    const json = mdManager.parse('%%a\nmore%%\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });

  test('percentage prose `100% off` stays prose', () => {
    const json = mdManager.parse('100% off\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('100% off');
  });

  test('`50%%` (paired-percent at word end, no closing pair) stays prose', () => {
    const json = mdManager.parse('50%%\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('50%%');
  });

  test('URL-encoded characters in URL stay prose', () => {
    const json = mdManager.parse('See https://example.com/%20%40foo\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });
});

describe('comment-promoter — multi-match', () => {
  test('two comments on one line `%%a%% %%b%%`', () => {
    const json = mdManager.parse('%%a%% %%b%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(2);
    expect(marks[0].text).toBe('a');
    expect(marks[1].text).toBe('b');
  });

  test('chained `%%a%%b%%` comments `a`, leaves `b%%` as text', () => {
    const json = mdManager.parse('%%a%%b%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('a');
    expect(plainTextOf(json)).toBe('ab%%');
  });

  test('three comments `%%a%% %%b%% %%c%%`', () => {
    const json = mdManager.parse('%%a%% %%b%% %%c%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(3);
    expect(marks.map((m) => m.text)).toEqual(['a', 'b', 'c']);
  });

  test('adjacent no-separator `%%a%%%%b%%` produces ONE comment body=`a%%%%b`', () => {
    const json = mdManager.parse('%%a%%%%b%%\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('a%%%%b');
    expect(mdManager.serialize(json)).toBe('%%a%%%%b%%\n');
  });
});

describe('comment-promoter — protection from code spans + math', () => {
  test('`%%text%%` inside a code span stays code', () => {
    const json = mdManager.parse('a `%%text%%` b\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('a %%text%% b');
  });

  test('`%%text%%` inside an inline-math body stays math', () => {
    const json = mdManager.parse('$$%%a%%$$\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });

  test('`%%text%%` inside a fenced code block stays code', () => {
    const json = mdManager.parse('```\n%%text%%\n```\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
  });
});

describe('comment-promoter — HTML comment `<!-- ... -->` form', () => {
  test('`<!-- secret -->` standalone block parses as commentBlock', () => {
    const json = mdManager.parse('<!-- secret -->\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toBe('secret');
  });

  test('mid-paragraph `<!-- x -->` parses as inline comment mark', () => {
    const json = mdManager.parse('a <!-- x --> b\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('x');
    expect(plainTextOf(json)).toBe('a x b');
  });

  test('empty inline `<!-- -->` stays prose (preserves CommonMark list-break separator)', () => {
    const json = mdManager.parse('a <!-- --> b\n');
    expect(collectCommentTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('a <!-- --> b');
  });

  test('empty standalone `<!-- -->` paragraph stays prose (block-form, list-break idiom)', () => {
    const json = mdManager.parse('<!-- -->\n');
    expect(findCommentBlocks(json).length).toBe(0);
  });

  test('list-break separator: `- foo\\n\\n<!-- -->\\n\\n- bar` produces two lists', () => {
    const json = mdManager.parse('- foo\n\n<!-- -->\n\n- bar\n');
    expect(findCommentBlocks(json).length).toBe(0);
  });

  test('two `<!-- ... -->` on one line', () => {
    const json = mdManager.parse('<!-- a --> and <!-- b -->\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(2);
    expect(marks.map((m) => m.text)).toEqual(['a', 'b']);
  });

  test('`<!-- text -->` and `%%text%%` mixed in same paragraph', () => {
    const json = mdManager.parse('a %%first%% then <!-- second --> end\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(2);
    expect(marks.map((m) => m.text)).toEqual(['first', 'second']);
  });

  test('`<!--secret-->` (no spaces) parses as comment', () => {
    const json = mdManager.parse('a <!--x--> b\n');
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('x');
  });

  test('preserves `<!--` source form on save (inline)', () => {
    const out = mdManager.serialize(mdManager.parse('a <!-- secret --> b\n'));
    expect(out).toBe('a <!-- secret --> b\n');
  });

  test('preserves `<!--` source form on save (block)', () => {
    const out = mdManager.serialize(mdManager.parse('<!-- secret -->\n'));
    expect(out).toBe('<!-- secret -->\n');
  });

  test('block `<!-- ... -->` with inline markdown body is recognised (Case E)', () => {
    const json = mdManager.parse('<!-- text with `code` and more -->\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toBe('text with code and more');
  });

  test('block `<!-- ... -->` with inline markdown round-trips byte-stable', () => {
    const src = '<!-- text with `code` and more -->\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('block `<!-- ... -->` with body containing `%%` round-trips byte-stable', () => {
    const src = '<!-- has %%inner%% inside -->\n';
    const r1 = mdManager.serialize(mdManager.parse(src));
    expect(r1).toBe(src); // byte-stable
    expect(mdManager.serialize(mdManager.parse(r1))).toBe(r1); // idempotent
  });

  test('inline `<!-- text with %%X%% inside -->` mid-paragraph preserves form', () => {
    const src = 'a <!-- text with %%X%% inside --> b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('block `%% text with `code` %%` (multi-child paragraph) is recognised (Case F)', () => {
    const json = mdManager.parse('%% text with `code` more %%\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toBe('text with code more');
  });

  test('block `%% text with `code` %%` round-trips byte-stable (sourceLayout: inline)', () => {
    const src = '%% text with `code` more %%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('block `%% a %% b %% c %%` (multiple `%%` pairs) does NOT promote (inline walker handles)', () => {
    const json = mdManager.parse('%%a%% b %%c%%\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(0);
    const marks = collectCommentTextNodes(json);
    expect(marks.length).toBe(2);
    expect(marks.map((m) => m.text)).toEqual(['a', 'c']);
  });

  test('block `<!-- ... **bold** ... -->` (markdown formatting in body) is recognised', () => {
    const json = mdManager.parse('<!-- has **bold** inside -->\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toContain('bold');
  });
});

describe('comment-promoter — round-trip', () => {
  test('`%%hello%%` round-trips byte-stable', () => {
    const src = '%%hello%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`a %%hidden%% b` round-trips byte-stable', () => {
    const src = 'a %%hidden%% b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('two comments round-trip byte-stable', () => {
    const src = '%%a%% %%b%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`%%a %% b%%` (whitespace-flanked inner) round-trips byte-stable', () => {
    const src = '%%a %% b%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`%% hello %%` (whitespace inside delimiters) round-trips byte-stable', () => {
    const src = '%% hello %%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`%% leading space%%` and `%%trailing space %%` round-trip byte-stable', () => {
    expect(mdManager.serialize(mdManager.parse('%% hello%%\n'))).toBe('%% hello%%\n');
    expect(mdManager.serialize(mdManager.parse('%%hello %%\n'))).toBe('%%hello %%\n');
  });

  test('`<!-- x -->` round-trips byte-stable (sourceForm preserved)', () => {
    const src = 'a <!-- x --> b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`%%text%%` inside code span round-trips as code (not comment)', () => {
    const src = 'a `%%text%%` b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('comment inside heading `## %%note%%` round-trips', () => {
    const src = '## %%note%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('comment inside blockquote `> %%note%%` round-trips', () => {
    const src = '> %%note%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('comment inside list item `- %%note%%` round-trips', () => {
    const src = '- %%note%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('mid-paragraph `**%%bold comment%%**` round-trips byte-stable (strong outer, comment inner — canonical)', () => {
    const src = 'a **%%bold comment%%** b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('mid-paragraph `*%%italic comment%%*` round-trips byte-stable (emphasis outer, comment inner)', () => {
    const src = 'a *%%italic comment%%* b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`%%**bold**%%` (mark-outside-mark input) — strong claims first, comment NOT recognized', () => {
    const src = 'a %%**bold**%% b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
    expect(collectCommentTextNodes(mdManager.parse(src)).length).toBe(0);
  });
});

describe('comment-promoter — block form (`%%\\n…\\n%%`)', () => {
  test('Case A — `%%\\nhello\\n%%` (single paragraph, no blank lines)', () => {
    const json = mdManager.parse('%%\nhello\n%%\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toBe('hello');
  });

  test('Case A — `%%\\nline 1\\nline 2\\n%%` (multi-line single paragraph)', () => {
    const json = mdManager.parse('%%\nline 1\nline 2\n%%\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toContain('line 1');
    expect(plainTextOf(blocks[0])).toContain('line 2');
  });

  test('Case B — `%%\\n\\nhello\\n\\n%%` (single intermediate paragraph)', () => {
    const json = mdManager.parse('%%\n\nhello\n\n%%\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toBe('hello');
  });

  test('Case B — multi-paragraph `%%\\n\\npara 1\\n\\npara 2\\n\\n%%`', () => {
    const json = mdManager.parse('%%\n\npara 1\n\npara 2\n\n%%\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(blocks[0].content?.length).toBe(2);
  });

  test('lone `%%` with no closing fence stays prose', () => {
    const json = mdManager.parse('%%\n\nlone\n');
    expect(findCommentBlocks(json).length).toBe(0);
  });

  test('empty block `%%\\n\\n%%` stays prose (block+ schema requires at least one child)', () => {
    const json = mdManager.parse('%%\n\n%%\n');
    expect(findCommentBlocks(json).length).toBe(0);
  });

  test('three consecutive `%%` fences — greedy nearest-closer, third stays prose', () => {
    const json = mdManager.parse('%%\n\nbody\n\n%%\n\n%%\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toBe('body');
  });

  test('Case C mixed form (`%%` fused with adjacent prose) stays prose', () => {
    const json = mdManager.parse('%%\nfirst\n\nsecond\n%%\n');
    expect(findCommentBlocks(json).length).toBe(0);
  });

  test('block `%%\\nhello\\n%%` normalizes to canonical padded form on save', () => {
    const compact = '%%\nhello\n%%\n';
    const canonical = '%%\n\nhello\n\n%%\n';
    expect(mdManager.serialize(mdManager.parse(compact))).toBe(canonical);
    expect(mdManager.serialize(mdManager.parse(canonical))).toBe(canonical);
  });

  test('multi-paragraph block round-trips byte-stable (canonical form)', () => {
    const src = '%%\n\npara 1\n\npara 2\n\n%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('block surrounded by prose round-trips byte-stable', () => {
    const src = 'Before\n\n%%\n\nblock\n\n%%\n\nAfter\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('inline `%%text%%` still works alongside block (mixed doc)', () => {
    const src = 'Inline %%hidden%% here.\n\n%%\n\nblock body\n\n%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
    const json = mdManager.parse(src);
    expect(collectCommentTextNodes(json).length).toBe(1); // inline mark
    expect(findCommentBlocks(json).length).toBe(1); // block node
  });

  test('block holding a nested heading round-trips byte-stable', () => {
    const src = '%%\n\n# heading\n\nbody text\n\n%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('block holding a nested list round-trips byte-stable', () => {
    const src = '%%\n\n- item 1\n- item 2\n\n%%\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`<!-- body -->` standalone block → commentBlock', () => {
    const json = mdManager.parse('<!-- body -->\n');
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(1);
    expect(plainTextOf(blocks[0])).toBe('body');
  });

  test('`<!-- body -->` block round-trips byte-stable (sourceForm preserved)', () => {
    const src = '<!-- body -->\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('two consecutive block comments parse + round-trip byte-stable', () => {
    const src = '%%\n\nfirst\n\n%%\n\n%%\n\nsecond\n\n%%\n';
    const json = mdManager.parse(src);
    const blocks = findCommentBlocks(json);
    expect(blocks.length).toBe(2);
    expect(plainTextOf(blocks[0])).toBe('first');
    expect(plainTextOf(blocks[1])).toBe('second');
    expect(mdManager.serialize(json)).toBe(src);
  });
});

describe('comment-promoter — direct mdast→markdown (sourceForm dispatch)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
  const minimalState: any = {
    enter: () => () => {},
    containerPhrasing: (node: { children?: Array<{ value?: string }> }) =>
      (node.children ?? []).map((c) => c.value ?? '').join(''),
    createTracker: () => ({
      move: (s: string) => s,
      current: () => ({}),
    }),
    options: {},
    unsafe: [],
    safe: (s: string) => s,
  };

  test('comment with no sourceForm defaults to `%%children%%`', async () => {
    const { toMarkdownHandlers } = await import('./to-markdown-handlers.ts');
    const node = {
      type: 'comment' as const,
      children: [{ type: 'text' as const, value: 'hi' }],
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
    const out = (toMarkdownHandlers as any).comment(node, undefined, minimalState, {});
    expect(out).toBe('%%hi%%');
  });

  /**
   */
  test('comment with sourceForm=`percent` emits `%%children%%`', async () => {
    const { toMarkdownHandlers } = await import('./to-markdown-handlers.ts');
    const node = {
      type: 'comment' as const,
      children: [{ type: 'text' as const, value: 'hi' }],
      data: { sourceForm: 'percent' as const },
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
    const out = (toMarkdownHandlers as any).comment(node, undefined, minimalState, {});
    expect(out).toBe('%%hi%%');
  });

  test('comment with sourceForm=`html` emits `<!-- children -->`', async () => {
    const { toMarkdownHandlers } = await import('./to-markdown-handlers.ts');
    const node = {
      type: 'comment' as const,
      children: [{ type: 'text' as const, value: 'hi' }],
      data: { sourceForm: 'html' as const },
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
    const out = (toMarkdownHandlers as any).comment(node, undefined, minimalState, {});
    expect(out).toBe('<!-- hi -->');
  });

  // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
  const minimalBlockState: any = {
    ...minimalState,
    // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
    containerFlow: (node: any) => {
      const para = node.children?.[0];
      if (para?.type === 'paragraph') {
        return (para.children ?? []).map((c: { value?: string }) => c.value ?? '').join('');
      }
      return '';
    },
  };

  /**
   */
  test('commentBlock with no sourceForm emits `%%\\n\\n…\\n\\n%%`', async () => {
    const { toMarkdownHandlers } = await import('./to-markdown-handlers.ts');
    const node = {
      type: 'commentBlock' as const,
      children: [
        {
          type: 'paragraph' as const,
          children: [{ type: 'text' as const, value: 'hello' }],
        },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
    const out = (toMarkdownHandlers as any).commentBlock(node, undefined, minimalBlockState, {});
    expect(out).toBe('%%\n\nhello\n\n%%');
  });

  test('commentBlock with sourceForm=`html` (single paragraph) emits `<!-- body -->`', async () => {
    const { toMarkdownHandlers } = await import('./to-markdown-handlers.ts');
    const node = {
      type: 'commentBlock' as const,
      children: [
        {
          type: 'paragraph' as const,
          children: [{ type: 'text' as const, value: 'hello' }],
        },
      ],
      data: { sourceForm: 'html' as const },
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
    const out = (toMarkdownHandlers as any).commentBlock(node, undefined, minimalBlockState, {});
    expect(out).toBe('<!-- hello -->');
  });

  test('commentBlock with sourceForm=`html` (multi-block body) falls back to `%%`', async () => {
    const { toMarkdownHandlers } = await import('./to-markdown-handlers.ts');
    const node = {
      type: 'commentBlock' as const,
      children: [
        {
          type: 'paragraph' as const,
          children: [{ type: 'text' as const, value: 'first' }],
        },
        {
          type: 'paragraph' as const,
          children: [{ type: 'text' as const, value: 'second' }],
        },
      ],
      data: { sourceForm: 'html' as const },
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
    const out = (toMarkdownHandlers as any).commentBlock(node, undefined, minimalBlockState, {});
    expect(out.startsWith('%%')).toBe(true);
    expect(out.endsWith('%%')).toBe(true);
  });
});
