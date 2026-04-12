/**
 * Invariant I1 — Identity: serialize(parse(md)) === md for supported constructs.
 *
 * Uses PBT with structured markdown generators. Generated markdown is
 * canonical (no exotic syntax), so round-trip should be byte-identical.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import {
  blockquote,
  bulletList,
  codeBlock,
  heading,
  orderedList,
  paragraph,
  paragraphWithFidelityChars,
  paragraphWithMarks,
} from './arbitraries';
import { mdRoundTrip, NUM_RUNS, normalize } from './helpers';

describe('I1 — identity: serialize(parse(md)) === md', () => {
  test('heading', () => {
    fc.assert(
      fc.property(heading, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('paragraph', () => {
    fc.assert(
      fc.property(paragraph, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('paragraph with fidelity chars (& < >)', () => {
    fc.assert(
      fc.property(paragraphWithFidelityChars, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('code block', () => {
    fc.assert(
      fc.property(codeBlock, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('blockquote', () => {
    fc.assert(
      fc.property(blockquote, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('bullet list', () => {
    fc.assert(
      fc.property(bulletList, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('ordered list', () => {
    fc.assert(
      fc.property(orderedList, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('paragraph with inline marks (R19)', () => {
    fc.assert(
      fc.property(paragraphWithMarks, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
