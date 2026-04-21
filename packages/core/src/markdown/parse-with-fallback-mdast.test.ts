/**
 * Tests for `parseToMdastWithFallback` — the mdast-layer fallback that
 * mirrors `parseWithFallback` (JSONContent layer) for V2 SPEC FR11.
 *
 * The contract is "never throws": broken blocks become `rawMdxFallback`
 * mdast nodes; the walker at `to-react.ts` renders them as `<pre>`.
 */

import { describe, expect, test } from 'bun:test';
import type { Root as MdastRoot } from 'mdast';
import { parseToMdastWithFallback } from './parse-with-fallback.ts';

describe('parseToMdastWithFallback — happy path', () => {
  test('passes through a valid parse unchanged', () => {
    const valid = { type: 'root', children: [{ type: 'paragraph', children: [] }] } as MdastRoot;
    const out = parseToMdastWithFallback('irrelevant', {
      parseToMdast: () => valid,
    });
    // Identity-preserving when the wrapped parse succeeds.
    expect(out).toBe(valid);
  });
});

describe('parseToMdastWithFallback — error paths', () => {
  test('position-less throw → whole-doc rawMdxFallback', () => {
    const brokenSource = '# Heading\n\nSome body text.';
    const out = parseToMdastWithFallback(brokenSource, {
      parseToMdast: () => {
        throw new Error('PM construction RangeError with no position info');
      },
    });
    expect(out.type).toBe('root');
    expect(out.children.length).toBe(1);
    const first = out.children[0] as unknown as { type: string; value: string };
    expect(first.type).toBe('rawMdxFallback');
    expect(first.value).toBe(brokenSource);
  });

  test('positioned throw → block-split with rawMdxFallback for failing region', () => {
    const source = 'Intro para.\n\n<Broken>content</Wrong>\n\nOutro para.';
    // Stub parser: first call throws with position, recursive calls succeed
    // with a realistic mdast Root shape.
    let call = 0;
    const out = parseToMdastWithFallback(source, {
      parseToMdast: (md) => {
        call++;
        if (call === 1) {
          // Throw with a VFileMessage-shaped `place.offset` pointing into
          // the broken tag region.
          const err = new Error('Unexpected close tag `</Wrong>`');
          (err as unknown as { place: { offset: number } }).place = { offset: 24 };
          throw err;
        }
        // Subsequent recursive calls: return a stub mdast for each half.
        return {
          type: 'root',
          children: [
            { type: 'paragraph', children: [{ type: 'text', value: md.trim() } as never] } as never,
          ],
        } as MdastRoot;
      },
    });
    // Structure: [before-para, rawMdxFallback, after-para]
    expect(out.type).toBe('root');
    expect(out.children.length).toBeGreaterThanOrEqual(1);
    const hasFallback = out.children.some(
      (c) => (c as unknown as { type: string }).type === 'rawMdxFallback',
    );
    expect(hasFallback).toBe(true);
  });

  test('recovery-within-recovery throws are swallowed (wholeDoc fallback)', () => {
    const source = 'Para A.\n\n<Broken>\n\nPara C.';
    // Always throw — no path parses cleanly, exercising the depth exhaustion
    // and "recovery failed" branches.
    const out = parseToMdastWithFallback(source, {
      parseToMdast: () => {
        throw new Error('always fails');
      },
    });
    // Should end up as whole-doc raw text, NEVER propagate the throw.
    expect(out.type).toBe('root');
    // At least one child is a rawMdxFallback carrying source bytes.
    const hasFallback = out.children.some(
      (c) => (c as unknown as { type: string }).type === 'rawMdxFallback',
    );
    expect(hasFallback).toBe(true);
  });

  test('never throws for any input', () => {
    // Stress: try a variety of nasty strings through a broken parser. The
    // guarantee is "never throws" — not "produces meaningful output".
    const inputs = [
      '',
      '   ',
      '\n\n\n',
      '<<<<<>>>>>',
      '```\nunclosed fence',
      '{ invalid MDX expression',
      '<Foo type={(()=>{})()}>...',
    ];
    for (const input of inputs) {
      expect(() =>
        parseToMdastWithFallback(input, {
          parseToMdast: () => {
            throw new Error('fail');
          },
        }),
      ).not.toThrow();
    }
  });
});
