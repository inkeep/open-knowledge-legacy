/**
 * Unified-list round-trip — R16(e).
 *
 * Verifies that the unified list extension (D15) preserves authoring
 * form for bullet markers (-, *, +), ordered delimiters (., )),
 * task items, and nested lists.
 */
import { describe, expect, test } from 'bun:test';
import { mdRoundTrip, normalize } from './helpers';

function assertRoundTrip(input: string): void {
  const output = normalize(mdRoundTrip(input));
  const expected = normalize(input);
  expect(output).toBe(expected);
}

describe('unified-list round-trip — bullet markers (R16e)', () => {
  test('dash bullet marker preserved', () => {
    assertRoundTrip('- Item one\n- Item two\n');
  });

  test('star bullet marker preserved', () => {
    assertRoundTrip('* Item one\n* Item two\n');
  });

  test('plus bullet marker preserved', () => {
    assertRoundTrip('+ Item one\n+ Item two\n');
  });
});

describe('unified-list round-trip — ordered delimiters', () => {
  test('dot delimiter preserved', () => {
    assertRoundTrip('1. First\n2. Second\n');
  });

  test('paren delimiter preserved', () => {
    assertRoundTrip('1) First\n2) Second\n');
  });

  test('ordered list with start number', () => {
    assertRoundTrip('3. Third\n4. Fourth\n');
  });
});

describe('unified-list round-trip — task items', () => {
  test('unchecked task item', () => {
    assertRoundTrip('- [ ] Todo item\n');
  });

  test('checked task item', () => {
    assertRoundTrip('- [x] Done item\n');
  });

  test('mixed task and regular items', () => {
    assertRoundTrip('- [ ] Todo\n- [x] Done\n- Regular item\n');
  });
});

describe('unified-list round-trip — nested lists', () => {
  test('nested bullet lists', () => {
    assertRoundTrip('- Parent\n  - Child\n  - Child 2\n- Parent 2\n');
  });

  test('nested ordered inside bullet', () => {
    assertRoundTrip('- Bullet\n  1. Ordered child\n  2. Second ordered\n');
  });

  test('deeply nested list', () => {
    assertRoundTrip('- Level 1\n  - Level 2\n    - Level 3\n');
  });
});

describe('unified-list round-trip — convergence', () => {
  test('list convergence: f(f(x)) === f(x)', () => {
    const input = '- Item one\n- Item two\n';
    const first = mdRoundTrip(input);
    const second = mdRoundTrip(first);
    expect(normalize(second)).toBe(normalize(first));
  });
});
