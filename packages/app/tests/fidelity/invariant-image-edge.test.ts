/**
 * Invariant — image edge double round-trip stable.
 *
 * Targets the US-010 / R6c fix: the default `mdast-util-to-markdown` image
 * handler escaped literal `<` in URL values to `\<` even when those chars
 * came from R23-PUA-restored angle-bracket URL forms, compounding on round-
 * trip. The fix is the custom `image` handler in `to-markdown-handlers.ts`
 * which routes the URL through `formatLinkUrl` (same as link), ensuring
 * destination form is byte-stable regardless of URL content.
 *
 * After the fix, all 22/22 CommonMark image examples are idempotent. This
 * PBT extends coverage to URL shapes mirroring `invariant-link-edge.test.ts`.
 *
 * Notes on excluded shapes (would test other follow-up R-items, not US-010):
 * - Alt text containing literal `<` exercises the same R23 angle-protector
 *   escape-unawareness as link-edge URLs containing `<`. The bug shape is:
 *   alt `a<b` parses correctly to `a<b`, but on round-trip becomes `a\<b`
 *   in PM, then `a\\<b` on serialize, then `a\\\<b`, etc. (verified in
 *   iteration 14 probe). Out of scope for this PBT — same follow-up R-item
 *   as US-010 spec.json notes call out.
 *
 * Tier-2 1K samples; tier-3 10K via `STRESS_FIDELITY=1`.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const altText = fc.array(safeWord, { minLength: 1, maxLength: 4 }).map((words) => words.join(' '));

/**
 * URL shapes that exercise the formatLinkUrl decision tree (mirror link-edge).
 *
 * Same constraints as link-edge: no literal `<`/`>` (separate R-item), no
 * literal whitespace in URL bodies (spec-invalid).
 */
const urlValue = fc.oneof(
  safeWord.map((s) => `https://example.com/${s}.png`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}(${b}).png`),
  fc
    .tuple(safeWord, safeWord, safeWord)
    .map(([a, b, c]) => `https://example.com/${a}(${b}(${c})).png`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}(${b}.png`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a})${b}.png`),
  safeWord.map((s) => `https://example.com/path\\${s}.png`),
  safeWord.map((s) => `/local/${s}.png`),
);

const imageArbitrary = fc.tuple(altText, urlValue).map(([alt, url]) => `![${alt}](${url})`);

const imageWithTitle = fc
  .tuple(altText, urlValue, safeWord)
  .map(([alt, url, title]) => `![${alt}](${url} "${title}")`);

/** Empty alt — exercises CommonMark's `![](url)` form. */
const emptyAltImage = urlValue.map((url) => `![](${url})`);

describe('image edge — double round-trip stable (US-010 / R6c)', () => {
  test(
    'URL shapes: balanced / unbalanced parens, backslashes',
    () => {
      assertAcrossSeeds(
        fc.property(imageArbitrary, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'images with title (quoted)',
    () => {
      assertAcrossSeeds(
        fc.property(imageWithTitle, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'empty-alt images',
    () => {
      assertAcrossSeeds(
        fc.property(emptyAltImage, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
