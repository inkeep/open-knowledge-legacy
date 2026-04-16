/**
 * Invariant — backslash escape idempotence double round-trip stable.
 *
 * **STATUS: enabled (US-017 / R24 unblocked this).**
 *
 * Targets the R6 sub-item 2 bug shape (Backslash escapes CommonMark section
 * that previously failed 2/13). Two structural fixes that landed in
 * US-017 (R24):
 *
 * 1. **Example 1** (`\&ouml;`-class — escaped HTML entity): `safeText` now
 *    runs an `escapeEntityAmpersands` pass that prepends `\` to any `&`
 *    followed by an entity-shaped tail (named, numeric, or hex). Source
 *    `\&ouml;` parses to text value `&ouml;`; on serialize the entity-tail
 *    detection emits `\&ouml;` instead of bare `&ouml;`, preserving the
 *    literal form on re-parse instead of decoding to `ö`.
 *
 * 2. **Example 0** (kitchen-sink `\!\"\#...\~` — every CommonMark §2.4 char
 *    escaped): `position-slice`'s `ESCAPABLE_CHARS` widened from a
 *    structurally-ambiguous-only subset to the full §2.4 set, plus a
 *    value-consistency guard for the R23-PUA-substitution edge case where
 *    `\<` in source becomes `\<PUA>` before parse and the `\` stays literal.
 *    Together, every source escape now produces a paired serialized escape
 *    (deterministic) instead of falling through to context-sensitive
 *    `state.safe` decisions.
 *
 * See `evidence/r6-failure-modes.md` §"R24 resolution" for the full trace.
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

describe('backslash escape idempotence — double round-trip stable (R24)', () => {
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
