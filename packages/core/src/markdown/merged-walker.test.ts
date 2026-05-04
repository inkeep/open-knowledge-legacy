import { describe, expect, test } from 'bun:test';
import type { Root as MdastRoot } from 'mdast';
import { VFile } from 'vfile';
import { mergedPostParseWalkerPlugin } from './merged-walker.ts';

function makePos(startOffset: number, endOffset: number) {
  return {
    start: { line: 1, column: startOffset + 1, offset: startOffset },
    end: { line: 1, column: endOffset + 1, offset: endOffset },
  };
}

describe('mergedPostParseWalkerPlugin — Phase B dispatch', () => {
  test('pass 2: promotes <scheme:uri> text to semantic link inside paragraph', () => {
    const src = '<https://example.com>';
    const tree: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          position: makePos(0, src.length),
          children: [{ type: 'text', value: src, position: makePos(0, src.length) }],
        },
      ],
    };
    mergedPostParseWalkerPlugin()(tree, new VFile(src));

    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const para = tree.children[0] as any;
    expect(para.type).toBe('paragraph');
    expect(para.children).toHaveLength(1);
    expect(para.children[0].type).toBe('link');
    expect(para.children[0].url).toBe('https://example.com');
    expect(para.children[0].data?.sourceStyle).toBe('autolink');
  });

  test('pass 3: doc-start empty yaml → thematicBreak(s) with data.sourceRaw', () => {
    const src = '---\n\n---\n';
    const tree: MdastRoot = {
      type: 'root',
      children: [
        // biome-ignore lint/suspicious/noExplicitAny: synthetic yaml node
        { type: 'yaml', value: '', position: makePos(0, 8) } as any,
      ],
    };
    mergedPostParseWalkerPlugin()(tree, new VFile(src));

    expect(tree.children.length).toBe(2);
    expect(tree.children[0].type).toBe('thematicBreak');
    expect(tree.children[1].type).toBe('thematicBreak');
    expect(tree.children[0].data?.sourceRaw).toBe('---');
    expect(tree.children[1].data?.sourceRaw).toBe('---');
  });

  test('pass 4: attaches sourceDelimiter to emphasis node based on source', () => {
    const src = 'This is *emphasised* text.';
    const tree: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          position: makePos(0, src.length),
          children: [
            { type: 'text', value: 'This is ', position: makePos(0, 8) },
            {
              type: 'emphasis',
              position: makePos(8, 20),
              children: [{ type: 'text', value: 'emphasised', position: makePos(9, 19) }],
            },
            { type: 'text', value: ' text.', position: makePos(20, 26) },
          ],
        },
      ],
    };
    mergedPostParseWalkerPlugin()(tree, new VFile(src));

    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const em = (tree.children[0] as any).children[1];
    expect(em.type).toBe('emphasis');
    expect(em.data?.sourceDelimiter).toBe('*');
  });

  test('pass 5: replaces unknown type with rawMdxFallbackMdast and SKIPs descent', () => {
    const src = '$$math$$';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'someFutureType',
          position: makePos(0, src.length),
          children: [{ type: 'unknownInner', position: makePos(2, 6) }],
        },
      ],
    } as unknown as MdastRoot;
    mergedPostParseWalkerPlugin()(tree, new VFile(src));

    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const child = tree.children[0] as any;
    expect(child.type).toBe('rawMdxFallbackMdast');
    expect(child.originalType).toBe('someFutureType');
    expect(child.value).toBe('$$math$$');
    expect(child.children).toBeUndefined();
  });

  test('nested unknown inline: replaces brandNewInlineType inside paragraph, preserves siblings', () => {
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
    mergedPostParseWalkerPlugin()(tree, new VFile(src));

    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const para = tree.children[0] as any;
    expect(para.type).toBe('paragraph');
    expect(para.children[0].type).toBe('text');
    expect(para.children[1].type).toBe('rawMdxFallbackMdast');
    expect(para.children[1].originalType).toBe('brandNewInlineType');
    expect(para.children[1].value).toBe('[[?]]');
    expect(para.children[2].type).toBe('text');
  });

  test('known extended types (math, inlineMath, rawMdxFallbackMdast) are not replaced', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'math', value: 'x^2', position: makePos(0, 3) },
        {
          type: 'paragraph',
          position: makePos(4, 5),
          children: [{ type: 'inlineMath', value: 'y', position: makePos(4, 5) }],
        },
      ],
    } as unknown as MdastRoot;
    mergedPostParseWalkerPlugin()(tree, new VFile('x^2 y'));

    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    expect((tree.children[0] as any).type).toBe('math');
    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    expect((tree.children[1] as any).children[0].type).toBe('inlineMath');
  });

  test('pass 2 interleaved with pass 5: unknown sibling stays replaced, autolink in sibling stays promoted', () => {
    const src = 'See <https://a.com> and X and y';
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          position: makePos(0, src.length),
          children: [
            { type: 'text', value: 'See <https://a.com> and ', position: makePos(0, 24) },
            { type: 'brandNew', position: makePos(24, 25) }, // unknown
            { type: 'text', value: ' and y', position: makePos(25, 31) },
          ],
        },
      ],
    } as unknown as MdastRoot;
    mergedPostParseWalkerPlugin()(tree, new VFile(src));

    // biome-ignore lint/suspicious/noExplicitAny: test inspects mdast shape
    const para = tree.children[0] as any;
    const types = para.children.map((c: { type: string }) => c.type);
    expect(types).toContain('link');
    expect(types).toContain('rawMdxFallbackMdast');
    expect(types).toContain('text');

    const link = para.children.find((c: { type: string }) => c.type === 'link');
    expect(link.url).toBe('https://a.com');
    expect(link.data?.sourceStyle).toBe('autolink');

    const fallback = para.children.find((c: { type: string }) => c.type === 'rawMdxFallbackMdast');
    expect(fallback.originalType).toBe('brandNew');
  });

  test('non-root-first yaml is left untouched (pass 3 is root[0]-specific)', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          position: makePos(0, 5),
          children: [{ type: 'text', value: 'hello' }],
        },
        // biome-ignore lint/suspicious/noExplicitAny: synthetic yaml node
        { type: 'yaml', value: '', position: makePos(6, 14) } as any,
      ],
    } as MdastRoot;
    mergedPostParseWalkerPlugin()(tree, new VFile('hello\n---\n---\n'));

    expect(tree.children[1].type).toBe('yaml');
  });
});
