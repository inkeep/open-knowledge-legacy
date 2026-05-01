import { describe, expect, test } from 'bun:test';
import { findFencedRegions, isInsideFence } from './fence-regions.ts';

describe('findFencedRegions', () => {
  test('backtick fence pair', () => {
    const src = 'before\n```\ncode\n```\nafter';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(1);
    expect(src.slice(regions[0][0], regions[0][1])).toBe('```\ncode\n```');
  });

  test('tilde fence pair', () => {
    const src = 'before\n~~~\ncode\n~~~\nafter';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(1);
    expect(src.slice(regions[0][0], regions[0][1])).toBe('~~~\ncode\n~~~');
  });

  test('mismatched fence types do not close each other', () => {
    const src = '```\ncode\n~~~\nstill code\n```';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(1);
    expect(src.slice(regions[0][0], regions[0][1])).toBe('```\ncode\n~~~\nstill code\n```');
  });

  test('unclosed fence extends to end of source', () => {
    const src = 'before\n```\ncode with no close';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(1);
    expect(regions[0][0]).toBe(7); // offset of ```
    expect(regions[0][1]).toBe(src.length);
  });

  test('fence at document start', () => {
    const src = '```\ncode\n```';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(1);
    expect(regions[0][0]).toBe(0);
  });

  test('fence at document end (no trailing newline)', () => {
    const src = 'text\n```\ncode\n```';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(1);
    expect(regions[0][1]).toBe(src.length);
  });

  test('multiple fenced regions', () => {
    const src = '```\na\n```\n\n~~~\nb\n~~~\n';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(2);
  });

  test('longer closing fence matches shorter opening', () => {
    const src = '```\ncode\n````';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(1);
  });

  test('shorter closing fence does not match longer opening', () => {
    const src = '````\ncode\n```\nstill inside\n````';
    const regions = findFencedRegions(src);
    expect(regions).toHaveLength(1);
    expect(src.slice(regions[0][0], regions[0][1])).toBe('````\ncode\n```\nstill inside\n````');
  });

  test('empty source returns no regions', () => {
    expect(findFencedRegions('')).toHaveLength(0);
  });

  test('no fences returns no regions', () => {
    expect(findFencedRegions('just plain text\nwith newlines')).toHaveLength(0);
  });
});

describe('isInsideFence', () => {
  test('offset inside fence returns true', () => {
    const src = 'before\n```\ncode\n```\nafter';
    const fences = findFencedRegions(src);
    const codeOffset = src.indexOf('code');
    expect(isInsideFence(codeOffset, fences)).toBe(true);
  });

  test('offset outside fence returns false', () => {
    const src = 'before\n```\ncode\n```\nafter';
    const fences = findFencedRegions(src);
    const afterOffset = src.indexOf('after');
    expect(isInsideFence(afterOffset, fences)).toBe(false);
  });

  test('offset at fence start boundary is inside', () => {
    const src = '```\ncode\n```';
    const fences = findFencedRegions(src);
    expect(isInsideFence(0, fences)).toBe(true);
  });

  test('offset at fence end boundary is outside', () => {
    const src = '```\ncode\n```';
    const fences = findFencedRegions(src);
    expect(isInsideFence(src.length, fences)).toBe(false);
  });
});
