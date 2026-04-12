/**
 * P0 fidelity tests — entity bypass + backslash escape round-trip.
 *
 * Verifies the @tiptap/markdown patch:
 *   R1  — encodeTextForMarkdown bypasses HTML entity encoding
 *   R2  — parseInlineTokens handles 'escape' tokens; encodeTextForMarkdown re-escapes
 *   R14 — @tiptap/markdown pinned exact
 *   R20 — Link URL with & preserved
 *
 * These 12 cases cover the P0 hit list from the fidelity catalog.
 */

import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '@inkeep/open-knowledge-core';
import { MarkdownManager } from '@tiptap/markdown';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

function stripTrailingWhitespace(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

function assertRoundTrip(input: string): void {
  const output = stripTrailingWhitespace(roundTrip(input));
  const normalized = stripTrailingWhitespace(input);
  expect(output).toBe(normalized);
}

// ─── Entity bypass (R1) ───

describe('entity bypass — literal chars survive round-trip', () => {
  test('ampersand in heading: # H&M Store', () => {
    assertRoundTrip('# H&M Store\n');
  });

  test('ampersand in paragraph', () => {
    assertRoundTrip('H&M Store has sales.\n');
  });

  test('less-than in text: a < b', () => {
    assertRoundTrip('a < b\n');
  });

  test('greater-than in text: a > b', () => {
    // > at start of line is blockquote; inline is fine
    assertRoundTrip('result: a > b\n');
  });

  test('mixed entities: 3 < 5 & 5 > 3', () => {
    assertRoundTrip('Mixed: 3 < 5 & 5 > 3\n');
  });

  test('link URL with & (R20): [text](url?a=1&b=2)', () => {
    assertRoundTrip('[text](https://example.com?a=1&b=2)\n');
  });
});

// ─── Backslash escape round-trip (R2) ───

describe('backslash escape — byte-identical round-trip', () => {
  test('\\* (escaped star)', () => {
    assertRoundTrip('text \\* more\n');
  });

  test('\\_ (escaped underscore)', () => {
    assertRoundTrip('text \\_ more\n');
  });

  test('\\[ (escaped open bracket)', () => {
    assertRoundTrip('text \\[ more\n');
  });

  test('\\# (escaped hash)', () => {
    assertRoundTrip('text \\# more\n');
  });

  test('\\` (escaped backtick)', () => {
    assertRoundTrip('text \\` more\n');
  });

  test('\\~ (escaped tilde)', () => {
    assertRoundTrip('text \\~ more\n');
  });
});

// ─── Version pin (R14) ───

describe('@tiptap/markdown version pin', () => {
  test('MarkdownManager.prototype.encodeTextForMarkdown exists (patch applied)', () => {
    // If the patch was applied, encodeTextForMarkdown should exist as a method.
    // Access via prototype — this verifies the patched dist was loaded.
    expect(typeof (MarkdownManager.prototype as any).encodeTextForMarkdown).toBe('function');
  });
});
