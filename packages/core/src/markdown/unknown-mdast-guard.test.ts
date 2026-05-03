import { describe, expect, test } from 'bun:test';
import type { Root as MdastRoot } from 'mdast';
import { VFile } from 'vfile';
import { unknownMdastGuardPlugin } from './unknown-mdast-guard.ts';

describe('unknownMdastGuardPlugin (R8 wildcard)', () => {
  test('leaves known mdast types unchanged', () => {
    const tree: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'hello' }],
          position: makePos(0, 5),
        },
      ],
    };
    const file = new VFile('hello');
    unknownMdastGuardPlugin()(tree, file);
    expect(tree.children[0]?.type).toBe('paragraph');
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    expect((tree.children[0] as any).children[0].type).toBe('text');
  });

  test('replaces unknown top-level type with rawMdxFallbackMdast', () => {
    const src = '$$math$$';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'someFutureType',
          position: makePos(0, src.length),
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('someFutureType');
    expect(child.value).toBe('$$math$$');
    expect(child.position.start.offset).toBe(0);
    expect(child.position.end.offset).toBe(src.length);
  });

  test('replaces unknown nested inline type (inside paragraph)', () => {
    const src = 'hello [[?]] world';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          position: makePos(0, src.length),
          children: [
            { type: 'text', value: 'hello ', position: makePos(0, 6) },
            { type: 'brandNewInlineType', position: makePos(6, 11) },
            { type: 'text', value: ' world', position: makePos(11, 17) },
          ],
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const para = tree.children[0] as any;
    expect(para.type).toBe('paragraph');
    expect(para.children[0].type).toBe('text');
    expect(para.children[1].type).toBe('rawMdxFallbackMdast');
    expect(para.children[1].originalType).toBe('brandNewInlineType');
    expect(para.children[1].value).toBe('[[?]]');
    expect(para.children[2].type).toBe('text');
  });

  test('handles unknown type with no position (defaults span to 0-0, value to type name)', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'typeWithoutPosition' }],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(''));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.value).toBe('typeWithoutPosition');
  });

  test('does not recurse into a node it just replaced', () => {
    const src = '<<outer>> <<inner>>';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'unknownOuter',
          position: makePos(0, src.length),
          children: [{ type: 'unknownInner', position: makePos(10, 19) }],
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile(src));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const outer = tree.children[0] as any;
    expect(outer.type).toBe('rawMdxFallbackMdast');
    expect(outer.originalType).toBe('unknownOuter');
    expect(outer.children).toBeUndefined();
    expect(outer.value).toBe(src);
  });

  test('recognizes known extended types (math, inlineMath, rawMdxFallbackMdast)', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'math', value: 'x^2', position: makePos(0, 3) },
        {
          type: 'paragraph',
          children: [{ type: 'inlineMath', value: 'y', position: makePos(4, 5) }],
        },
      ],
    } as unknown as MdastRoot;
    unknownMdastGuardPlugin()(tree, new VFile('x^2 y'));
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    expect((tree.children[0] as any).type).toBe('math');
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    expect((tree.children[1] as any).children[0].type).toBe('inlineMath');
  });

  test('end-to-end: synthetic unknown-type mdast does NOT throw whole-doc — block-level fallback', async () => {
    const { MarkdownManager } = await import('./index.ts');
    const { sharedExtensions } = await import('../extensions/shared.ts');
    const mgr = new MarkdownManager({ extensions: sharedExtensions });

    const md = '# Heading\n\nparagraph\n\n## Section\n';
    const result = mgr.parseWithFallback(md);
    expect(result.content?.length).toBeGreaterThan(1);
    expect(result.content?.[0]?.type).toBe('heading');
  });
});

function makePos(startOffset: number, endOffset: number) {
  return {
    start: { line: 1, column: startOffset + 1, offset: startOffset },
    end: { line: 1, column: endOffset + 1, offset: endOffset },
  };
}
