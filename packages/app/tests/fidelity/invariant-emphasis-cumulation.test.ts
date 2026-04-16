/**
 * Invariant — emphasis cumulation double round-trip stable.
 *
 * **STATUS: enabled (US-017 / R24 unblocked this).**
 *
 * Targets the R6 sub-item 1 bug shape (Emphasis CommonMark section that
 * previously failed 5/132). The two structural fixes that landed in
 * US-017 (R24):
 *
 * 1. **Cases 1-3** (`***foo* bar**`-class — adjacent strong+emphasis runs):
 *    Replaced `@handlewithcare/remark-prosemirror`'s order-based
 *    `hydrateMarks` (partition by `marks[0]`) with an outside-in greedy
 *    intersection algorithm. Now `strong(emphasis(X), text Y)` round-trips
 *    PM `[X[E,S], Y[S]]` to mdast as `strong([emphasis(X), text(Y)])`
 *    (byte-identical to original). Implemented via extension to
 *    `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch`.
 *
 * 2. **Cases 4-5** (`*a` + `code` + `*`-class — emphasis covering inline code):
 *    Removed `excludes: '_'` from the `Code` mark via the new
 *    `CodeMarkFidelity` extension. Schema widening per precedent #9. Now
 *    `emphasis(text, code)` round-trips PM `[text[E], code[E]]` to mdast
 *    as `emphasis([text, inlineCode])` — wrapped, not siblings.
 *
 * See `evidence/r6-failure-modes.md` §"Correction (US-009 iteration)" +
 * §"R24 resolution" for the full trace.
 *
 * Tier-2 1K samples; tier-3 10K via `STRESS_FIDELITY=1`.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { mdRoundTrip, NUM_RUNS, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const safePhrase = fc
  .array(safeWord, { minLength: 1, maxLength: 3 })
  .map((words) => words.join(' '));

/**
 * Adjacent strong + emphasis combinations using `*` and `_` delimiters of
 * varying run lengths (1-3 chars). Mirrors the bug-shape on Cases 1-3.
 */
const adjacentMarkRuns = fc
  .tuple(fc.constantFrom('*', '_'), fc.integer({ min: 1, max: 3 }), safePhrase, safePhrase)
  .map(([delim, runLen, inner, outer]) => {
    const open = delim.repeat(runLen);
    const close = delim.repeat(runLen);
    return `${open}${inner}${delim}${outer}${close}`;
  });

/** Emphasis containing inline code (Cases 4-5). */
const emphasisWithCode = fc
  .tuple(safePhrase, safeWord)
  .map(([text, code]) => `*${text} \`${code}\` more*`);

describe('emphasis cumulation — double round-trip stable (R24)', () => {
  test(
    'adjacent strong + emphasis with delimiter run length variation',
    () => {
      fc.assert(
        fc.property(adjacentMarkRuns, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'emphasis containing inline code',
    () => {
      fc.assert(
        fc.property(emphasisWithCode, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );
});
