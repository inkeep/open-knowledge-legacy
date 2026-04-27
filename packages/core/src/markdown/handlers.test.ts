/**
 * Tests for remark-prosemirror handler table (Tiers A/B/C).
 *
 * Exercises the mdast→PM handler mapping via parse + JSON inspection.
 * Uses POST-RENAME schema names per D16/D17: emphasis/strong/thematicBreak.
 */
import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

interface PmMarkJson {
  type: string;
  attrs?: Record<string, unknown>;
}

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

// Helper: parse markdown and find first node of type in the JSONContent tree
function findInJson(json: JSONContent, type: string): JSONContent | null {
  if (json.type === type) return json;
  for (const child of json.content ?? []) {
    const found = findInJson(child, type);
    if (found) return found;
  }
  return null;
}

// Helper: find a mark on a text node
function findMarkInJson(json: JSONContent, markType: string): PmMarkJson | null {
  if (json.marks) {
    const mark = json.marks.find((m) => m.type === markType) as PmMarkJson | undefined;
    if (mark) return mark;
  }
  for (const child of json.content ?? []) {
    const found = findMarkInJson(child, markType);
    if (found) return found;
  }
  return null;
}

describe('Tier B fidelity: emphasis delimiter', () => {
  test('underscore emphasis carries sourceDelimiter = "_"', () => {
    const json = mdManager.parse('_word_\n');
    const emphMark = findMarkInJson(json, 'emphasis');
    expect(emphMark).toBeDefined();
    expect(emphMark.attrs?.sourceDelimiter).toBe('_');
  });

  test('asterisk emphasis carries sourceDelimiter = "*"', () => {
    const json = mdManager.parse('*word*\n');
    const emphMark = findMarkInJson(json, 'emphasis');
    expect(emphMark).toBeDefined();
    expect(emphMark.attrs?.sourceDelimiter).toBe('*');
  });
});

describe('Tier B fidelity: strong delimiter', () => {
  test('double-underscore strong carries sourceDelimiter = "__"', () => {
    const json = mdManager.parse('__word__\n');
    const strongMark = findMarkInJson(json, 'strong');
    expect(strongMark).toBeDefined();
    expect(strongMark.attrs?.sourceDelimiter).toBe('__');
  });

  test('double-asterisk strong carries sourceDelimiter = "**"', () => {
    const json = mdManager.parse('**word**\n');
    const strongMark = findMarkInJson(json, 'strong');
    expect(strongMark).toBeDefined();
    expect(strongMark.attrs?.sourceDelimiter).toBe('**');
  });
});

describe('Tier B fidelity: heading style', () => {
  test('ATX heading carries headingStyle = "atx"', () => {
    const json = mdManager.parse('## Title\n');
    const heading = findInJson(json, 'heading');
    expect(heading).toBeDefined();
    expect(heading.attrs.level).toBe(2);
    expect(heading.attrs.headingStyle).toBe('atx');
  });
});

describe('Tier B fidelity: code block fence', () => {
  test('backtick fence carries fenceDelimiter and fenceLength', () => {
    const json = mdManager.parse('```js\ncode\n```\n');
    const code = findInJson(json, 'codeBlock');
    expect(code).toBeDefined();
    expect(code.attrs.language).toBe('js');
    expect(code.attrs.fenceDelimiter).toBe('`');
    expect(code.attrs.fenceLength).toBe(3);
  });

  test('tilde fence carries fenceDelimiter = "~"', () => {
    const json = mdManager.parse('~~~\ncode\n~~~\n');
    const code = findInJson(json, 'codeBlock');
    expect(code).toBeDefined();
    expect(code.attrs.fenceDelimiter).toBe('~');
  });
});

describe('Tier B fidelity: thematic break', () => {
  test('--- carries sourceRaw = "---"', () => {
    const json = mdManager.parse('---\n');
    const hr = findInJson(json, 'thematicBreak');
    expect(hr).toBeDefined();
    expect(hr.attrs.sourceRaw).toBe('---');
  });

  test('*** carries sourceRaw = "***"', () => {
    const json = mdManager.parse('***\n');
    const hr = findInJson(json, 'thematicBreak');
    expect(hr).toBeDefined();
    expect(hr.attrs.sourceRaw).toBe('***');
  });
});

describe('Tier B fidelity: hard break', () => {
  test('backslash hard break carries hardBreakStyle = "backslash"', () => {
    const json = mdManager.parse('line\\\nbreak\n');
    const brk = findInJson(json, 'hardBreak');
    expect(brk).toBeDefined();
    expect(brk.attrs.hardBreakStyle).toBe('backslash');
  });
});

