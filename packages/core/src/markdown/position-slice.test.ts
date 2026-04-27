/**
 * Tests for position-slice delimiter recovery walker + escapeMark tagging.
 *
 * Each test verifies that the walker correctly attaches source-form
 * metadata to mdast node.data by slicing the original source.
 */
import { describe, expect, test } from 'bun:test';
import type { Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';
import { positionSlicePlugin } from './position-slice.ts';

// Tests access node.data.* for fields added via module augmentation
// (sourceDelimiter, sourceFenceChar, escapedChars, etc.). Use an any-permissive
// local alias so .data access on union-discriminated nodes doesn't have to be
// narrowed per test.
type AnyNode = Nodes & { data?: Record<string, unknown> };

/** Parse markdown through remark-parse + remark-gfm + position-slice walker */
function parseMdast(source: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm).use(positionSlicePlugin);
  const tree = processor.parse(source);
  // Run the transformer (positionSlicePlugin) — it needs the VFile with source
  processor.runSync(tree, new VFile({ value: source }));
  return tree;
}

/** Find first node of a given type */
function findNode<T extends AnyNode = AnyNode>(tree: Root, type: string): T {
  let found: AnyNode | null = null;
  visit(tree, type, (node) => {
    if (!found) found = node as AnyNode;
  });
  return found as unknown as T;
}

/** Find all nodes of a given type */
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
});

describe('position-slice: escapeMark tagging (D20)', () => {
  test('backslash-escaped # → data.escapedChars', () => {
    const tree = parseMdast('text \\# more\n');
    const textNodes = findNodes(tree, 'text');
    // Find the text node that contains #
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
    // \f is not in CommonMark §2.4 escapable set — backslash preserved literally
    // Actually mdast may or may not consume this; the walker only tags structurally-ambiguous escapes
    const tree = parseMdast('text \\q more\n');
    const textNodes = findNodes(tree, 'text');
    // \\q is not a valid escape — mdast preserves literal backslash
    // so the raw source matches value; no escapedChars needed
    const hasEscaped = textNodes.some((n) => {
      const e = n.data?.escapedChars as unknown[] | undefined;
      return !!e && e.length > 0;
    });
    // This assertion is about the char 'q' not being in the escapable set
    // If mdast preserves the backslash literally, raw === value, no tag
    expect(hasEscaped).toBe(false);
  });
});

describe('position-slice: fallback behavior', () => {
  test('walker does not crash on empty source', () => {
    expect(() => parseMdast('')).not.toThrow();
  });

  test('walker does not crash on source with no position data', () => {
    // If we create a tree manually without positions, walker should skip gracefully
    const processor = unified().use(remarkParse).use(positionSlicePlugin);
    // Parse a minimal document
    const tree = processor.parse('hello\n');
    // Remove position from root
    (tree as { position?: unknown }).position = undefined;
    // Run should not throw
    expect(() => processor.runSync(tree, new VFile({ value: 'hello\n' }))).not.toThrow();
  });
});
