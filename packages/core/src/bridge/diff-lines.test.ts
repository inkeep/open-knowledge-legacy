import { expect, test } from 'bun:test';
import { diffLinesFast } from './diff-lines.ts';

test('identical strings return single unchanged entry', () => {
  const result = diffLinesFast('foo\n', 'foo\n');
  expect(result).toEqual([{ value: 'foo\n' }]);
});

test('added line produces added entry', () => {
  const result = diffLinesFast('a\n', 'a\nb\n');
  expect(result.some((c) => c.added && c.value.includes('b'))).toBe(true);
});

test('removed line produces removed entry', () => {
  const result = diffLinesFast('a\nb\n', 'a\n');
  expect(result.some((c) => c.removed && c.value.includes('b'))).toBe(true);
});

test('handles unterminated final lines', () => {
  const result = diffLinesFast('a', 'a\nb');
  expect(Array.isArray(result)).toBe(true);
  // Reconstructed text should match the new string
  const reconstructed = result
    .filter((c) => !c.removed)
    .map((c) => c.value)
    .join('');
  expect(reconstructed).toBe('a\nb');
});

test('empty to content produces single added entry', () => {
  const result = diffLinesFast('', 'hello\nworld\n');
  expect(result.some((c) => c.added)).toBe(true);
});

test('content to empty produces single removed entry', () => {
  const result = diffLinesFast('hello\nworld\n', '');
  expect(result.some((c) => c.removed)).toBe(true);
});

test('multiline diff preserves line boundaries', () => {
  const old = 'line1\nline2\nline3\n';
  const next = 'line1\nmodified\nline3\n';
  const result = diffLinesFast(old, next);
  // Should have removed 'line2' and added 'modified'
  expect(result.some((c) => c.removed && c.value.includes('line2'))).toBe(true);
  expect(result.some((c) => c.added && c.value.includes('modified'))).toBe(true);
});

test('value strings are exact substrings (character-accurate)', () => {
  const old = 'aaa\nbbb\n';
  const next = 'aaa\nccc\n';
  const result = diffLinesFast(old, next);
  // Every value should be a substring of old or new
  for (const change of result) {
    if (change.removed) {
      expect(old.includes(change.value)).toBe(true);
    } else if (change.added) {
      expect(next.includes(change.value)).toBe(true);
    }
  }
});
