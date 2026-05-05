import { describe, expect, test } from 'bun:test';
import type { Code, Paragraph, Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { indentedCodePromoterPlugin } from './indented-code-promoter.ts';
import { remarkMdxAgnostic } from './remark-mdx-agnostic.ts';

function parseWithPromoter(source: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdxAgnostic)
    .use(indentedCodePromoterPlugin);
  const tree = processor.parse(source);
  processor.runSync(tree, new VFile({ value: source }));
  return tree;
}

function firstChild(tree: Root): Paragraph | Code | undefined {
  return tree.children[0] as Paragraph | Code | undefined;
}

describe('indented-code-promoter', () => {
  test('promotes top-level paragraph with 4-space prefix to code node', () => {
    const tree = parseWithPromoter('    code\n    line\n');
    const node = firstChild(tree);
    expect(node?.type).toBe('code');
    expect((node as Code)?.value).toBe('code\nline');
    expect(node?.data?.sourceStyle).toBe('indented');
  });

  test('promotes single-line indented paragraph', () => {
    const tree = parseWithPromoter('    just one line\n');
    const node = firstChild(tree);
    expect(node?.type).toBe('code');
    expect((node as Code)?.value).toBe('just one line');
    expect(node?.data?.sourceStyle).toBe('indented');
  });

  test('promotes tab-indented paragraph', () => {
    const tree = parseWithPromoter('\tcode line\n');
    const node = firstChild(tree);
    expect(node?.type).toBe('code');
    expect((node as Code)?.value).toBe('code line');
    expect(node?.data?.sourceStyle).toBe('indented');
  });

  test('does NOT promote a paragraph without leading whitespace', () => {
    const tree = parseWithPromoter('plain prose\nhere\n');
    const node = firstChild(tree);
    expect(node?.type).toBe('paragraph');
  });

  test('does NOT promote paragraph indented less than 4 spaces', () => {
    const tree = parseWithPromoter('  short indent\n');
    const node = firstChild(tree);
    expect(node?.type).toBe('paragraph');
  });

  test('does NOT promote a fenced code block (already a code node)', () => {
    const tree = parseWithPromoter('```\ncode\n```\n');
    const node = firstChild(tree);
    expect(node?.type).toBe('code');
    expect(node?.data?.sourceStyle).toBeUndefined();
  });

  test('does NOT promote paragraph inside a list item (not root)', () => {
    const tree = parseWithPromoter('- item\n\n    continuation\n');
    const node = firstChild(tree);
    expect(node?.type).toBe('list');
  });

  test('paragraph followed by indented block both round-trip via promoter', () => {
    const tree = parseWithPromoter('P before\n\n    code\n');
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0]?.type).toBe('paragraph');
    expect(tree.children[1]?.type).toBe('code');
    expect(tree.children[1]?.data?.sourceStyle).toBe('indented');
  });

  test('indented block followed by paragraph both round-trip via promoter', () => {
    const tree = parseWithPromoter('    code\n\nP after\n');
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0]?.type).toBe('code');
    expect(tree.children[0]?.data?.sourceStyle).toBe('indented');
    expect(tree.children[1]?.type).toBe('paragraph');
  });

  test('promoted code position covers indent prefix (column 1)', () => {
    const tree = parseWithPromoter('    code\n    line\n');
    const node = firstChild(tree) as Code;
    expect(node?.position?.start?.column).toBe(1);
    expect(node?.position?.start?.offset).toBe(0);
  });

  test('empty input does not crash', () => {
    const tree = parseWithPromoter('');
    expect(tree.children).toHaveLength(0);
  });
});
