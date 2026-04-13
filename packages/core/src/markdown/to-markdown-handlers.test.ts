/**
 * Tests for custom mdast-util-to-markdown serialization handlers.
 *
 * Verifies that fidelity data survives parse→serialize round-trips:
 * delimiters, fence chars, bullet markers, heading styles, etc.
 */
import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

describe('to-markdown: emphasis delimiter preservation', () => {
  test('underscore emphasis round-trips as _', () => {
    expect(roundTrip('_word_\n')).toBe('_word_\n');
  });

  test('asterisk emphasis round-trips as *', () => {
    expect(roundTrip('*word*\n')).toBe('*word*\n');
  });
});

describe('to-markdown: strong delimiter preservation', () => {
  test('double-underscore strong round-trips as __', () => {
    expect(roundTrip('__word__\n')).toBe('__word__\n');
  });

  test('double-asterisk strong round-trips as **', () => {
    expect(roundTrip('**word**\n')).toBe('**word**\n');
  });
});

describe('to-markdown: code block fence preservation', () => {
  test('backtick fence round-trips', () => {
    expect(roundTrip('```js\ncode\n```\n')).toBe('```js\ncode\n```\n');
  });

  test('tilde fence round-trips as ~~~', () => {
    expect(roundTrip('~~~\ncode\n~~~\n')).toBe('~~~\ncode\n~~~\n');
  });

  test('4-backtick fence round-trips', () => {
    expect(roundTrip('````\ncode\n````\n')).toBe('````\ncode\n````\n');
  });
});

describe('to-markdown: thematic break preservation', () => {
  // NG10: doc-start `---` is indistinguishable from empty YAML frontmatter
  // under remark-frontmatter; normalize to `***` for idempotent round-trip.
  // Non-doc-start `---` preserves sourceRaw.
  test('doc-start --- normalizes to *** (NG10)', () => {
    expect(roundTrip('---\n')).toBe('***\n');
  });

  test('*** round-trips as ***', () => {
    expect(roundTrip('***\n')).toBe('***\n');
  });

  test('non-doc-start --- preserves sourceRaw', () => {
    expect(roundTrip('paragraph\n\n---\n\nmore\n')).toBe('paragraph\n\n---\n\nmore\n');
  });
});

describe('to-markdown: hard break style', () => {
  test('backslash hard break round-trips', () => {
    expect(roundTrip('line\\\nbreak\n')).toBe('line\\\nbreak\n');
  });
});

describe('to-markdown: heading style', () => {
  test('ATX heading round-trips', () => {
    expect(roundTrip('## Title\n')).toBe('## Title\n');
  });
});

describe('to-markdown: list marker preservation', () => {
  test('dash bullet round-trips', () => {
    expect(roundTrip('- item one\n- item two\n')).toBe('- item one\n- item two\n');
  });

  test('plus bullet round-trips', () => {
    expect(roundTrip('+ item one\n+ item two\n')).toBe('+ item one\n+ item two\n');
  });

  test('asterisk bullet round-trips', () => {
    expect(roundTrip('* item one\n* item two\n')).toBe('* item one\n* item two\n');
  });
});

describe('to-markdown: text handler (NG5 fidelity)', () => {
  test('literal & in text survives round-trip', () => {
    expect(roundTrip('H&M Store\n')).toBe('H&M Store\n');
  });

  test('literal < in text survives round-trip', () => {
    expect(roundTrip('a < b\n')).toBe('a < b\n');
  });
});

describe('to-markdown: link URL preservation', () => {
  test('URL with & survives round-trip', () => {
    const md = '[link](https://example.com?a=1&b=2)\n';
    expect(roundTrip(md)).toBe(md);
  });
});
