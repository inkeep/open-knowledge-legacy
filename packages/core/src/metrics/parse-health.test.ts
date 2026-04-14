import { afterEach, describe, expect, test } from 'bun:test';
import {
  getParseHealth,
  incrementBlockFallback,
  incrementWholeDocFallback,
  incrementYpsMismatchBlock,
  incrementYpsMismatchInline,
  resetParseHealth,
} from './parse-health.ts';

describe('parse-health metrics', () => {
  afterEach(() => resetParseHealth());

  test('initial state is all zeros', () => {
    const h = getParseHealth();
    expect(h.parseFallback.blockLevel).toBe(0);
    expect(h.parseFallback.wholeDoc).toBe(0);
    expect(h.ypsMismatch.block).toBe(0);
    expect(h.ypsMismatch.inline).toBe(0);
  });

  test('incrementBlockFallback increments blockLevel', () => {
    incrementBlockFallback();
    incrementBlockFallback();
    expect(getParseHealth().parseFallback.blockLevel).toBe(2);
  });

  test('incrementWholeDocFallback increments wholeDoc', () => {
    incrementWholeDocFallback();
    expect(getParseHealth().parseFallback.wholeDoc).toBe(1);
  });

  test('incrementYpsMismatchBlock increments ypsMismatch.block', () => {
    incrementYpsMismatchBlock();
    incrementYpsMismatchBlock();
    incrementYpsMismatchBlock();
    expect(getParseHealth().ypsMismatch.block).toBe(3);
  });

  test('incrementYpsMismatchInline increments ypsMismatch.inline', () => {
    incrementYpsMismatchInline();
    expect(getParseHealth().ypsMismatch.inline).toBe(1);
  });

  test('getParseHealth returns a defensive copy', () => {
    incrementBlockFallback();
    const snap1 = getParseHealth();
    incrementBlockFallback();
    const snap2 = getParseHealth();
    expect(snap1.parseFallback.blockLevel).toBe(1);
    expect(snap2.parseFallback.blockLevel).toBe(2);
  });

  test('resetParseHealth resets all counters', () => {
    incrementBlockFallback();
    incrementWholeDocFallback();
    incrementYpsMismatchBlock();
    incrementYpsMismatchInline();
    resetParseHealth();
    const h = getParseHealth();
    expect(h.parseFallback.blockLevel).toBe(0);
    expect(h.parseFallback.wholeDoc).toBe(0);
    expect(h.ypsMismatch.block).toBe(0);
    expect(h.ypsMismatch.inline).toBe(0);
  });
});
