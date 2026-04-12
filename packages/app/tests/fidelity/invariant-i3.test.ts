/**
 * Invariant I3 — Normalization canonicality: double round-trip equals
 * single round-trip. f(f(x)) === f(x).
 *
 * Even if the first round-trip normalizes (e.g., changes whitespace),
 * the result must be stable — a second pass must not change it further.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { block, headingWithMarks, markdownDoc, paragraphWithMarks } from './arbitraries';
import { mdRoundTrip, NUM_RUNS, normalize } from './helpers';

describe('I3 — normalization canonicality: f(f(x)) === f(x)', () => {
  test('single blocks', () => {
    fc.assert(
      fc.property(block, (md) => {
        const once = normalize(mdRoundTrip(md));
        const twice = normalize(mdRoundTrip(once));
        expect(twice).toBe(once);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('multi-block documents', () => {
    fc.assert(
      fc.property(markdownDoc, (md) => {
        const once = normalize(mdRoundTrip(md));
        const twice = normalize(mdRoundTrip(once));
        expect(twice).toBe(once);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('paragraphs with inline marks (R19)', () => {
    fc.assert(
      fc.property(paragraphWithMarks, (md) => {
        const once = normalize(mdRoundTrip(md));
        const twice = normalize(mdRoundTrip(once));
        expect(twice).toBe(once);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('headings with inline marks', () => {
    fc.assert(
      fc.property(headingWithMarks, (md) => {
        const once = normalize(mdRoundTrip(md));
        const twice = normalize(mdRoundTrip(once));
        expect(twice).toBe(once);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
