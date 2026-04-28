/**
 * escapeMark round-trip — R16(h), D20.
 *
 * Verifies that structurally-ambiguous backslash escapes (per CommonMark
 * section 2.4) are preserved on round-trip via the D20 escapeMark PM mark.
 *
 * Scope: only structurally-ambiguous escapes are preserved. Non-ambiguous
 * escapes (e.g., `\foo`) lose the backslash on round-trip (documented NG).
 */
import { describe, expect, test } from 'bun:test';
import { mdRoundTrip, normalize } from './helpers';

function assertRoundTrip(input: string): void {
  const output = normalize(mdRoundTrip(input));
  const expected = normalize(input);
  expect(output).toBe(expected);
}

describe('escapeMark — structurally-ambiguous escapes preserved (D20, R16h)', () => {
  test('\\# (escaped hash) round-trips', () => {
    assertRoundTrip('text \\# more\n');
  });

  test('\\* (escaped star) round-trips', () => {
    assertRoundTrip('text \\* more\n');
  });

  test('\\_ (escaped underscore) round-trips', () => {
    assertRoundTrip('text \\_ more\n');
  });

  test('\\[ (escaped bracket) round-trips', () => {
    assertRoundTrip('text \\[ more\n');
  });

  test('\\` (escaped backtick) round-trips', () => {
    assertRoundTrip('text \\` more\n');
  });

  test('\\~ (escaped tilde) round-trips', () => {
    assertRoundTrip('text \\~ more\n');
  });

  test('\\\\*literal\\\\* — escaped stars not parsed as emphasis', () => {
    assertRoundTrip('\\*literal\\*\n');
  });

  test('\\\\> at start of line preserved (not blockquote)', () => {
    assertRoundTrip('\\> not a quote\n');
  });

  test('\\\\- at start of line preserved (not list)', () => {
    assertRoundTrip('\\- not a list\n');
  });

  test('multiple escapes in one line', () => {
    assertRoundTrip('\\# heading \\* star \\_ underscore\n');
  });
});

describe('escapeMark — cross-mark composition', () => {
  test('escaped char inside bold: **bold\\*word**', () => {
    assertRoundTrip('**bold\\*word**\n');
  });

  test('escaped char inside emphasis: *em\\*phasis*', () => {
    assertRoundTrip('*em\\*phasis*\n');
  });
});

describe('escapeMark — end-of-line trailing literal backslash', () => {
  test('trailing backslash runs at end of line round-trip', () => {
    const triple = '\\'.repeat(3);
    assertRoundTrip('foo\\\n');
    assertRoundTrip(`foo${triple}\n`);
  });
});

describe('escapeMark — non-ambiguous escapes (documented NG: backslash drops)', () => {
  test('\\A (non-special char) — backslash may drop', () => {
    const input = '\\A non-special\n';
    // Non-ambiguous escapes lose the backslash — this is acceptable
    // Just verify it doesn't crash
    expect(() => mdRoundTrip(input)).not.toThrow();
  });
});
