import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import type { Nodes as MdastNodes } from 'mdast';
import { wrapAsInlineCode } from './index.ts';

/**
 * Unit tests for `wrapAsInlineCode` — the mark handler that collapses PM text
 * runs with the `code` mark into mdast `inlineCode`, preserving any outer
 * wrapping mark's structural shape (link/strong/emphasis/delete).
 *
 * Addresses PR #188 reviewer Consider item (D-Q17 LOCKED — 6 cases).
 */

const text = (value: string) => ({ type: 'text' as const, value });
const link = (url: string, children: MdastNodes[]) => ({
  type: 'link' as const,
  url,
  title: null,
  children,
});
const strong = (children: MdastNodes[]) => ({ type: 'strong' as const, children });
const emphasis = (children: MdastNodes[]) => ({ type: 'emphasis' as const, children });
const del = (children: MdastNodes[]) => ({ type: 'delete' as const, children });

describe('wrapAsInlineCode — children-shape coverage', () => {
  test('empty children array → inlineCode with empty value', () => {
    const out = wrapAsInlineCode([]);
    expect(out).toEqual({ type: 'inlineCode', value: '' } as MdastNodes);
  });

  test('text-only children → concatenated inlineCode value', () => {
    const out = wrapAsInlineCode([text('foo'), text('bar')]);
    expect(out).toEqual({ type: 'inlineCode', value: 'foobar' } as MdastNodes);
  });

  test('single-child wrapper with link → link preserved, inner replaced with inlineCode', () => {
    const input = [link('https://example.com', [text('abc123')])];
    const out = wrapAsInlineCode(input as MdastNodes[]);
    expect(out).toEqual({
      type: 'link',
      url: 'https://example.com',
      title: null,
      children: [{ type: 'inlineCode', value: 'abc123' }],
    } as MdastNodes);
  });

  test('single-child wrapper with strong → strong preserved, inner replaced with inlineCode', () => {
    const input = [strong([text('bold-code')])];
    const out = wrapAsInlineCode(input as MdastNodes[]);
    expect(out).toEqual({
      type: 'strong',
      children: [{ type: 'inlineCode', value: 'bold-code' }],
    } as MdastNodes);
  });

  test('single-child wrapper with emphasis → emphasis preserved, inner replaced with inlineCode', () => {
    const input = [emphasis([text('em-code')])];
    const out = wrapAsInlineCode(input as MdastNodes[]);
    expect(out).toEqual({
      type: 'emphasis',
      children: [{ type: 'inlineCode', value: 'em-code' }],
    } as MdastNodes);
  });

  test('single-child wrapper with delete → delete preserved, inner replaced with inlineCode', () => {
    const input = [del([text('struck-code')])];
    const out = wrapAsInlineCode(input as MdastNodes[]);
    expect(out).toEqual({
      type: 'delete',
      children: [{ type: 'inlineCode', value: 'struck-code' }],
    } as MdastNodes);
  });

  test('heterogeneous multi-child → recursive text extraction flat inlineCode', () => {
    const input = [text('a'), link('https://x', [text('b')]), strong([text('c')])];
    const out = wrapAsInlineCode(input as MdastNodes[]);
    expect(out).toEqual({ type: 'inlineCode', value: 'abc' } as MdastNodes);
  });

  test('nested wrapper preserves both levels (link containing strong)', () => {
    const input = [link('https://x', [strong([text('deep')])])];
    const out = wrapAsInlineCode(input as MdastNodes[]);
    // Outer link preserved; the recursive call collapses the inner strong+text
    // into an inlineCode nested inside the link.
    expect(out).toEqual({
      type: 'link',
      url: 'https://x',
      title: null,
      children: [
        {
          type: 'strong',
          children: [{ type: 'inlineCode', value: 'deep' }],
        },
      ],
    } as MdastNodes);
  });
});

describe('wrapAsInlineCode — properties: shape + content preservation', () => {
  const ALLOWED = new Set(['inlineCode', 'link', 'strong', 'emphasis', 'delete']);

  /**
   * Recursively collect every text leaf value from an mdast input-children
   * array OR a single mdast output node. Order-preserving so we can assert
   * that `wrapAsInlineCode` neither drops nor reorders characters — an
   * implementation that loses content would pass a type-only check but
   * fail this.
   */
  function collectText(nodeOrArray: MdastNodes | MdastNodes[]): string {
    const arr = Array.isArray(nodeOrArray) ? nodeOrArray : [nodeOrArray];
    let out = '';
    for (const n of arr) {
      if (n.type === 'text') {
        out += n.value;
      } else if (n.type === 'inlineCode') {
        out += n.value;
      } else if ('children' in n && Array.isArray(n.children)) {
        out += collectText(n.children as MdastNodes[]);
      }
    }
    return out;
  }

  test('random inline children → output.type ∈ allowed set AND input text is preserved', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ maxLength: 8 }).map(text),
            fc
              .record({ url: fc.webUrl(), inner: fc.string({ maxLength: 8 }) })
              .map(({ url, inner }) => link(url, [text(inner)])),
            fc.string({ maxLength: 8 }).map((s) => strong([text(s)])),
            fc.string({ maxLength: 8 }).map((s) => emphasis([text(s)])),
            fc.string({ maxLength: 8 }).map((s) => del([text(s)])),
          ),
          { maxLength: 4 },
        ),
        (children) => {
          const out = wrapAsInlineCode(children as MdastNodes[]);
          // Type property: output must be inlineCode or a structural wrapper.
          expect(ALLOWED.has(out.type)).toBe(true);
          // Content-preservation property: every character the input carried
          // must appear in the output, in order. A regression that dropped
          // `lang`, dropped children, or zeroed out `value` would fail this.
          const inputText = collectText(children as MdastNodes[]);
          const outputText = collectText(out);
          expect(outputText).toBe(inputText);
        },
      ),
      { numRuns: 100 },
    );
  });
});
