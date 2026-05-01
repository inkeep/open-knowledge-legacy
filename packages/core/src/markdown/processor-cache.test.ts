import { describe, expect, test } from 'bun:test';
import type { Processor } from 'unified';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';
import { remarkMdxAgnostic } from './remark-mdx-agnostic.ts';
import { remarkWikiLink } from './wiki-link-micromark.ts';

interface ManagerInternals {
  parseProcessor: Processor;
  serializeProcessor: Processor;
}
const internals = (m: MarkdownManager): ManagerInternals => m as unknown as ManagerInternals;

describe('R16 processor caching', () => {
  test('same processor reference survives 100 parse calls', () => {
    const m = new MarkdownManager({ extensions: sharedExtensions });
    const parseRef = internals(m).parseProcessor;
    for (let i = 0; i < 100; i++) {
      m.parse(`# Run ${i}\n\nParagraph ${i}.\n`);
    }
    expect(internals(m).parseProcessor).toBe(parseRef);
  });

  test('same serialize processor reference survives 100 serialize calls', () => {
    const m = new MarkdownManager({ extensions: sharedExtensions });
    const serializeRef = internals(m).serializeProcessor;
    const json = m.parse('# Heading\n\nPara.\n');
    for (let i = 0; i < 100; i++) {
      m.serialize(json);
    }
    expect(internals(m).serializeProcessor).toBe(serializeRef);
  });

  test('parse output is byte-identical across 100 calls', () => {
    const m = new MarkdownManager({ extensions: sharedExtensions });
    const src = '# H\n\n**bold** and *em* and `code`.\n\n- a\n- b\n';
    const first = JSON.stringify(m.parse(src));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(m.parse(src))).toBe(first);
    }
  });

  test('micromark extensions array does not grow on re-attach — remarkMdxAgnostic', () => {
    const fakeProcessor = {
      _data: {
        micromarkExtensions: [] as unknown[],
        fromMarkdownExtensions: [] as unknown[][],
        toMarkdownExtensions: [] as unknown[],
      },
      data(): ManagerInternals['parseProcessor'] extends Processor
        ? Record<string, unknown>
        : Record<string, unknown> {
        return this._data as unknown as Record<string, unknown>;
      },
    };
    for (let i = 0; i < 10; i++) {
      remarkMdxAgnostic.call(fakeProcessor as unknown as Processor);
    }
    expect(fakeProcessor._data.micromarkExtensions.length).toBe(1);
    expect(fakeProcessor._data.fromMarkdownExtensions.length).toBe(1);
    expect(fakeProcessor._data.toMarkdownExtensions.length).toBe(1);
  });

  test('micromark extensions array does not grow on re-attach — remarkWikiLink', () => {
    const fakeProcessor = {
      _data: {
        micromarkExtensions: [] as unknown[],
        fromMarkdownExtensions: [] as unknown[][],
        toMarkdownExtensions: [] as unknown[],
      },
      data(): Record<string, unknown> {
        return this._data as unknown as Record<string, unknown>;
      },
    };
    for (let i = 0; i < 10; i++) {
      remarkWikiLink.call(fakeProcessor as unknown as Processor);
    }
    expect(fakeProcessor._data.micromarkExtensions.length).toBe(1);
    expect(fakeProcessor._data.fromMarkdownExtensions.length).toBe(1);
    expect(fakeProcessor._data.toMarkdownExtensions.length).toBe(1);
  });

  test('roundtrip identity on representative fixtures after repeated reuse', () => {
    const m = new MarkdownManager({ extensions: sharedExtensions });
    const cases = [
      '# Heading\n\nText with **bold** and *em*.\n',
      '- item one\n- item two\n',
      '```ts\nconst x = 1;\n```\n',
      '[[WikiLink]] and [inline](http://e.com).\n',
      '| a | b |\n| - | - |\n| 1 | 2 |\n',
    ];
    const firstResults = cases.map((src) => m.serialize(m.parse(src)));
    for (let i = 0; i < 20; i++) {
      for (let c = 0; c < cases.length; c++) {
        expect(m.serialize(m.parse(cases[c]))).toBe(firstResults[c]);
      }
    }
  });
});
