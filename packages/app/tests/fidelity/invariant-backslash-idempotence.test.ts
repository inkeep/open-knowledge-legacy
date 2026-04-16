/**
 * Invariant — backslash escape idempotence double round-trip stable.
 *
 * **STATUS: skip-guarded (pending US-009 follow-up R-item).**
 *
 * Targets the R6 sub-item 2 bug shape (Backslash escapes CommonMark section
 * 11/13). Iteration 9's diagnosis confirmed:
 *
 * 1. **Example 1** (`\&ouml;`-class — escaped HTML entity):
 *    `mdast-util-to-markdown`'s context-sensitive `unsafe` chars cause a
 *    backslash before an entity-like sequence to be added/removed inconsistently
 *    on round-trip. NG5-adjacent (entity-decode-on-parse + non-byte-identity).
 *
 * 2. **Example 2** (`\&` followed by entity-like text):
 *    HTML entity decoding on parse → on serialize, the resulting literal
 *    char is output without preserving the entity reference form (NG5
 *    documents this as irreducible). The leading `\` interaction is what
 *    breaks idempotence specifically.
 *
 * The US-009 brace-stack fix correctly handles all CommonMark §2.4
 * structurally-ambiguous chars (\\, *, _, #, <, >, {, }) via the `safeText`
 * idempotency invariant. The remaining 2 Backslash failures live OUTSIDE
 * §2.4's escapable set — they're context-sensitive serialize-time decisions
 * (entity-adjacent) that need a different fix.
 *
 * Proper fix needs a context-aware backslash policy in the text serialize
 * path that distinguishes "necessary escape" from "redundant escape" based
 * on the surrounding mdast context. Out of US-014's scope.
 *
 * See `evidence/r6-failure-modes.md` §"Correction (US-009 iteration)" for
 * the full trace and `tmp/ship/spec.json` US-009 notes.
 *
 * **When to unskip:** the follow-up R-item lands the context-aware backslash
 * policy. At that point this PBT validates the fix doesn't regress on
 * backslash-before-entity-like-sequence shapes.
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

/** A subset of CommonMark named entities — `&ouml;`, `&amp;`, etc. */
const entityName = fc.constantFrom('amp', 'lt', 'gt', 'quot', 'ouml', 'auml', 'uuml');

/**
 * `\&entity;` — backslash before a literal entity reference. Tests Example
 * 1's bug shape: backslash interaction with entity decoding on round-trip.
 */
const backslashEntity = entityName.map((name) => `\\&${name};`);

/**
 * `\&` followed by entity-like text. Tests Example 2's bug shape.
 */
const backslashAmpThenText = safeWord.map((word) => `\\&${word}`);

/** `\` + non-§2.4 chars at varying positions in a phrase. */
const backslashAtNonAmbiguousPositions = fc
  .tuple(safePhrase, fc.constantFrom('foo', 'bar', 'baz'))
  .map(([phrase, suffix]) => `${phrase} \\${suffix}`);

describe.skip('backslash escape idempotence — double round-trip stable (DEFERRED — US-009 follow-up R-item)', () => {
  test(
    'backslash before named HTML entity reference',
    () => {
      fc.assert(
        fc.property(backslashEntity, (md) => {
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
    'backslash + ampersand followed by entity-like text',
    () => {
      fc.assert(
        fc.property(backslashAmpThenText, (md) => {
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
    'backslash at non-§2.4-ambiguous positions',
    () => {
      fc.assert(
        fc.property(backslashAtNonAmbiguousPositions, (md) => {
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
