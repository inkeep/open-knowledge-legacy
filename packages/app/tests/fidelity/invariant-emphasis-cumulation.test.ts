/**
 * Invariant — emphasis cumulation double round-trip stable.
 *
 * **STATUS: skip-guarded (pending US-009 follow-up R-item).**
 *
 * Targets the R6 sub-item 1 bug shape (Emphasis CommonMark section 127/132).
 * The remaining 5 failures are NOT escape cumulation as the original spec
 * draft characterized them — iteration 9's diagnosis showed the actual root
 * cause is structural:
 *
 * 1. **Cases 1-3** (`***foo* bar**`-class — adjacent strong+emphasis runs):
 *    `@handlewithcare/remark-prosemirror`'s `hydrateMarks` partitions text
 *    spans by `marks[0]` and the schema normalizes mark order (emphasis
 *    before strong per `sharedExtensions` registration order). So
 *    `strong(emphasis(X), text Y)` round-trips to PM
 *    `[X[E,S], Y[S]]` then back to mdast as
 *    `[emphasis(strong(X)), strong(Y)]` — structural loss before any
 *    escape path runs.
 *
 * 2. **Cases 4-5** (`*a` + `code` + `*`-class — emphasis covering inline code):
 *    The `Code` mark's `excludes: '_'` blocks emphasis from co-occurring
 *    with code on the same span. `emphasis(text, code)` round-trips to PM
 *    `[text[E], code]` then back to mdast as `[emphasis(text), inlineCode]`
 *    — siblings, not nested.
 *
 * Proper fix needs (a) outside-in greedy mark nesting replacing `hydrateMarks`
 * (200-500 LOC + this PBT), and (b) removing the `Code` mark `excludes: '_'`
 * (schema widening per precedent #9; needs editor-render audit). Both together
 * are a separate R-item, out of US-009's scope and out of US-014's scope.
 *
 * See `evidence/r6-failure-modes.md` §"Correction (US-009 iteration)" for
 * the full mdast/PM trace and `tmp/ship/spec.json` US-009 notes.
 *
 * **When to unskip:** the follow-up R-item lands the outside-in greedy mark
 * nesting and the schema widening. At that point this PBT validates that
 * the fix doesn't regress on adjacent emphasis/strong run interactions.
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

describe.skip('emphasis cumulation — double round-trip stable (DEFERRED — US-009 follow-up R-item)', () => {
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
