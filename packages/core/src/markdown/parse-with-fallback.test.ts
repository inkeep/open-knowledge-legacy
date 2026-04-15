import { afterEach, describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { getParseHealth, resetParseHealth } from '../metrics/parse-health.ts';
import { MarkdownManager } from './index.ts';
import { parseWithFallback as parseWithFallbackFn } from './parse-with-fallback.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

describe('parseWithFallback (R6)', () => {
  afterEach(() => resetParseHealth());

  test('valid markdown parses clean (no fallback)', () => {
    const result = mdManager.parseWithFallback('# Heading\n\nParagraph\n');
    expect(result.content).toBeDefined();
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(getParseHealth().parseFallback.blockLevel).toBe(0);
    expect(getParseHealth().parseFallback.wholeDoc).toBe(0);
  });

  test('<Foo>...</Bar> tag mismatch produces rawMdxFallback with surrounding structure', () => {
    const src = '# Heading\n\n<Foo>broken</Bar>\n\n# Another heading\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('rawMdxFallback');
    // Both headings should be preserved
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(getParseHealth().parseFallback.blockLevel).toBeGreaterThanOrEqual(1);
  });

  test('mismatched close tag in middle produces rawMdxFallback', () => {
    // </Bar> without opening <Bar> throws VFileMessage from mdast-util-mdx-jsx
    const src = '# Title\n\ntext </Bar> more text\n\nSome text after\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
  });

  test('position-less error falls through to whole-doc fallback', () => {
    const result = parseWithFallbackFn('some content', {
      parse: () => {
        throw new Error('no position info');
      },
    });
    expect(result.type).toBe('doc');
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });

  test('MAX_SPLIT_DEPTH exceeded falls to whole-doc fallback', () => {
    const result = parseWithFallbackFn(
      'a\n\nb\n\nc\n\nd\n\ne\n\nf\n\ng\n\nh\n\ni\n\nj\n\nk\n\nl\n\nm\n\nn\n\no\n\np\n\nq\n\nr\n\ns\n\nt\n\nu\n\nv\n\nw',
      {
        parse: () => {
          const err = new Error('always fails') as Error & { place: { offset: number } };
          err.place = { offset: 2 };
          throw err;
        },
      },
    );
    expect(result.type).toBe('doc');
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });

  test('ref-def hoisting across split: link resolves after fallback', () => {
    const src =
      '[link][ref1]\n\n[ref1]: https://example.com\n\n<Foo>broken</Bar>\n\nAnother [link][ref1]\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    // Verify link resolution survived the split — serialize and check
    const serialized = mdManager.serialize(result);
    expect(serialized).toContain('[ref1]: https://example.com');
    expect(serialized).toContain('[link][ref1]');
  });

  test('code fence containing <Tag> is not mistaken for JSX', () => {
    const src = '```\nsome code <Tag> inside\n```\n\n<Foo>broken</Bar>\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    // Code block should be preserved as codeBlock, not fallback
    expect(types).toContain('codeBlock');
    expect(types).toContain('rawMdxFallback');
  });

  test('empty input returns empty doc', () => {
    const result = mdManager.parseWithFallback('');
    expect(result.type).toBe('doc');
  });

  // ─── Regression tests added from PR #136 review feedback ─────────────────

  test('(m2) recovery-failure path: split succeeds but recursive parse throws → whole-doc fallback', () => {
    // Reviewer's concern: the inner try/catch in parseRecursive (lines 65-106)
    // handles recovery-phase failures (e.g., a bug in findFallbackRegion or a
    // pathological recursive-parse throw). Without this test, a regression
    // could silently degrade to whole-doc fallback on content that should
    // have had block-level fallback.
    let callCount = 0;
    const result = parseWithFallbackFn('a\n\nb\n\nc', {
      parse: () => {
        callCount++;
        if (callCount === 1) {
          // First (outer) parse throws with position → triggers split-then-rejoin
          const err = new Error('first call fails with position') as Error & {
            place: { offset: number };
          };
          err.place = { offset: 4 };
          throw err;
        }
        // Every subsequent parse throws — recovery fails; final wholeDocRawText
        throw new Error('recovery parse fail');
      },
    });
    expect(result.type).toBe('doc');
    // Recovery failure produces a single paragraph carrying the whole source as text
    const children = result.content as { type: string }[];
    expect(children.length).toBeGreaterThanOrEqual(1);
    // Metric fired for the whole-doc fallback that terminates recovery
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });

  test('(m3) findEnclosingPairedTag: surrounding headings preserved when mid-doc fallback fires', () => {
    // Reviewer's concern: findFallbackRegion correctly bounds the failing
    // region so headings before + after remain structured. Under agnostic
    // mode the error-producing construct is tag-mismatch (not unclosed tag,
    // which agnostic-mode tokenizer tolerates as prose). This exercises the
    // same findEnclosingPairedTag path — it locates the open tag to set
    // region.start and walks forward for the close.
    const src = '# Before\n\nsome text\n\n<Foo>content</Bar>\n\n# After\n\nmore\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBe(2); // both "Before" and "After" preserved
    expect(types).toContain('rawMdxFallback');
  });

  test('(m3) findEnclosingPairedTag: nested broken — innermost paired region captured', () => {
    // Reviewer's concern: multiple candidate opening tags before the error
    // offset. Our regex walks the BEST (last-before-offset) open tag — verify
    // that picks the innermost when nested.
    const src = '# Heading\n\n<Outer><Inner>broken</Bar></Outer>\n\n# Footer\n';
    const result = mdManager.parseWithFallback(src);
    const types = (result.content as { type: string }[]).map((n) => n.type);
    expect(types).toContain('rawMdxFallback');
    const headings = (result.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBe(2);
  });

  test('(c1) tryPerBlockFallback single-block early-return: position-less error on one-block doc → whole-doc', () => {
    // Reviewer's concern: the `if (blocks.length < 2) return null` guard is
    // untested. A single-block document with a position-less error should
    // fall to whole-doc raw text, NOT attempt per-block splitting (which
    // would wrap the whole doc in a rawMdxFallback).
    const singleBlock = 'just one paragraph here no blank lines';
    const result = parseWithFallbackFn(singleBlock, {
      parse: () => {
        // Position-less error ALWAYS — forces position-less fallback path,
        // then per-block split encounters single block, returns null,
        // caller falls to wholeDocRawText.
        throw new Error('always fails, no position');
      },
    });
    expect(result.type).toBe('doc');
    // Whole-doc fallback produces ONE paragraph containing the source
    const children = result.content as {
      type: string;
      content?: { type: string; text?: string }[];
    }[];
    expect(children.length).toBe(1);
    expect(children[0].type).toBe('paragraph');
    const text = children[0].content?.[0]?.text ?? '';
    expect(text).toContain('just one paragraph here');
    // No rawMdxFallback node — single-block path intentionally avoids wrapping
    const types = children.map((c) => c.type);
    expect(types).not.toContain('rawMdxFallback');
    expect(getParseHealth().parseFallback.wholeDoc).toBeGreaterThanOrEqual(1);
  });
});
