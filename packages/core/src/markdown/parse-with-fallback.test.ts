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
});
