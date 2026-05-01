import { describe, expect, test } from 'bun:test';
import { MAX_SUMMARY_LENGTH, normalizeSummary } from './agent-write-summary.ts';

describe('normalizeSummary — classification', () => {
  test('undefined → absent', () => {
    expect(normalizeSummary(undefined)).toEqual({ kind: 'absent' });
  });

  test('empty string → absent (treated as missing; does not inflate M1)', () => {
    expect(normalizeSummary('')).toEqual({ kind: 'absent' });
  });

  test('whitespace-only string → absent (blank bullet would add zero signal)', () => {
    expect(normalizeSummary(' ')).toEqual({ kind: 'absent' });
    expect(normalizeSummary('     ')).toEqual({ kind: 'absent' });
    expect(normalizeSummary('\t')).toEqual({ kind: 'absent' });
    expect(normalizeSummary('\n\t \r')).toEqual({ kind: 'absent' });
  });

  test('non-whitespace-only string with surrounding whitespace → value (preserved verbatim, no trim)', () => {
    expect(normalizeSummary('  hi  ')).toEqual({ kind: 'value', value: '  hi  ' });
  });

  test('number → invalid (caller returns 400)', () => {
    expect(normalizeSummary(42)).toEqual({ kind: 'invalid' });
  });

  test('object → invalid', () => {
    expect(normalizeSummary({ text: 'hi' })).toEqual({ kind: 'invalid' });
  });

  test('array → invalid (Array.isArray(raw) is an object in typeof — explicit coverage)', () => {
    expect(normalizeSummary(['hi'])).toEqual({ kind: 'invalid' });
    expect(normalizeSummary([])).toEqual({ kind: 'invalid' });
  });

  test('null → invalid', () => {
    expect(normalizeSummary(null)).toEqual({ kind: 'invalid' });
  });

  test('boolean → invalid', () => {
    expect(normalizeSummary(true)).toEqual({ kind: 'invalid' });
  });
});

describe('normalizeSummary — valid strings', () => {
  test('1-char string → value, no truncation', () => {
    expect(normalizeSummary('x')).toEqual({ kind: 'value', value: 'x' });
  });

  test('80-char string → value, no truncation (D20: exactly cap is NOT truncated)', () => {
    const s = 'a'.repeat(80);
    expect(s.length).toBe(MAX_SUMMARY_LENGTH);
    const result = normalizeSummary(s);
    expect(result).toEqual({ kind: 'value', value: s });
    if (result.kind === 'value') {
      expect(result.truncatedFrom).toBeUndefined();
    }
  });

  test('81-char string → truncated (79 visible + ellipsis), truncatedFrom: 81', () => {
    const s = 'a'.repeat(81);
    const result = normalizeSummary(s);
    expect(result.kind).toBe('value');
    if (result.kind === 'value') {
      expect(result.truncatedFrom).toBe(81);
      expect(result.value).toBe(`${'a'.repeat(79)}…`);
      expect([...result.value].length).toBe(80); // 79 'a' + 1 ellipsis codepoint
    }
  });

  test('200-char string → truncated to 79 + ellipsis, truncatedFrom: 200', () => {
    const s = 'b'.repeat(200);
    const result = normalizeSummary(s);
    if (result.kind === 'value') {
      expect(result.truncatedFrom).toBe(200);
      expect(result.value).toBe(`${'b'.repeat(79)}…`);
    }
  });

  test('truncation suffix is U+2026 HORIZONTAL ELLIPSIS (single codepoint, NOT three ASCII dots)', () => {
    const s = 'x'.repeat(100);
    const result = normalizeSummary(s);
    if (result.kind === 'value') {
      expect(result.value.endsWith('…')).toBe(true);
      expect(result.value.endsWith('...')).toBe(false);
      expect(result.value.charCodeAt(result.value.length - 1)).toBe(0x2026);
    }
  });

  test('long string with surrogate-pair emoji is truncated by code-unit length', () => {
    const s = `${'a'.repeat(78)}🔥 reference`; // 78 + 2 + " reference" = 90 code units
    const result = normalizeSummary(s);
    if (result.kind === 'value') {
      expect(result.truncatedFrom).toBe(s.length);
      expect(result.value.length).toBe(80);
      expect(result.value.endsWith('…')).toBe(true);
    }
  });
});
