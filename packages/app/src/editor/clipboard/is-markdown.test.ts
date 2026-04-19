/**
 * Tests for the FR-14 isMarkdown signal-count heuristic.
 *
 * The heuristic must reject prose that happens to contain a single `*` or
 * `#` and accept authored markdown with 3+ distinct signals. Threshold
 * scales with line count: min(3, floor(lineCount / 5)), floored at 1.
 */

import { describe, expect, test } from 'bun:test';
import { isMarkdown } from './is-markdown.ts';

describe('isMarkdown — FR-14 signal-count heuristic', () => {
  test('rejects simple one-line prose', () => {
    expect(isMarkdown('hello world')).toBe(false);
  });

  test('rejects short prose even with one accidental marker', () => {
    expect(isMarkdown("Tom's *favorite* movie")).toBe(false);
  });

  test('accepts authored markdown with 3+ signals', () => {
    const md = `# heading\n\n- bullet\n- bullet\n\n[link](url)\n\n\`\`\`\ncode\n\`\`\`\n`;
    expect(isMarkdown(md)).toBe(true);
  });

  test('accepts GFM table', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |';
    expect(isMarkdown(md)).toBe(true);
  });

  test('accepts fenced code block alone', () => {
    const md = '```typescript\nconst x = 1;\n```';
    expect(isMarkdown(md)).toBe(true);
  });

  test('short snippet (<5 lines) accepts at threshold 1', () => {
    // threshold = max(1, min(3, floor(4/5))) = max(1, 0) = 1
    expect(isMarkdown('- one\n- two\n- three\n- four')).toBe(true);
  });

  test('long prose with no markdown signals is rejected', () => {
    const prose = Array(20).fill('This is plain prose with no markdown signals.').join('\n');
    expect(isMarkdown(prose)).toBe(false);
  });

  test('empty string returns false', () => {
    expect(isMarkdown('')).toBe(false);
  });

  test('ATX heading counts as one signal', () => {
    expect(isMarkdown('# heading')).toBe(true);
  });

  test('math block counts', () => {
    expect(isMarkdown('Some text\n$$\n\\frac{a}{b}\n$$')).toBe(true);
  });
});