describe('Tier B fidelity: list markers', () => {
  test('dash bullet list carries bulletMarker = "-"', () => {
    const json = mdManager.parse('- item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.bulletMarker).toBe('-');
  });

  test('plus bullet list carries bulletMarker = "+"', () => {
    const json = mdManager.parse('+ item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.bulletMarker).toBe('+');
  });

  test('ordered list with dot carries listMarkerDelimiter = "."', () => {
    const json = mdManager.parse('1. item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.listMarkerDelimiter).toBe('.');
  });
});

describe('Tier B fidelity: listItem PM-schema artifact stripping (R6d / US-011)', () => {
  // PM `listItem` content schema is `paragraph block*`. When source mdast has
  // a non-paragraph first child (e.g. `code`), `nodeType.createAndFill`
  // synthesizes an empty paragraph so the PM doc validates. The PM→mdast
  // handler must strip that synthetic paragraph so the listItem round-trips
  // back to its original mdast shape — otherwise the empty paragraph emits
  // as `""` between the marker and the first real block, producing
  // `1. \n\n   ```...` which CommonMark refuses to interpret as list
  // continuation, escaping the first block from the listItem on re-parse.
  // Regression: CommonMark Lists section example index 23
  // (`"1. ```\n   foo\n   ```\n\n   bar\n"`).

  test('listItem with code as first child round-trips byte-identically', () => {
    const input = '1. ```\n   foo\n   ```\n\n   bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('listItem with code as only child round-trips byte-identically', () => {
    const input = '1. ```\n   foo\n   ```\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('listItem with paragraph first stays unchanged (no spurious strip)', () => {
    const input = '1. foo\n\n   ```\n   bar\n   ```\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('genuinely empty listItem (single empty para child) is preserved', () => {
    // `1.\n` parses to a list with one empty listItem. The single-child
    // empty paragraph is the listItem's own content, not a synthesized
    // artifact, so the strip rule must NOT fire (children.length === 1).
    const input = '1.\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    // Verify the listItem is preserved (with its emptiness)
    const json = mdManager.parse(input);
    const listItem = findInJson(json, 'listItem');
    expect(listItem).toBeDefined();
  });

  test('listItem with thematicBreak as first child round-trips', () => {
    // Another non-paragraph block first child to confirm fix is general.
    const input = '1. ---\n\n   foo\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });

  test('listItem with blockquote as first child round-trips', () => {
    const input = '1. > foo\n   > bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });

  test('nested listItem with code block round-trips', () => {
    const input = '1. - ```\n     foo\n     ```\n\n     bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });
});

describe('Tier C: link style', () => {
  test('inline link carries linkStyle = "inline"', () => {
    const json = mdManager.parse('[text](https://example.com)\n');
    const linkMark = findMarkInJson(json, 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark.attrs.href).toBe('https://example.com');
    expect(linkMark.attrs.linkStyle).toBe('inline');
  });

  test('empty-label inline links stay literal text (no link mark)', () => {
    const json = mdManager.parse('[]()\n');
    const paragraph = findInJson(json, 'paragraph');
    expect(paragraph?.content?.[0]?.type).toBe('text');
    expect(paragraph?.content?.[0]?.text).toBe('[]()');
    expect(findMarkInJson(json, 'link')).toBeNull();
  });

  test('empty-label inline link with destination stays literal text (no link mark)', () => {
    const json = mdManager.parse('[](https://example.com)\n');
    const paragraph = findInJson(json, 'paragraph');
    expect(paragraph?.content?.[0]?.type).toBe('text');
    expect(paragraph?.content?.[0]?.text).toBe('[](https://example.com)');
    expect(findMarkInJson(json, 'link')).toBeNull();
  });

  test('trailing backslash runs carry sourceLiteral mark', () => {
    const triple = '\\'.repeat(3);
    const json = mdManager.parse(`text ${triple}\n`);
    const paragraph = findInJson(json, 'paragraph');
    expect(paragraph?.content?.[0]?.type).toBe('text');
    expect(paragraph?.content?.[0]?.text).toBe(`text ${'\\'.repeat(2)}`);
    const sourceLiteral = findMarkInJson(json, 'sourceLiteral');
    expect(sourceLiteral?.attrs?.sourceRaw).toBe(`text ${triple}`);
  });

  test('image with empty alt remains image syntax', () => {
    const json = mdManager.parse('![](https://example.com/img.png)\n');
    expect(findInJson(json, 'image')).toBeDefined();
  });
});

describe('Tier A: passthrough', () => {
  test('blockquote round-trip', () => {
    const md = '> Quote text.\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('inline code produces code mark', () => {
    const json = mdManager.parse('Use `code` here.\n');
    const codeMark = findMarkInJson(json, 'code');
    expect(codeMark).toBeDefined();
  });

  test('paragraph round-trip', () => {
    const md = 'Hello world.\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });
});
