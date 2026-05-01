
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';

export const mdManager = new MarkdownManager({ extensions: sharedExtensions });

export function mdRoundTrip(md: string): string {
  const json = mdManager.parse(md);
  return mdManager.serialize(json);
}

export function normalize(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

export const NUM_RUNS = process.env.STRESS_FIDELITY === '1' ? 10_000 : 1_000;

export const PBT_TIMEOUT_MS = process.env.STRESS_FIDELITY === '1' ? 90_000 : 30_000;

export const PBT_SEEDS = [42, 137, 2718] as const;

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
