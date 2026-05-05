import { describe, expect, test } from 'bun:test';
import type { Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';
import { positionSlicePlugin } from './position-slice.ts';

type AnyNode = Nodes & { data?: Record<string, unknown> };

function parseMdast(source: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm).use(positionSlicePlugin);
  const tree = processor.parse(source);
  processor.runSync(tree, new VFile({ value: source }));
  return tree;
}

function findNode<T extends AnyNode = AnyNode>(tree: Root, type: string): T {
  let found: AnyNode | null = null;
  visit(tree, type, (node) => {
    if (!found) found = node as AnyNode;
  });
  return found as unknown as T;
}

function findNodes<T extends AnyNode = AnyNode>(tree: Root, type: string): T[] {
  const nodes: AnyNode[] = [];
  visit(tree, type, (node) => {
    nodes.push(node as AnyNode);
  });
  return nodes as T[];
}

describe('position-slice: emphasis delimiter recovery', () => {
  test('asterisk emphasis → data.sourceDelimiter = "*"', () => {
    const tree = parseMdast('This is *emphasized* text.\n');
    const em = findNode(tree, 'emphasis');
    expect(em).toBeDefined();
    expect(em.data?.sourceDelimiter).toBe('*');
  });

  test('underscore emphasis → data.sourceDelimiter = "_"', () => {
    const tree = parseMdast('This is _emphasized_ text.\n');
    const em = findNode(tree, 'emphasis');
    expect(em).toBeDefined();
    expect(em.data?.sourceDelimiter).toBe('_');
  });
});

describe('position-slice: strong delimiter recovery', () => {
  test('double-asterisk strong → data.sourceDelimiter = "**"', () => {
    const tree = parseMdast('This is **strong** text.\n');
    const strong = findNode(tree, 'strong');
    expect(strong).toBeDefined();
    expect(strong.data?.sourceDelimiter).toBe('**');
  });

  test('double-underscore strong → data.sourceDelimiter = "__"', () => {
    const tree = parseMdast('This is __strong__ text.\n');
    const strong = findNode(tree, 'strong');
    expect(strong).toBeDefined();
    expect(strong.data?.sourceDelimiter).toBe('__');
  });
});

describe('position-slice: heading style recovery', () => {
  test('ATX heading → data.sourceStyle = "atx"', () => {
    const tree = parseMdast('# Heading\n');
    const heading = findNode(tree, 'heading');
    expect(heading).toBeDefined();
    expect(heading.data?.sourceStyle).toBe('atx');
  });

  test('setext heading (=) → data.sourceStyle = "setext"', () => {
    const tree = parseMdast('Heading\n=======\n');
    const heading = findNode(tree, 'heading');
    expect(heading).toBeDefined();
    expect(heading.data?.sourceStyle).toBe('setext');
  });

  test('setext heading (-) → data.sourceStyle = "setext"', () => {
    const tree = parseMdast('Heading\n-------\n');
    const heading = findNode(tree, 'heading');
    expect(heading).toBeDefined();
    expect(heading.data?.sourceStyle).toBe('setext');
  });
});

