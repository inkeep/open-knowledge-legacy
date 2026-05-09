import { describe, expect, test } from 'bun:test';
import type { Root } from 'mdast';
import { sharedExtensions } from '../extensions/shared.ts';
import { encodeEntityRefs, protectPattern, restoreEntityRefsPlugin } from './entity-ref-guard.ts';
import { MarkdownManager } from './index.ts';

describe('protectPattern — length preservation', () => {
  test('encoded form has same length as match for entity refs', () => {
    const src = '&amp; &#65; &#x41;';
    const out = encodeEntityRefs(src);
    expect(out.length).toBe(src.length);
  });

  test('substitution is char-for-char so non-matching segments are unchanged', () => {
    const src = 'before &amp; middle &#65; after';
    const out = encodeEntityRefs(src);
    expect(out.slice(0, 7)).toBe('before ');
    expect(out.slice(12, 20)).toBe(' middle ');
    expect(out.slice(25, 31)).toBe(' after');
  });
});

describe('protectPattern — escape awareness via preceding-backslash parity', () => {
  test('skips substitution when match is preceded by odd backslash count (CommonMark §2.4 escape)', () => {
    const src = '\\&amp;';
    const out = encodeEntityRefs(src);
    expect(out).toBe(src);
  });

  test('substitutes when match is preceded by even backslash count (`\\\\` escapes the `\\`, `&` is bare)', () => {
    const src = '\\\\&amp;';
    const out = encodeEntityRefs(src);
    expect(out.length).toBe(src.length);
    expect(out).not.toBe(src);
  });

  test('substitutes at start-of-string (zero preceding backslashes is even)', () => {
    const src = '&amp;';
    const out = encodeEntityRefs(src);
    expect(out.length).toBe(src.length);
    expect(out).not.toBe(src);
  });
});

describe('encodeEntityRefs — supported entity-ref forms', () => {
  test('matches CommonMark §6.4 named form `&body;`', () => {
    const out = encodeEntityRefs('&amp;');
    expect(out).not.toBe('&amp;');
    expect(out.length).toBe(5);
  });

  test('matches CommonMark §6.4 decimal numeric form `&#NNN;`', () => {
    const out = encodeEntityRefs('&#65;');
    expect(out).not.toBe('&#65;');
    expect(out.length).toBe(5);
  });

  test('matches CommonMark §6.4 hex numeric form `&#xHHH;`', () => {
    const out = encodeEntityRefs('&#x41;');
    expect(out).not.toBe('&#x41;');
    expect(out.length).toBe(6);
  });

  test('matches CommonMark §6.4 hex form with capital `X` (`&#X41;`)', () => {
    const out = encodeEntityRefs('&#X41;');
    expect(out).not.toBe('&#X41;');
    expect(out.length).toBe(6);
  });

  test('does NOT match malformed entities (`&123foo;` lacks the `#` numeric prefix)', () => {
    const src = '&123foo;';
    const out = encodeEntityRefs(src);
    expect(out).toBe(src);
  });

  test('handles multiple matches in a single pass', () => {
    const src = '&amp; and &lt; and &gt;';
    const out = encodeEntityRefs(src);
    expect(out.length).toBe(src.length);
    expect(out.slice(5, 10)).toBe(' and ');
    expect(out.slice(14, 19)).toBe(' and ');
  });
});

describe('protectPattern — generic contract for FR-14 reuse', () => {
  test('caller can plug in a different pattern with a length-preserving replacement', () => {
    const out = protectPattern('foo bar', /b/g, () => 'X');
    expect(out).toBe('foo Xar');
    expect(out.length).toBe('foo bar'.length);
  });

  test('respects escape-awareness for the caller too', () => {
    const out = protectPattern('a \\b c b', /b/g, () => 'X');
    expect(out).toBe('a \\b c X');
  });

  test('regex /g flag lastIndex is reset before substitution', () => {
    const re = /b/g;
    re.lastIndex = 5; // simulate stale state
    const out = protectPattern('bbbbb', re, () => 'X');
    expect(out).toBe('XXXXX');
  });
});

