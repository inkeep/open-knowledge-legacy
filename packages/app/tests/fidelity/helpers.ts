/**
 * Shared helpers for fidelity tests.
 */

import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';

export const mdManager = new MarkdownManager({ extensions: sharedExtensions });

/** Parse then serialize markdown — the canonical round-trip. */
export function mdRoundTrip(md: string): string {
  const json = mdManager.parse(md);
  return mdManager.serialize(json);
}

/** Strip trailing whitespace from each line and trailing newlines. */
export function normalize(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

/** Number of PBT runs: default 1000, or 10000 when STRESS_FIDELITY=1. */
export const NUM_RUNS = process.env.STRESS_FIDELITY === '1' ? 10_000 : 1_000;

/**
 * Per-test timeout scaled to NUM_RUNS. At 10000 runs, a property that takes
 * ~0.5ms per iteration accumulates to ~5s — right at bun test's default
 * timeout boundary. Scale to 90s under STRESS_FIDELITY=1 to absorb both
 * per-iteration cost and fast-check shrinking overhead on counterexamples.
 */
export const PBT_TIMEOUT_MS = process.env.STRESS_FIDELITY === '1' ? 90_000 : 30_000;

/**
 * Cross-seed coverage for handler PBTs.
 *
 * Fixed-seed PBT is effectively a fixed corpus — regressions whose smallest
 * counterexample isn't reachable from seed 42's sample path stay green
 * forever. Rotating across 3 seeds at `NUM_RUNS/3` each preserves the total
 * budget while exercising a broader swath of the generator's sample space.
 * Mirrors the precedent set by
 * `packages/core/src/markdown/autolink-void-html-guard.consistency.test.ts`
 * (which uses 5 seeds at `NUM_RUNS/5`).
 */
export const PBT_SEEDS = [42, 137, 2718] as const;

/** Run `fc.assert(property, ...)` across every seed in `PBT_SEEDS`. */
export function assertAcrossSeeds<T>(
  property: fc.IAsyncProperty<T> | fc.IProperty<T>,
  opts: { numRuns?: number } = {},
): void {
  const totalRuns = opts.numRuns ?? NUM_RUNS;
  const perSeed = Math.max(1, Math.floor(totalRuns / PBT_SEEDS.length));
  for (const seed of PBT_SEEDS) {
    fc.assert(property, { numRuns: perSeed, seed });
  }
}
