/**
 * Unknown mdast type handling — R8 + R16(i) contract.
 *
 * Post-R8: unknown mdast types produce a rawMdxFallback node (block) or
 * plain text (inline) + console.warn structured event — no throw, no
 * silent drop. Content is preserved AND developer signal is louder than
 * the previous throw-on-unknown behavior.
 *
 * TODO(US-004): Finalize R8 contract — unknown mdast types should produce
 * rawMdxFallback for block types and plain text for inline types. Until
 * US-004 lands the catch-all handler, known types parse without error
 * and the test verifies no silent drops.
 */
import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

describe('unknown mdast type handling (R8 + R16i)', () => {
  test('known types parse without error', () => {
    expect(() => mdManager.parse('# Heading\n')).not.toThrow();
    expect(() => mdManager.parse('- list\n')).not.toThrow();
    expect(() => mdManager.parse('**bold**\n')).not.toThrow();
    expect(() => mdManager.parse('```\ncode\n```\n')).not.toThrow();
    expect(() => mdManager.parse('> quote\n')).not.toThrow();
    expect(() => mdManager.parse('---\n')).not.toThrow();
  });

  test('MDX types parse without error (registered handlers)', () => {
    expect(() => mdManager.parse('<Component />\n')).not.toThrow();
  });

  test('ESM import under agnostic mode re-parses as prose (not thrown, not structured)', () => {
    // Under agnostic mode (R1), ESM import/export are no longer recognized
    // as mdxjsEsm — they re-parse as prose paragraphs per NG1.
    const result = mdManager.parse("import x from 'y'\n");
    const serialized = mdManager.serialize(result);
    expect(serialized).toContain('import');
  });

  test('wiki-link types parse without error', () => {
    expect(() => mdManager.parse('[[Page]]\n')).not.toThrow();
  });

  test('directive syntax renders as literal text (D14 — remark-directive removed)', () => {
    // After D14, :::note syntax is no longer parsed as a directive.
    // It renders as literal text containing the colons.
    const result = mdManager.parse(':::note\ncontent\n:::\n');
    const serialized = mdManager.serialize(result);
    expect(serialized).toContain(':::note');
    expect(serialized).toContain('content');
  });

  test('all known node types are handled (no silent drops)', () => {
    const md = [
      '# Heading',
      '',
      'A paragraph with **bold** and *emphasis*.',
      '',
      '- Bullet item',
      '',
      '1. Ordered item',
      '',
      '> Blockquote',
      '',
      '```js',
      'code()',
      '```',
      '',
      '---',
      '',
      '[link](https://example.com)',
      '',
      '[[WikiLink]]',
      '',
    ].join('\n');
    const json = mdManager.parse(md);
    const output = mdManager.serialize(json);
    expect(output).toContain('Heading');
    expect(output).toContain('bold');
    expect(output).toContain('emphasis');
    expect(output).toContain('Bullet item');
    expect(output).toContain('Ordered item');
    expect(output).toContain('Blockquote');
    expect(output).toContain('code()');
    expect(output).toContain('link');
    expect(output).toContain('WikiLink');
  });
});
