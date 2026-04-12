/**
 * Shared helpers for fidelity tests.
 */

import { sharedExtensions } from '@inkeep/open-knowledge-core';
import { MarkdownManager } from '@tiptap/markdown';

export const mdManager = new MarkdownManager({ extensions: sharedExtensions });

/** Serialize then parse markdown — the canonical round-trip. */
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
