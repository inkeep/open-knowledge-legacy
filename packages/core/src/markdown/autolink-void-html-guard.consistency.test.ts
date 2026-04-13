/**
 * Guard self-consistency: protectFromMdx + restoreFromMdx preserves content.
 *
 * Two properties:
 * 1. Text round-trip: for any string without PUA chars (U+E000-E004),
 *    restoreString(protectFromMdx(s)) === s. The guard is a bijection on
 *    the non-PUA string space.
 * 2. Sentinel exhaustiveness: protectFromMdx output never contains literal
 *    unmatched `<` or `{` (they're all replaced with PUA sentinels).
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { protectFromMdx } from './autolink-void-html-guard.ts';

// Inline restoreString since it's not exported
function restoreString(s: string): string {
  return s
    .replaceAll('\uE000', '<')
    .replaceAll('\uE001', '>')
    .replaceAll('\uE002', ':')
    .replaceAll('\uE003', '@')
    .replaceAll('\uE004', '{');
}

/** Generate strings that never contain PUA sentinel chars. */
const nonPuaString = fc
  .array(
    fc.oneof(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n'),
      fc.constantFrom(...'<>&[]{}:@`#\\*_$~!/()"\'-=,.;?'),
    ),
    { maxLength: 200 },
  )
  .map((chars) => chars.join(''));

const NUM_RUNS = process.env.STRESS_FIDELITY === '1' ? 10_000 : 1_000;
const TIMEOUT = process.env.STRESS_FIDELITY === '1' ? 90_000 : 30_000;

describe('Guard self-consistency', () => {
  test(
    'restoreString(protectFromMdx(s)) === s for non-PUA strings',
    () => {
      fc.assert(
        fc.property(nonPuaString, (s) => {
          const protected_ = protectFromMdx(s);
          const restored = restoreString(protected_);
          expect(restored).toBe(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    TIMEOUT,
  );

  test(
    'protectFromMdx output has no unmatched literal {',
    () => {
      fc.assert(
        fc.property(nonPuaString, (s) => {
          const protected_ = protectFromMdx(s);
          // Count literal { and } (not PUA sentinels)
          let depth = 0;
          for (const ch of protected_) {
            if (ch === '{') depth++;
            else if (ch === '}') {
              depth--;
              if (depth < 0) depth = 0;
            }
          }
          // All remaining { should be matched (depth === 0)
          // or there shouldn't be any literal { at all
          expect(depth).toBe(0);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    TIMEOUT,
  );

  test(
    'multi-seed text round-trip (5 seeds)',
    () => {
      for (const seed of [42, 137, 2718, 31415, 99991]) {
        fc.assert(
          fc.property(nonPuaString, (s) => {
            expect(restoreString(protectFromMdx(s))).toBe(s);
          }),
          { numRuns: Math.floor(NUM_RUNS / 5), seed },
        );
      }
    },
    TIMEOUT,
  );
});
