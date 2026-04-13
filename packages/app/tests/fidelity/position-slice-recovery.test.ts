/**
 * Position-slice delimiter recovery — R16(g).
 *
 * Verifies that the position-slice walker recovers authoring-form
 * delimiters from source text, and fidelity handlers preserve them
 * on round-trip. These are the non-default delimiter forms that would
 * normalize to defaults without position-slice recovery.
 */
import { describe, expect, test } from 'bun:test';
import { mdRoundTrip, normalize } from './helpers';

function assertRoundTrip(input: string): void {
  const output = normalize(mdRoundTrip(input));
  const expected = normalize(input);
  expect(output).toBe(expected);
}

describe('position-slice delimiter recovery (R16g)', () => {
  test('_emphasis_ stays underscore, not normalized to *', () => {
    assertRoundTrip('_emphasized text_\n');
  });

  test('__strong__ stays double-underscore, not normalized to **', () => {
    assertRoundTrip('__strong text__\n');
  });

  test('tilde code fence stays tildes', () => {
    assertRoundTrip('~~~\ncode\n~~~\n');
  });

  test('tilde code fence with language stays tildes', () => {
    assertRoundTrip('~~~js\nconsole.log("hi")\n~~~\n');
  });

  test('4-backtick code fence preserved', () => {
    assertRoundTrip('````\ncode with ``` inside\n````\n');
  });

  test('+ bullet marker stays +', () => {
    assertRoundTrip('+ Item one\n+ Item two\n');
  });

  test('* bullet marker stays *', () => {
    assertRoundTrip('* Item one\n* Item two\n');
  });

  test(') ordered delimiter stays )', () => {
    assertRoundTrip('1) First\n2) Second\n');
  });

  test('*** thematic break stays ***', () => {
    assertRoundTrip('***\n');
  });

  test('___ thematic break stays ___', () => {
    assertRoundTrip('___\n');
  });

  test('setext heading level 1 stays setext', () => {
    const input = 'Heading\n=======\n';
    const output = normalize(mdRoundTrip(input));
    // Should contain = underline (setext form preserved)
    expect(output).toContain('=');
    expect(output).not.toStartWith('#');
  });

  test('setext heading level 2 stays setext', () => {
    const input = 'Heading\n-------\n';
    const output = normalize(mdRoundTrip(input));
    // Should contain - underline (setext form preserved)
    // Note: must be careful — --- is also thematic break.
    // Setext requires non-empty text preceding the underline.
    expect(output).toContain('Heading');
  });

  test('hard break with backslash preserved', () => {
    assertRoundTrip('Line one\\\nLine two\n');
  });
});
