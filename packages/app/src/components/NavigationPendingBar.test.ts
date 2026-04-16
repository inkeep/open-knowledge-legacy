/**
 * NavigationPendingBar — unit tests for the pure `computeTier` + exported
 * constants that drive the 4-tier escalation (spec §F3, §F9).
 *
 * Repo convention (STOP_IF rules out adding @testing-library/react + happy-dom):
 * UI helpers are unit-tested at the pure-function altitude; full
 * render / click / aria behavior is covered by Playwright E2E — here, US-011
 * (F3 bar visible during isPending) + US-013 (F13 aria attributes). See
 * the `DocumentErrorBoundary.test.ts` / `DocumentBoundary.test.ts`
 * precedent for the same pattern.
 *
 * The tier function is the contract that makes the component correct: if a
 * future edit breaks a boundary, these tests catch it without a DOM.
 */

import { describe, expect, test } from 'bun:test';
import {
  computeTier,
  NavigationPendingBar,
  type PendingTier,
  TIER_BOUNDARIES_MS,
} from './NavigationPendingBar';

describe('TIER_BOUNDARIES_MS', () => {
  test('tier thresholds match spec §D7 (5s / 15s / 25s / 30s)', () => {
    expect(TIER_BOUNDARIES_MS.tier1).toBe(5_000);
    expect(TIER_BOUNDARIES_MS.tier2).toBe(15_000);
    expect(TIER_BOUNDARIES_MS.tier3).toBe(25_000);
    expect(TIER_BOUNDARIES_MS.timeout).toBe(30_000);
  });

  test('thresholds are strictly monotonic', () => {
    expect(TIER_BOUNDARIES_MS.tier1).toBeLessThan(TIER_BOUNDARIES_MS.tier2);
    expect(TIER_BOUNDARIES_MS.tier2).toBeLessThan(TIER_BOUNDARIES_MS.tier3);
    expect(TIER_BOUNDARIES_MS.tier3).toBeLessThan(TIER_BOUNDARIES_MS.timeout);
  });
});

describe('computeTier', () => {
  test('t=0 → tier 0 (subtle strip)', () => {
    expect(computeTier(0)).toBe(0);
  });

  test('just below tier1 boundary → tier 0', () => {
    expect(computeTier(TIER_BOUNDARIES_MS.tier1 - 1)).toBe(0);
  });

  test('exactly at tier1 boundary → tier 1 (visible label)', () => {
    expect(computeTier(TIER_BOUNDARIES_MS.tier1)).toBe(1);
  });

  test('mid tier1 window (10s) → tier 1', () => {
    expect(computeTier(10_000)).toBe(1);
  });

  test('just below tier2 boundary → tier 1', () => {
    expect(computeTier(TIER_BOUNDARIES_MS.tier2 - 1)).toBe(1);
  });

  test('exactly at tier2 boundary → tier 2 ("taking longer")', () => {
    expect(computeTier(TIER_BOUNDARIES_MS.tier2)).toBe(2);
  });

  test('mid tier2 window (20s) → tier 2', () => {
    expect(computeTier(20_000)).toBe(2);
  });

  test('just below tier3 boundary → tier 2', () => {
    expect(computeTier(TIER_BOUNDARIES_MS.tier3 - 1)).toBe(2);
  });

  test('exactly at tier3 boundary → tier 3 (Try again prompt)', () => {
    expect(computeTier(TIER_BOUNDARIES_MS.tier3)).toBe(3);
  });

  test('at the 30s timeout mark → tier 3 (still renders; DocumentErrorBoundary takes over)', () => {
    expect(computeTier(TIER_BOUNDARIES_MS.timeout)).toBe(3);
  });

  test('beyond 30s → tier 3 (tier is saturated; timeout handled elsewhere)', () => {
    expect(computeTier(60_000)).toBe(3);
  });

  test('negative elapsed (clock skew) → tier 0 (never escalates early)', () => {
    expect(computeTier(-1_000)).toBe(0);
  });

  test('escalation sequence through all tiers', () => {
    const sequence: PendingTier[] = [
      computeTier(0),
      computeTier(4_999),
      computeTier(5_000),
      computeTier(14_999),
      computeTier(15_000),
      computeTier(24_999),
      computeTier(25_000),
      computeTier(29_999),
    ];
    expect(sequence).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('NavigationPendingBar (module contract)', () => {
  test('default export is a function (React component)', () => {
    expect(typeof NavigationPendingBar).toBe('function');
  });

  test('default export accepts isPending / onRetry / clock props (signature arity)', () => {
    // One argument: the props object. React components take a single props arg.
    expect(NavigationPendingBar.length).toBe(1);
  });
});
