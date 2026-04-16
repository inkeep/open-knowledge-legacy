/**
 * Invariant — HTML block edge double round-trip stable.
 *
 * Targets the US-009 / R6a Finding 4 fix: the R23 brace-stack protector
 * had been escape-unaware for `{` / `}` (it PUA-substituted unconditionally
 * including `\{`), causing `safeText` non-idempotence on text runs that
 * contained braces — most visibly across HTML blocks containing CDATA-style
 * sequences and other non-recognized HTML tag shapes that fall through to
 * the text path.
 *
 * After the fix, all 44/44 CommonMark HTML block examples are idempotent.
 * This PBT extends coverage to structurally-similar shapes (comments, CDATA,
 * processing instructions, script/style/pre, doctype) that aren't enumerated
 * in the fixed CommonMark corpus.
 *
 * Bug shape per `evidence/r6-failure-modes.md` Finding 4 + iteration 9
 * progress notes. Fix landed in `packages/core/src/markdown/autolink-void-html-guard.ts`
 * brace-stack section.
 *
 * Tier-2 1K samples; tier-3 10K via `STRESS_FIDELITY=1`.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { mdRoundTrip, NUM_RUNS, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const safePhrase = fc
  .array(safeWord, { minLength: 1, maxLength: 4 })
  .map((words) => words.join(' '));

/**
 * Recognized HTML block shapes that CommonMark guarantees stable round-trip.
 *
 * Excludes: tags whose alt text or attribute values can contain braces or
 * angles — those would test the R23 angle-protector escape-unawareness which
 * is a separate follow-up R-item (see US-010 spec.json notes).
 */
const recognizedHtmlBlock = fc.oneof(
  // Block-level tags
  safePhrase.map((body) => `<div>${body}</div>`),
  safePhrase.map((body) => `<section>${body}</section>`),
  safePhrase.map((body) => `<article>${body}</article>`),
  safePhrase.map((body) => `<details><summary>S</summary>${body}</details>`),
  // HTML comments
  safePhrase.map((body) => `<!-- ${body} -->`),
  // CDATA — the historically-broken case (Finding 4)
  safePhrase.map((body) => `<![CDATA[${body}]]>`),
  // Processing instructions
  fc.tuple(safeWord, safePhrase).map(([target, body]) => `<?${target} ${body}?>`),
  // DOCTYPE
  fc.constant('<DOCTYPE html>'),
  fc.constant('<!DOCTYPE html>'),
);

/** HTML block followed by a paragraph — exercises block-boundary handling. */
const htmlBlockWithFollowing = fc
  .tuple(recognizedHtmlBlock, safePhrase)
  .map(([html, para]) => `${html}\n\n${para}`);

/** Two HTML blocks back-to-back. */
const twoHtmlBlocks = fc
  .tuple(recognizedHtmlBlock, recognizedHtmlBlock)
  .map(([a, b]) => `${a}\n\n${b}`);

describe('HTML block edge — double round-trip stable (US-009 / R6a Finding 4)', () => {
  test(
    'recognized HTML block shapes (div / details / comment / CDATA / PI / DOCTYPE)',
    () => {
      fc.assert(
        fc.property(recognizedHtmlBlock, (md) => {
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
    'HTML block followed by paragraph',
    () => {
      fc.assert(
        fc.property(htmlBlockWithFollowing, (md) => {
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
    'two adjacent HTML blocks',
    () => {
      fc.assert(
        fc.property(twoHtmlBlocks, (md) => {
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
