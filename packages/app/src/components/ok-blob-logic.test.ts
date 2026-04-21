import { describe, expect, test } from 'bun:test';
import { nextClickLevel, RAGE_WINDOW_MS } from './ok-blob-logic';

describe('nextClickLevel', () => {
  test('first click from idle returns 1 regardless of dt', () => {
    expect(nextClickLevel(0, 0)).toBe(1);
    expect(nextClickLevel(0, 10_000)).toBe(1);
    expect(nextClickLevel(0, Number.POSITIVE_INFINITY)).toBe(1);
  });

  test('click after window elapsed resets to 1', () => {
    expect(nextClickLevel(1, RAGE_WINDOW_MS)).toBe(1);
    expect(nextClickLevel(2, RAGE_WINDOW_MS + 50)).toBe(1);
    expect(nextClickLevel(3, 5_000)).toBe(1);
  });

  test('rapid click within window increments', () => {
    expect(nextClickLevel(1, 100)).toBe(2);
    expect(nextClickLevel(2, 100)).toBe(3);
  });

  test('caps at max level on sustained rage', () => {
    expect(nextClickLevel(3, 100)).toBe(3);
    expect(nextClickLevel(3, 0)).toBe(3);
  });

  test('respects custom window override', () => {
    expect(nextClickLevel(1, 200, { windowMs: 100 })).toBe(1);
    expect(nextClickLevel(1, 50, { windowMs: 100 })).toBe(2);
  });

  test('respects custom max-level override', () => {
    expect(nextClickLevel(2, 100, { maxLevel: 2 })).toBe(2);
  });
});
