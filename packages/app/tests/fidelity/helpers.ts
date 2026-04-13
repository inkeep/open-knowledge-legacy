/**
 * Shared helpers for fidelity tests.
 */

import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';

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
