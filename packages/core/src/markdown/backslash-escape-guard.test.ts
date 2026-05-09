import { describe, expect, test } from 'bun:test';
import type { Root } from 'mdast';
import { encodeBackslashEscapes, restoreBackslashEscapesPlugin } from './backslash-escape-guard.ts';

describe('encodeBackslashEscapes — basic behavior', () => {
  test('substitutes the `\\` byte in `\\<` patterns', () => {
    const src = '\\<';
    const out = encodeBackslashEscapes(src);
    expect(out).not.toBe(src);
  });

  test('preserves length char-for-char (`\\<` 2 chars → 2 chars)', () => {
    const src = '\\<';
    const out = encodeBackslashEscapes(src);
    expect(out.length).toBe(src.length);
  });

  test('keeps the `<` byte after substitution (only `\\` is replaced)', () => {
    const src = '\\<';
    const out = encodeBackslashEscapes(src);
    expect(out.charAt(out.length - 1)).toBe('<');
  });

  test('handles multiple `\\<` matches in a single source', () => {
    const src = 'a \\< b \\< c';
    const out = encodeBackslashEscapes(src);
    expect(out.length).toBe(src.length);
    expect(out.slice(0, 2)).toBe('a ');
    expect(out.slice(4, 7)).toBe(' b ');
    expect(out.slice(9, 11)).toBe(' c');
  });

  test('leaves unrelated bytes untouched (e.g. `\\>`, `\\:`, `\\@`)', () => {
    const src = '\\> \\: \\@';
    const out = encodeBackslashEscapes(src);
    expect(out).toBe(src);
  });

  test('leaves bare `<` (no preceding `\\`) untouched', () => {
    const src = 'a < b';
    const out = encodeBackslashEscapes(src);
    expect(out).toBe(src);
  });
});

describe('encodeBackslashEscapes — escape awareness', () => {
  test('skips `\\\\<` — `\\\\` is the escape-of-`\\`, leaving bare `<` after', () => {
    const src = '\\\\<';
    expect(src.length).toBe(3);
    const out = encodeBackslashEscapes(src);
    expect(out).toBe(src);
  });

  test('substitutes `\\\\\\<` — `\\\\` escapes `\\`, then `\\<` is the §2.4 escape-of-`<`', () => {
    const src = '\\\\\\<';
    expect(src.length).toBe(4);
    const out = encodeBackslashEscapes(src);
    expect(out).not.toBe(src);
    expect(out.length).toBe(src.length);
  });

  test('substitutes at start-of-string (zero preceding backslashes is even)', () => {
    const src = '\\<rest';
    const out = encodeBackslashEscapes(src);
    expect(out).not.toBe(src);
    expect(out.length).toBe(src.length);
  });
});

describe('restoreBackslashEscapesPlugin — mdast walk', () => {
  function runPlugin(tree: Root): Root {
    const transformer = restoreBackslashEscapesPlugin() as unknown as (root: Root) => void;
    transformer(tree);
    return tree;
  }

  test('strips the marker from text-node `value` field', () => {
    const encoded = encodeBackslashEscapes('\\<');
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: encoded }],
        },
      ],
    };
    runPlugin(tree);
    const para = tree.children[0];
    if (para?.type !== 'paragraph') throw new Error('expected paragraph');
    const text = para.children[0];
    if (text?.type !== 'text') throw new Error('expected text');
    expect(text.value).toBe('<');
  });

  test('strips marker from `value` field on inlineCode and other string-valued nodes', () => {
    const encoded = encodeBackslashEscapes('foo \\< bar');
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'inlineCode', value: encoded }],
        },
      ],
    };
    runPlugin(tree);
    const code = (tree.children[0] as { children: Array<{ value?: unknown }> }).children[0];
    expect(code?.value).toBe('foo < bar');
  });

  test('strips marker from `url` field (link nodes)', () => {
    const encoded = encodeBackslashEscapes('http://x?q=\\<');
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url: encoded,
              title: null,
              children: [{ type: 'text', value: 'link' }],
            },
          ],
        },
      ],
    };
    runPlugin(tree);
    const link = (tree.children[0] as { children: Array<{ url?: string }> }).children[0];
    expect(link?.url).toBe('http://x?q=<');
  });

  test('strips marker from `title` field', () => {
    const encoded = encodeBackslashEscapes('Title \\<sub>');
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url: 'https://example.com',
              title: encoded,
              children: [{ type: 'text', value: 'link' }],
            },
          ],
        },
      ],
    };
    runPlugin(tree);
    const link = (tree.children[0] as { children: Array<{ title?: string | null }> }).children[0];
    expect(link?.title).toBe('Title <sub>');
  });

  test('strips marker from `alt` field (image nodes)', () => {
    const encoded = encodeBackslashEscapes('See \\<img>');
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'image', url: 'cat.png', title: null, alt: encoded }],
        },
      ],
    };
    runPlugin(tree);
    const image = (tree.children[0] as { children: Array<{ alt?: string | null }> }).children[0];
    expect(image?.alt).toBe('See <img>');
  });

  test('leaves un-encoded values untouched (no tree mutation when no marker present)', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'plain text without escapes' }],
        },
      ],
    };
    runPlugin(tree);
    const text = (tree.children[0] as { children: Array<{ value?: unknown }> }).children[0];
    expect(text?.value).toBe('plain text without escapes');
  });
});