describe('position-slice: ATX trailing-hashes recovery (FR-15)', () => {
  test('matching closer count is captured', () => {
    const tree = parseMdast('## H ##\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBe(2);
  });

  test('asymmetric closer count is captured', () => {
    const tree = parseMdast('## H #####\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBe(5);
  });

  test('single trailing hash is captured', () => {
    const tree = parseMdast('### asymmetric trail #\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBe(1);
  });

  test('empty content with trailing closer is captured', () => {
    const tree = parseMdast('# ###\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBe(3);
  });

  test('no trailing closer leaves attr undefined', () => {
    const tree = parseMdast('## Plain heading\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBeUndefined();
  });

  test('hash without preceding space is content (no closer captured)', () => {
    const tree = parseMdast('## H#\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBeUndefined();
  });

  test('mid-content # run is not the closer', () => {
    const tree = parseMdast('## My ## heading\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBeUndefined();
  });

  test('trailing whitespace after the closer does not corrupt the count', () => {
    const tree = parseMdast('## H ##  \n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBe(2);
  });

  test('setext heading does not get a sourceTrailingHashes attr', () => {
    const tree = parseMdast('Heading\n=======\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceTrailingHashes).toBeUndefined();
    expect(heading.data?.sourceStyle).toBe('setext');
  });
});

describe('position-slice: setext underline length recovery (FR-22)', () => {
  test('H1 5-char underline → sourceUnderlineLength = 5', () => {
    const tree = parseMdast('H\n=====\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceStyle).toBe('setext');
    expect(heading.data?.sourceUnderlineLength).toBe(5);
  });

  test('H1 1-char underline (CommonMark minimum) → length 1', () => {
    const tree = parseMdast('H\n=\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceStyle).toBe('setext');
    expect(heading.data?.sourceUnderlineLength).toBe(1);
  });

  test('H1 11-char underline → length 11', () => {
    const tree = parseMdast('H\n===========\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceUnderlineLength).toBe(11);
  });

  test('H2 5-char underline (-) → length 5', () => {
    const tree = parseMdast('H\n-----\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceStyle).toBe('setext');
    expect(heading.data?.sourceUnderlineLength).toBe(5);
  });

  test('H2 1-char underline → length 1', () => {
    const tree = parseMdast('H\n-\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceUnderlineLength).toBe(1);
  });

  test('underline shorter than content captures actual underline run', () => {
    const tree = parseMdast('this is a long heading\n===\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceUnderlineLength).toBe(3);
  });

  test('ATX heading does NOT get sourceUnderlineLength', () => {
    const tree = parseMdast('## ATX H\n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceStyle).toBe('atx');
    expect(heading.data?.sourceUnderlineLength).toBeUndefined();
  });

  test('trailing whitespace after underline run does not inflate length', () => {
    const tree = parseMdast('H\n=====   \n');
    const heading = findNode(tree, 'heading');
    expect(heading.data?.sourceUnderlineLength).toBe(5);
  });
});

describe('position-slice: list marker recovery', () => {
  test('dash bullet → data.bulletMarker = "-"', () => {
    const tree = parseMdast('- item\n');
    const list = findNode(tree, 'list');
    expect(list).toBeDefined();
    expect(list.data?.bulletMarker).toBe('-');
  });

  test('asterisk bullet → data.bulletMarker = "*"', () => {
    const tree = parseMdast('* item\n');
    const list = findNode(tree, 'list');
    expect(list).toBeDefined();
    expect(list.data?.bulletMarker).toBe('*');
  });

  test('plus bullet → data.bulletMarker = "+"', () => {
    const tree = parseMdast('+ item\n');
    const list = findNode(tree, 'list');
    expect(list).toBeDefined();
    expect(list.data?.bulletMarker).toBe('+');
  });

  test('ordered list with dot → data.listMarkerDelimiter = "."', () => {
    const tree = parseMdast('1. item\n');
    const list = findNode(tree, 'list');
    expect(list).toBeDefined();
    expect(list.data?.listMarkerDelimiter).toBe('.');
  });

  test('ordered list with paren → data.listMarkerDelimiter = ")"', () => {
    const tree = parseMdast('1) item\n');
    const list = findNode(tree, 'list');
    expect(list).toBeDefined();
    expect(list.data?.listMarkerDelimiter).toBe(')');
  });
});

describe('position-slice: code fence recovery', () => {
  test('backtick fence → data.sourceFenceChar = "`", data.sourceFenceLength = 3', () => {
    const tree = parseMdast('```\ncode\n```\n');
    const code = findNode(tree, 'code');
    expect(code).toBeDefined();
    expect(code.data?.sourceFenceChar).toBe('`');
    expect(code.data?.sourceFenceLength).toBe(3);
  });

  test('tilde fence → data.sourceFenceChar = "~", data.sourceFenceLength = 3', () => {
    const tree = parseMdast('~~~\ncode\n~~~\n');
    const code = findNode(tree, 'code');
    expect(code).toBeDefined();
    expect(code.data?.sourceFenceChar).toBe('~');
    expect(code.data?.sourceFenceLength).toBe(3);
  });

  test('4-backtick fence → data.sourceFenceLength = 4', () => {
    const tree = parseMdast('````\ncode\n````\n');
    const code = findNode(tree, 'code');
    expect(code).toBeDefined();
    expect(code.data?.sourceFenceChar).toBe('`');
    expect(code.data?.sourceFenceLength).toBe(4);
  });
});

describe('position-slice: code block sourceStyle recovery (FR-21)', () => {
  test('backtick-fenced code → data.sourceStyle = "fenced"', () => {
    const tree = parseMdast('```\ncode\n```\n');
    const code = findNode(tree, 'code');
    expect(code.data?.sourceStyle).toBe('fenced');
  });

  test('tilde-fenced code → data.sourceStyle = "fenced"', () => {
    const tree = parseMdast('~~~\ncode\n~~~\n');
    const code = findNode(tree, 'code');
    expect(code.data?.sourceStyle).toBe('fenced');
  });

  test('indented code → data.sourceStyle = "indented"', () => {
    const tree = parseMdast('    code\n    line\n');
    const code = findNode(tree, 'code');
    expect(code.data?.sourceStyle).toBe('indented');
    expect(code.data?.sourceFenceChar).toBeUndefined();
    expect(code.data?.sourceFenceLength).toBeUndefined();
  });

  test('tab-indented code → data.sourceStyle = "indented"', () => {
    const tree = parseMdast('\tcode\n');
    const code = findNode(tree, 'code');
    expect(code.data?.sourceStyle).toBe('indented');
  });

  test('fenced with language preserves fenced sourceStyle', () => {
    const tree = parseMdast('```js\nx\n```\n');
    const code = findNode(tree, 'code');
    expect(code.data?.sourceStyle).toBe('fenced');
  });
});

describe('position-slice: thematic break recovery', () => {
  test('--- → data.sourceRaw = "---"', () => {
    const tree = parseMdast('---\n');
    const tb = findNode(tree, 'thematicBreak');
    expect(tb).toBeDefined();
    expect(tb.data?.sourceRaw).toBe('---');
  });

  test('*** → data.sourceRaw = "***"', () => {
    const tree = parseMdast('***\n');
    const tb = findNode(tree, 'thematicBreak');
    expect(tb).toBeDefined();
    expect(tb.data?.sourceRaw).toBe('***');
  });

  test('___ → data.sourceRaw = "___"', () => {
    const tree = parseMdast('___\n');
    const tb = findNode(tree, 'thematicBreak');
    expect(tb).toBeDefined();
    expect(tb.data?.sourceRaw).toBe('___');
  });

  test('spaced rule → data.sourceRaw preserves spaces', () => {
    const tree = parseMdast('* * *\n');
    const tb = findNode(tree, 'thematicBreak');
    expect(tb).toBeDefined();
    expect(tb.data?.sourceRaw).toBe('* * *');
  });
});

describe('position-slice: hard break recovery', () => {
  test('backslash break → data.sourceStyle = "backslash"', () => {
    const tree = parseMdast('line one\\\nline two\n');
    const brk = findNode(tree, 'break');
    expect(brk).toBeDefined();
    expect(brk.data?.sourceStyle).toBe('backslash');
  });

  test('two-space break → data.sourceStyle = "spaces"', () => {
    const tree = parseMdast('line one  \nline two\n');
    const brk = findNode(tree, 'break');
    expect(brk).toBeDefined();
    expect(brk.data?.sourceStyle).toBe('spaces');
  });
});

describe('position-slice: sourceRaw text preservation', () => {
  test('literal trailing backslash runs keep data.sourceRaw', () => {
    const triple = '\\'.repeat(3);
    const tree = parseMdast(`text ${triple}\n`);
    const textNodes = findNodes(tree, 'text');
    const trailing = textNodes.find((n) => n.value === `text ${'\\'.repeat(2)}`);
    expect(trailing).toBeDefined();
    expect(trailing?.data?.sourceRaw).toBe(`text ${triple}`);
  });

  test('escaped character plus trailing backslash records escapedChars and sourceRaw', () => {
    const trailing = '\\';
    const tree = parseMdast(`\\[text${trailing}\n`);
    const textNodes = findNodes(tree, 'text');
    const node = textNodes.find((n) => n.value === `[text${trailing}`);
    expect(node).toBeDefined();
    expect(node?.data?.escapedChars).toEqual([{ offset: 0, char: '[' }]);
    expect(node?.data?.sourceRaw).toBe(`\\[text${trailing}`);
  });
});

describe('position-slice: escapeMark tagging (D20)', () => {
  test('backslash-escaped # → data.escapedChars', () => {
    const tree = parseMdast('text \\# more\n');
    const textNodes = findNodes(tree, 'text');
    const escaped = textNodes.find((n) => {
      const e = n.data?.escapedChars as unknown[] | undefined;
      return !!e && e.length > 0;
    });
    expect(escaped).toBeDefined();
    expect(escaped?.data?.escapedChars).toEqual([{ offset: expect.any(Number), char: '#' }]);
  });

  test('backslash-escaped * → data.escapedChars', () => {
    const tree = parseMdast('text \\* more\n');
    const textNodes = findNodes(tree, 'text');
    const escaped = textNodes.find((n) => {
      const e = n.data?.escapedChars as unknown[] | undefined;
      return !!e && e.length > 0;
    });
    expect(escaped).toBeDefined();
    const chars = escaped?.data?.escapedChars as Array<{ char: string }>;
    expect(chars[0].char).toBe('*');
  });

  test('multiple escaped chars in one text run', () => {
    const tree = parseMdast('\\*literal\\*\n');
    const textNodes = findNodes(tree, 'text');
    const escaped = textNodes.find((n) => {
      const e = n.data?.escapedChars as unknown[] | undefined;
      return !!e && e.length > 0;
    });
    expect(escaped).toBeDefined();
    const chars = escaped?.data?.escapedChars as unknown[];
    expect(chars.length).toBeGreaterThanOrEqual(1);
  });

  test('non-ambiguous escape (\\foo) has no escapedChars', () => {
    const tree = parseMdast('text \\q more\n');
    const textNodes = findNodes(tree, 'text');
    const hasEscaped = textNodes.some((n) => {
      const e = n.data?.escapedChars as unknown[] | undefined;
      return !!e && e.length > 0;
    });
    expect(hasEscaped).toBe(false);
  });
});

describe('position-slice: fallback behavior', () => {
  test('walker does not crash on empty source', () => {
    expect(() => parseMdast('')).not.toThrow();
  });

  test('walker does not crash on source with no position data', () => {
    const processor = unified().use(remarkParse).use(positionSlicePlugin);
    const tree = processor.parse('hello\n');
    (tree as { position?: unknown }).position = undefined;
    expect(() => processor.runSync(tree, new VFile({ value: 'hello\n' }))).not.toThrow();
  });
});

describe('position-slice: GFM table dash-count recovery (FR-16)', () => {
  test(':---: → sourceDashCounts captures 3 dashes per column', () => {
    const tree = parseMdast('| x |\n| :---: |\n| 1234 |\n');
    const table = findNode(tree, 'table');
    expect(table?.data?.sourceDashCounts).toEqual([3]);
  });

  test('mixed dash counts captured per-column', () => {
    const tree = parseMdast('| a | b | c |\n| - | --- | ----- |\n| 1 | 2 | 3 |\n');
    const table = findNode(tree, 'table');
    expect(table?.data?.sourceDashCounts).toEqual([1, 3, 5]);
  });

  test('per-column align + dash count both captured', () => {
    const tree = parseMdast('| a | b | c |\n| :--- | :----: | -----: |\n| 1 | 2 | 3 |\n');
    const table = findNode(tree, 'table');
    expect(table?.data?.sourceDashCounts).toEqual([3, 4, 5]);
    expect((table as { align?: unknown[] } | null)?.align).toEqual(['left', 'center', 'right']);
  });

  test('canonical 1-dash form captured as count 1', () => {
    const tree = parseMdast('| a |\n| - |\n| 1 |\n');
    const table = findNode(tree, 'table');
    expect(table?.data?.sourceDashCounts).toEqual([1]);
  });

  test('pipe-less alignment row captured', () => {
    const tree = parseMdast('a | b\n--- | ---\n1 | 2\n');
    const table = findNode(tree, 'table');
    expect(table?.data?.sourceDashCounts).toEqual([3, 3]);
  });

  test('whitespace inside cells does not affect dash count', () => {
    const tree = parseMdast('| a |\n|  ---  |\n| 1 |\n');
    const table = findNode(tree, 'table');
    expect(table?.data?.sourceDashCounts).toEqual([3]);
  });

  test('asymmetric padding around colons preserved', () => {
    const tree = parseMdast('| a |\n| :----- |\n| 1 |\n');
    const table = findNode(tree, 'table');
    expect(table?.data?.sourceDashCounts).toEqual([5]);
  });
});

describe('position-slice: GFM bare-URL autolink detection (FR-17)', () => {
  test('bare https URL tagged with sourceStyle=gfm-autolink', () => {
    const tree = parseMdast('visit https://example.com today\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).toBe('gfm-autolink');
  });

  test('bare http URL tagged with sourceStyle=gfm-autolink', () => {
    const tree = parseMdast('see http://x.com here\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).toBe('gfm-autolink');
  });

  test('bare email autolink tagged with sourceStyle=gfm-autolink', () => {
    const tree = parseMdast('reach a@b.com please\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).toBe('gfm-autolink');
  });

  test('bare www host tagged with sourceStyle=gfm-autolink', () => {
    const tree = parseMdast('use www.example.com today\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).toBe('gfm-autolink');
  });

  test('explicit inline link [text](url) NOT tagged as gfm-autolink', () => {
    const tree = parseMdast('[click](https://example.com)\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).not.toBe('gfm-autolink');
  });

  test('text==url inline link NOT tagged as gfm-autolink (source slice starts with [)', () => {
    const tree = parseMdast('[https://x.com](https://x.com)\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).not.toBe('gfm-autolink');
  });

  test('inline link with title NOT tagged as gfm-autolink', () => {
    const tree = parseMdast('[click](https://x.com "title")\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).not.toBe('gfm-autolink');
  });

  test('multiple bare autolinks in one paragraph each tagged', () => {
    const tree = parseMdast('a https://x.com and https://y.com end\n');
    const links = findNodes(tree, 'link');
    expect(links.length).toBe(2);
    expect(links[0]?.data?.sourceStyle).toBe('gfm-autolink');
    expect(links[1]?.data?.sourceStyle).toBe('gfm-autolink');
  });

  test('mixed angle-bracket + bare in same paragraph keeps distinct sourceStyles', () => {
    const tree = parseMdast('see <https://x.com> and https://y.com bare\n');
    const links = findNodes(tree, 'link');
    expect(links.length).toBe(2);
    const bareLink = links.find((l) => l.url === 'https://y.com');
    expect(bareLink?.data?.sourceStyle).toBe('gfm-autolink');
  });

  test('bare URL inside list item tagged correctly', () => {
    const tree = parseMdast('- https://x.com\n- https://y.com\n');
    const links = findNodes(tree, 'link');
    expect(links.length).toBe(2);
    expect(links[0]?.data?.sourceStyle).toBe('gfm-autolink');
    expect(links[1]?.data?.sourceStyle).toBe('gfm-autolink');
  });

  test('bare URL inside emphasis tagged correctly', () => {
    const tree = parseMdast('_em https://x.com em_\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).toBe('gfm-autolink');
  });

  test('linkReference (shortcut form) NOT tagged as gfm-autolink', () => {
    const tree = parseMdast('[ref][]\n\n[ref]: https://x.com\n');
    const ref = findNode(tree, 'linkReference');
    expect(ref).toBeDefined();
    expect(ref?.data?.sourceStyle).toBeUndefined();
  });
});

describe('position-slice: inline-link URL form recovery (FR-19)', () => {
  test('`[text](url)` → no sourceUrlForm', () => {
    const tree = parseMdast('[link](https://x.com)\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceUrlForm).toBeUndefined();
  });

  test('`[text](<url>)` → sourceUrlForm = "angle-bracketed"', () => {
    const tree = parseMdast('[link](<https://x.com>)\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceUrlForm).toBe('angle-bracketed');
  });

  test('`[text](<url with space>)` → sourceUrlForm = "angle-bracketed"', () => {
    const tree = parseMdast('[link](<http://x.com/foo bar>)\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceUrlForm).toBe('angle-bracketed');
  });

  test('`[text](<>)` → sourceUrlForm = "angle-bracketed" (empty URL)', () => {
    const tree = parseMdast('[link](<>)\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceUrlForm).toBe('angle-bracketed');
  });

  test('GFM bare URL (no brackets) → no sourceUrlForm, sourceStyle=gfm-autolink', () => {
    const tree = parseMdast('visit https://x.com today\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceStyle).toBe('gfm-autolink');
    expect(link?.data?.sourceUrlForm).toBeUndefined();
  });

  test('multiple inline links — each tagged independently', () => {
    const tree = parseMdast('See [a](u1) and [b](<u2>) and [c](u3) here.\n');
    const links = findNodes(tree, 'link');
    expect(links.length).toBe(3);
    expect(links[0]?.data?.sourceUrlForm).toBeUndefined();
    expect(links[1]?.data?.sourceUrlForm).toBe('angle-bracketed');
    expect(links[2]?.data?.sourceUrlForm).toBeUndefined();
  });
});

describe('position-slice: inline-link title marker recovery (FR-20)', () => {
  test('double-quote title → sourceTitleMarker = "double"', () => {
    const tree = parseMdast('[link](https://x.com "title")\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceTitleMarker).toBe('double');
  });

  test('single-quote title → sourceTitleMarker = "single"', () => {
    const tree = parseMdast("[link](https://x.com 'title')\n");
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceTitleMarker).toBe('single');
  });

  test('paren title → sourceTitleMarker = "paren"', () => {
    const tree = parseMdast('[link](https://x.com (title))\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceTitleMarker).toBe('paren');
  });

  test('link without title → sourceTitleMarker undefined', () => {
    const tree = parseMdast('[link](https://x.com)\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceTitleMarker).toBeUndefined();
  });

  test('angle-bracketed URL combined with single-quote title', () => {
    const tree = parseMdast("[link](<https://x.com> 'title')\n");
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceUrlForm).toBe('angle-bracketed');
    expect(link?.data?.sourceTitleMarker).toBe('single');
  });

  test('angle-bracketed URL combined with paren title', () => {
    const tree = parseMdast('[link](<https://x.com> (title))\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceUrlForm).toBe('angle-bracketed');
    expect(link?.data?.sourceTitleMarker).toBe('paren');
  });

  test('whitespace between title and closing `)` does not break detection', () => {
    const tree = parseMdast('[link](https://x.com "title" )\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceTitleMarker).toBe('double');
  });

  test('GFM bare URL (no `[...](...)` wrap) → no sourceTitleMarker', () => {
    const tree = parseMdast('visit https://x.com today\n');
    const link = findNode(tree, 'link');
    expect(link?.data?.sourceTitleMarker).toBeUndefined();
  });
});

describe('position-slice: blockquote marker spacing recovery (FR-23)', () => {
  test('single-space marker → sourceMarkerSpacings=["single"]', () => {
    const tree = parseMdast('> foo\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['single']);
  });

  test('no-space marker → sourceMarkerSpacings=["none"]', () => {
    const tree = parseMdast('>foo\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['none']);
  });

  test('multi-line single-space → array of length 2', () => {
    const tree = parseMdast('> line 1\n> line 2\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['single', 'single']);
  });

  test('multi-line no-space → array of length 2', () => {
    const tree = parseMdast('>line 1\n>line 2\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['none', 'none']);
  });

  test('mixed single + none → per-line array', () => {
    const tree = parseMdast('> line 1\n>line 2\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['single', 'none']);
  });

  test('mixed none + single → per-line array', () => {
    const tree = parseMdast('>line 1\n> line 2\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['none', 'single']);
  });

  test('blank-line `>` continuation EXCLUDED from capture', () => {
    const tree = parseMdast('> p1\n>\n> p2\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['single', 'single']);
  });

  test('nested blockquote captures outer marker spacing on outer node', () => {
    const tree = parseMdast('> > nested\n');
    const allBqs = findNodes(tree, 'blockquote');
    expect(allBqs.length).toBe(2);
    expect(allBqs[0]?.data?.sourceMarkerSpacings).toEqual(['single']);
    expect(allBqs[1]?.data?.sourceMarkerSpacings).toEqual(['single']);
  });

  test('nested blockquote `>>` → outer none, inner single', () => {
    const tree = parseMdast('>> nested\n');
    const allBqs = findNodes(tree, 'blockquote');
    expect(allBqs.length).toBe(2);
    expect(allBqs[0]?.data?.sourceMarkerSpacings).toEqual(['none']);
    expect(allBqs[1]?.data?.sourceMarkerSpacings).toEqual(['single']);
  });

  test('tab-after-marker treated as single-spacing', () => {
    const tree = parseMdast('>\tfoo\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['single']);
  });

  test('1-3 leading spaces of indent before `>` tolerated (CommonMark §5.1)', () => {
    const tree = parseMdast('   > foo\n');
    const bq = findNode(tree, 'blockquote');
    expect(bq?.data?.sourceMarkerSpacings).toEqual(['single']);
  });
});

describe('position-slice: definition source-form recovery (FR-24)', () => {
  test('single-line `[ref]: url` → sourceLayout=inline, no sourceTitleMarker', () => {
    const tree = parseMdast('[ref]: url\n');
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceLayout).toBe('inline');
    expect(def?.data?.sourceTitleMarker).toBeUndefined();
  });

  test('single-line with double-quote title → sourceTitleMarker=double', () => {
    const tree = parseMdast('[ref]: url "title"\n');
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceLayout).toBe('inline');
    expect(def?.data?.sourceTitleMarker).toBe('double');
  });

  test('single-line with single-quote title → sourceTitleMarker=single', () => {
    const tree = parseMdast("[ref]: url 'title'\n");
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceTitleMarker).toBe('single');
  });

  test('single-line with paren title → sourceTitleMarker=paren', () => {
    const tree = parseMdast('[ref]: url (title)\n');
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceTitleMarker).toBe('paren');
  });

  test('multi-line `[ref]:\\n  url` → sourceLayout=multiline', () => {
    const tree = parseMdast('[ref]:\n  url\n');
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceLayout).toBe('multiline');
    expect(def?.data?.sourceTitleMarker).toBeUndefined();
  });

  test('multi-line with double-quote title → sourceLayout=multiline + double marker', () => {
    const tree = parseMdast('[ref]:\n  url\n  "title"\n');
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceLayout).toBe('multiline');
    expect(def?.data?.sourceTitleMarker).toBe('double');
  });

  test('multi-line with single-quote title → sourceLayout=multiline + single marker', () => {
    const tree = parseMdast("[ref]:\n  url\n  'title'\n");
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceLayout).toBe('multiline');
    expect(def?.data?.sourceTitleMarker).toBe('single');
  });

  test('multi-line with paren title → sourceLayout=multiline + paren marker', () => {
    const tree = parseMdast('[ref]:\n  url\n  (title)\n');
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceLayout).toBe('multiline');
    expect(def?.data?.sourceTitleMarker).toBe('paren');
  });

  test('case-mismatch identifier preserved on label (mdast handles this)', () => {
    const tree = parseMdast('[Ref]: url\n');
    const def = findNode<{ data?: Record<string, unknown>; label?: string; identifier?: string }>(
      tree,
      'definition',
    );
    expect(def?.label).toBe('Ref');
    expect(def?.identifier).toBe('ref');
  });

  test('definition with no title does not set sourceTitleMarker', () => {
    const tree = parseMdast('[ref]: url\n');
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceTitleMarker).toBeUndefined();
  });

  test('multi-line definition followed by paragraph captures only the def slice', () => {
    const tree = parseMdast('[ref]:\n  url\n  "title"\n\nP\n');
    const def = findNode(tree, 'definition');
    expect(def?.data?.sourceLayout).toBe('multiline');
    expect(def?.data?.sourceTitleMarker).toBe('double');
  });
});
