import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';
import { createSerializeProcessor } from './pipeline.ts';
import { toMarkdownHandlers } from './to-markdown-handlers.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function buildDirectSerializeProcessor() {
  return createSerializeProcessor({
    schema: undefined as never,
    handlers: {} as never,
    pmNodeHandlers: {},
    pmMarkHandlers: {},
    toMarkdownHandlers,
  });
}

describe('MarkdownManager scaffold', () => {
  test('parse returns valid JSONContent with heading + paragraph', () => {
    const json = mdManager.parse('# Hello\n\nworld\n');
    expect(json).toBeDefined();
    expect(json.type).toBe('doc');
    expect(json.content).toBeDefined();
    expect(json.content?.length).toBeGreaterThanOrEqual(2);

    const heading = json.content?.[0];
    expect(heading.type).toBe('heading');
    expect(heading.attrs?.level).toBe(1);

    const para = json.content?.[1];
    expect(para.type).toBe('paragraph');
  });

  test('simple heading + paragraph round-trips byte-identically', () => {
    const input = '# Hello\n\nworld\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('multi-paragraph round-trip', () => {
    const input = 'First paragraph.\n\nSecond paragraph.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('emphasis and strong round-trip', () => {
    const input = 'This is *emphasized* and **strong** text.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('inline code round-trips', () => {
    const input = 'Use `console.log()` for debug.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('code block round-trips', () => {
    const input = '```js\nconsole.log("hello");\n```\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('blockquote round-trips', () => {
    const input = '> This is a quote.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('link round-trips', () => {
    const input = 'Visit [example](https://example.com) for details.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('unordered list round-trips', () => {
    const input = '- item one\n- item two\n- item three\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('horizontal rule round-trips', () => {
    const input = 'Above.\n\n---\n\nBelow.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });
});

describe('position-aware blank-line Join (FR-12)', () => {
  describe('direct mdast → stringify path (positions intact)', () => {
    test('1 blank line between paragraphs round-trips byte-equal', () => {
      const input = 'P1\n\nP2\n';
      const tree = mdManager.parseToMdast(input);
      const sp = buildDirectSerializeProcessor();
      expect(String(sp.stringify(tree))).toBe(input);
    });

    test('2 blank lines preserved (gap=2)', () => {
      const input = 'P1\n\n\nP2\n';
      const tree = mdManager.parseToMdast(input);
      const sp = buildDirectSerializeProcessor();
      expect(String(sp.stringify(tree))).toBe(input);
    });

    test('4 blank lines preserved (gap=4)', () => {
      const input = 'P1\n\n\n\n\nP2\n';
      const tree = mdManager.parseToMdast(input);
      const sp = buildDirectSerializeProcessor();
      expect(String(sp.stringify(tree))).toBe(input);
    });

    test('mixed flow children (heading, paragraph, list) preserve blank-line gaps', () => {
      const input = '# H\n\n\n\nP1\n\n\n\n- item\n';
      const tree = mdManager.parseToMdast(input);
      const sp = buildDirectSerializeProcessor();
      expect(String(sp.stringify(tree))).toBe(input);
    });

    test('synthetic mdast without positions falls through to default 1 blank line', () => {
      const sp = buildDirectSerializeProcessor();
      const tree = {
        type: 'root',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'P1' }] },
          { type: 'paragraph', children: [{ type: 'text', value: 'P2' }] },
        ],
      } as never;
      expect(String(sp.stringify(tree))).toBe('P1\n\nP2\n');
    });
  });

  describe('PM round-trip path (positions absent → default 1 blank line)', () => {
    test('1 blank line between paragraphs is the dominant case (byte-identical)', () => {
      const input = 'P1\n\nP2\n';
      const json = mdManager.parse(input);
      expect(mdManager.serialize(json)).toBe(input);
    });

    test('2+ blank lines collapse to 1 (NG1 floor on PM route)', () => {
      const json = mdManager.parse('P1\n\n\nP2\n');
      expect(mdManager.serialize(json)).toBe('P1\n\nP2\n');
    });

    test('4 blank lines collapse to 1 on PM route (NG1 floor)', () => {
      const json = mdManager.parse('P1\n\n\n\n\nP2\n');
      expect(mdManager.serialize(json)).toBe('P1\n\nP2\n');
    });
  });

  describe('parse-without-edit identity', () => {
    test('parse(serialize(parse(md))) === parse(md) for the dominant 1-blank-line case', () => {
      const md = 'P1\n\nP2\n\nP3\n';
      const initial = mdManager.parse(md);
      const round = mdManager.parse(mdManager.serialize(initial));
      expect(round).toEqual(initial);
    });

    test('PM identity holds even when source has 2+ blank lines (PM does not carry counts)', () => {
      const md = 'P1\n\n\n\nP2\n';
      const initial = mdManager.parse(md);
      const round = mdManager.parse(mdManager.serialize(initial));
      expect(round).toEqual(initial);
    });
  });
});
