/**
 * Invariant — link edge double round-trip stable.
 *
 * Targets the US-010 / R6b fix: links with parens / backslashes in the URL
 * value used to lose paren-escaping on parse and re-escape on re-serialize,
 * compounding the backslash count across round-trips. The fix is `formatLinkUrl`
 * in `to-markdown-handlers.ts` which picks literal-form output (verbatim if
 * parens balanced; otherwise escape-all-parens-and-backslashes for re-parse
 * safety).
 *
 * After the fix, all 90/90 CommonMark link examples are idempotent. This PBT
 * extends coverage to URL shapes containing balanced/unbalanced parens,
 * backslashes, and mixtures — the bug-shape per `evidence/r6-failure-modes.md`
 * Finding 5.
 *
 * Notes on excluded shapes (would test other follow-up R-items, not US-010):
 * - URLs containing literal `<` / `>` exercise R23's angle-protector escape-
 *   unawareness for `<` (same bug class as US-009 brace fix). Out of scope
 *   for this PBT.
 * - URLs with literal whitespace are spec-invalid (require %20 or angle form).
 *
 * Tier-2 1K samples; tier-3 10K via `STRESS_FIDELITY=1`.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const linkText = fc.array(safeWord, { minLength: 1, maxLength: 4 }).map((words) => words.join(' '));

/**
 * URL shapes that exercise the formatLinkUrl decision tree.
 *
 * - balanced(0): no parens
 * - balanced(N): N pairs of well-nested parens
 * - unbalancedOpen: one extra `(`
 * - unbalancedClose: one extra `)`
 * - withBackslashes: literal `\` chars in URL body (must double on re-serialize)
 */
const urlValue = fc.oneof(
  // No parens
  safeWord.map((s) => `https://example.com/${s}`),
  // Balanced single
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}(${b})`),
  // Balanced nested
  fc.tuple(safeWord, safeWord, safeWord).map(([a, b, c]) => `https://example.com/${a}(${b}(${c}))`),
  // Unbalanced opening
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}(${b}`),
  // Unbalanced closing
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a})${b}`),
  // Backslashes
  safeWord.map((s) => `https://example.com/path\\${s}`),
  // Backslashes + balanced parens
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}\\(${b}\\)`),
  // Path-only (no scheme)
  safeWord.map((s) => `/local/${s}`),
);

const linkArbitrary = fc.tuple(linkText, urlValue).map(([text, url]) => `[${text}](${url})`);

const linkWithTitle = fc
  .tuple(linkText, urlValue, safeWord)
  .map(([text, url, title]) => `[${text}](${url} "${title}")`);

/** Empty link text — exercises CommonMark's `[](url)` form. */
const emptyTextLink = urlValue.map((url) => `[](${url})`);

describe('link edge — double round-trip stable (US-010 / R6b)', () => {
  test(
    'URL shapes: balanced / unbalanced parens, backslashes',
    () => {
      assertAcrossSeeds(
        fc.property(linkArbitrary, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'links with title (quoted)',
    () => {
      assertAcrossSeeds(
        fc.property(linkWithTitle, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'empty-text links',
    () => {
      assertAcrossSeeds(
        fc.property(emptyTextLink, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
