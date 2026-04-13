/**
 * Scaffold tests for the new unified MarkdownManager.
 *
 * Verifies the tracer bullet: MarkdownManager.parse + serialize
 * round-trips simple markdown byte-identically.
 */
import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

describe('MarkdownManager scaffold', () => {
  test('parse returns valid JSONContent with heading + paragraph', () => {
    const json = mdManager.parse('# Hello\n\nworld\n');
    expect(json).toBeDefined();
    expect(json.type).toBe('doc');
    expect(json.content).toBeDefined();
    expect(json.content!.length).toBeGreaterThanOrEqual(2);

    const heading = json.content![0];
    expect(heading.type).toBe('heading');
    expect(heading.attrs?.level).toBe(1);

    const para = json.content![1];
    expect(para.type).toBe('paragraph');
  });

  test('simple heading + paragraph round-trips byte-identically', () => {
    const input = '# Hello\n\nworld\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('multi-paragraph round-trip', () => {
    const input = 'First paragraph.\n\nSecond paragraph.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('emphasis and strong round-trip', () => {
    const input = 'This is *emphasized* and **strong** text.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('inline code round-trips', () => {
    const input = 'Use `console.log()` for debug.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('code block round-trips', () => {
    const input = '```js\nconsole.log("hello");\n```\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('blockquote round-trips', () => {
    const input = '> This is a quote.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('link round-trips', () => {
    const input = 'Visit [example](https://example.com) for details.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('unordered list round-trips', () => {
    const input = '- item one\n- item two\n- item three\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });

  test('horizontal rule round-trips', () => {
    const input = 'Above.\n\n---\n\nBelow.\n';
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    expect(output).toBe(input);
  });
});
