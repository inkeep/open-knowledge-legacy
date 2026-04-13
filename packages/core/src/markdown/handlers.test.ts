/**
 * Tests for remark-prosemirror handler table (Tiers A/B/C).
 *
 * Exercises the mdast→PM handler mapping via parse + JSON inspection.
 * Uses CURRENT schema attr names (pre-rename per US-010).
 */
import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

// Helper: parse markdown and find first node of type in the JSONContent tree
function findInJson(json: any, type: string): any {
  if (json.type === type) return json;
  for (const child of json.content ?? []) {
    const found = findInJson(child, type);
    if (found) return found;
  }
  return null;
}

// Helper: find a mark on a text node
function findMarkInJson(json: any, markType: string): any {
  if (json.marks) {
    const mark = json.marks.find((m: any) => m.type === markType);
    if (mark) return mark;
  }
  for (const child of json.content ?? []) {
    const found = findMarkInJson(child, markType);
    if (found) return found;
  }
  return null;
}

describe('Tier B fidelity: emphasis delimiter', () => {
  test('underscore emphasis carries emphDelimiter = "_"', () => {
    const json = mdManager.parse('_word_\n');
    const emphMark = findMarkInJson(json, 'italic');
    expect(emphMark).toBeDefined();
    expect(emphMark.attrs?.emphDelimiter).toBe('_');
  });

  test('asterisk emphasis carries emphDelimiter = "*"', () => {
    const json = mdManager.parse('*word*\n');
    const emphMark = findMarkInJson(json, 'italic');
    expect(emphMark).toBeDefined();
    expect(emphMark.attrs?.emphDelimiter).toBe('*');
  });
});

describe('Tier B fidelity: strong delimiter', () => {
  test('double-underscore strong carries strongDelimiter = "__"', () => {
    const json = mdManager.parse('__word__\n');
    const strongMark = findMarkInJson(json, 'bold');
    expect(strongMark).toBeDefined();
    expect(strongMark.attrs?.strongDelimiter).toBe('__');
  });

  test('double-asterisk strong carries strongDelimiter = "**"', () => {
    const json = mdManager.parse('**word**\n');
    const strongMark = findMarkInJson(json, 'bold');
    expect(strongMark).toBeDefined();
    expect(strongMark.attrs?.strongDelimiter).toBe('**');
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
  test('--- carries horizontalRuleRaw = "---"', () => {
    const json = mdManager.parse('---\n');
    const hr = findInJson(json, 'horizontalRule');
    expect(hr).toBeDefined();
    expect(hr.attrs.horizontalRuleRaw).toBe('---');
  });

  test('*** carries horizontalRuleRaw = "***"', () => {
    const json = mdManager.parse('***\n');
    const hr = findInJson(json, 'horizontalRule');
    expect(hr).toBeDefined();
    expect(hr.attrs.horizontalRuleRaw).toBe('***');
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
    const list = findInJson(json, 'bulletList');
    expect(list).toBeDefined();
    expect(list.attrs.bulletMarker).toBe('-');
  });

  test('plus bullet list carries bulletMarker = "+"', () => {
    const json = mdManager.parse('+ item\n');
    const list = findInJson(json, 'bulletList');
    expect(list).toBeDefined();
    expect(list.attrs.bulletMarker).toBe('+');
  });

  test('ordered list with dot carries listMarkerDelimiter = "."', () => {
    const json = mdManager.parse('1. item\n');
    const list = findInJson(json, 'orderedList');
    expect(list).toBeDefined();
    expect(list.attrs.listMarkerDelimiter).toBe('.');
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