describe('restoreEntityRefsPlugin — mdast walk', () => {
  function runPlugin(tree: Root): Root {
    const transformer = restoreEntityRefsPlugin() as unknown as (root: Root) => void;
    transformer(tree);
    return tree;
  }

  test('restores encoded entity in text-node `value` field', () => {
    const encoded = encodeEntityRefs('&amp;');
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
    expect(text.value).toBe('&amp;');
  });

  test('tags text-node `data.entityRefSpans` with offset/length/raw', () => {
    const encoded = encodeEntityRefs('&amp;');
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
    const text = (tree.children[0] as { children: Array<{ data?: unknown }> }).children[0];
    const spans = (text.data as { entityRefSpans?: unknown }).entityRefSpans as Array<{
      offset: number;
      length: number;
      raw: string;
    }>;
    expect(Array.isArray(spans)).toBe(true);
    expect(spans).toHaveLength(1);
    const span = spans[0];
    if (!span) throw new Error('expected one span');
    expect(span.offset).toBe(0);
    expect(span.length).toBe('&amp;'.length);
    expect(span.raw).toBe('&amp;');
  });

  test('adjacent entity refs (no separator) restore at correct offsets', () => {
    const encoded = encodeEntityRefs('&amp;&lt;');
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
    const text = (tree.children[0] as { children: Array<{ data?: unknown; value: string }> })
      .children[0];
    if (!text) throw new Error('expected text node');
    expect(text.value).toBe('&amp;&lt;');
    const spans = (text.data as { entityRefSpans?: unknown }).entityRefSpans as Array<{
      offset: number;
      length: number;
      raw: string;
    }>;
    expect(spans).toEqual([
      { offset: 0, length: 5, raw: '&amp;' },
      { offset: 5, length: 4, raw: '&lt;' },
    ]);
  });

  test('restores encoded entity in `url` field (link nodes)', () => {
    const encoded = encodeEntityRefs('http://x?q=&amp;y=1');
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
    const para = tree.children[0];
    if (para?.type !== 'paragraph') throw new Error('expected paragraph');
    const link = para.children[0];
    if (link?.type !== 'link') throw new Error('expected link');
    expect(link.url).toBe('http://x?q=&amp;y=1');
  });

  test('restores encoded entity in `title` field', () => {
    const encoded = encodeEntityRefs('Title &amp; subtitle');
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
    const para = tree.children[0];
    if (para?.type !== 'paragraph') throw new Error('expected paragraph');
    const link = para.children[0];
    if (link?.type !== 'link') throw new Error('expected link');
    expect(link.title).toBe('Title &amp; subtitle');
  });

  test('restores encoded entity in `alt` field (image nodes)', () => {
    const encoded = encodeEntityRefs('Tom &amp; Jerry');
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
    const para = tree.children[0];
    if (para?.type !== 'paragraph') throw new Error('expected paragraph');
    const image = para.children[0];
    if (image?.type !== 'image') throw new Error('expected image');
    expect(image.alt).toBe('Tom &amp; Jerry');
  });

  test('does NOT tag entityRefSpans on non-text nodes (e.g. inlineCode value)', () => {
    const encoded = encodeEntityRefs('foo &amp; bar');
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
    const para = tree.children[0];
    if (para?.type !== 'paragraph') throw new Error('expected paragraph');
    const code = para.children[0];
    if (code?.type !== 'inlineCode') throw new Error('expected inlineCode');
    expect(code.value).toBe('foo &amp; bar');
    expect((code as { data?: unknown }).data).toBeUndefined();
  });

  test('leaves un-encoded values untouched (no tree mutation when no PUA delimiter present)', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'plain text without entities' }],
        },
      ],
    };
    runPlugin(tree);
    const text = (tree.children[0] as { children: Array<{ value?: unknown; data?: unknown }> })
      .children[0];
    expect(text?.value).toBe('plain text without entities');
    expect(text?.data).toBeUndefined();
  });
});

describe('escape + entity-ref marker interleaving on the same text node', () => {
  test('text node with BOTH escapedChars AND entityRefSpans round-trips through parse → serialize byte-equal', () => {
    const mgr = new MarkdownManager({ extensions: sharedExtensions });
    const src = 'prefix \\\\&amp; suffix\n';
    const parsed = mgr.parse(src);
    const serialized = mgr.serialize(parsed);
    expect(serialized).toBe(src);
  });

  test('escape and entity-ref offsets are independently preserved (escape at offset N, entity span starts at offset N+1)', () => {
    const mgr = new MarkdownManager({ extensions: sharedExtensions });
    const src = '\\\\&amp;\n';
    const parsed = mgr.parse(src);
    const serialized = mgr.serialize(parsed);
    expect(serialized).toBe(src);
  });

  test('multi-marker interleaving (escape, entity, escape, entity) round-trips byte-equal', () => {
    const mgr = new MarkdownManager({ extensions: sharedExtensions });
    const src = '\\\\foo&amp;bar\\\\baz&lt;qux\n';
    const parsed = mgr.parse(src);
    const serialized = mgr.serialize(parsed);
    expect(serialized).toBe(src);
  });
});
