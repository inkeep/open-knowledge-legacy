/**
 * CommonMark corpus test — 652 spec examples through round-trip.
 *
 * Every example must round-trip without crash AND be idempotent
 * (`serialize(parse(serialize(parse(x)))) === serialize(parse(x))`)
 * for every section EXCEPT those listed in NORMALIZE_SECTIONS.
 *
 * US-012 (R5a) tightening: 17 of the original 19 NORMALIZE_SECTIONS
 * promoted to default idempotence assertion. KNOWN_CRASH_CEILING dropped
 * from 50 to 0 (actual crash count is 0 — verified by probe across full
 * 652-example corpus).
 *
 * Two sections remain in NORMALIZE_SECTIONS, blocked on a structural
 * mark-hydration issue documented in evidence/r6-failure-modes.md
 * §"Correction (US-009 iteration)". A separate R-item is required to
 * (a) replace `@handlewithcare/remark-prosemirror`'s order-based
 * `hydrateMarks` with outside-in greedy nesting, and (b) remove the
 * `excludes: '_'` constraint on the Code mark. Both are out of US-009's
 * scope; promoting these sections requires landing those changes first.
 */

import { describe, expect, test } from 'bun:test';
import { commonmark } from 'commonmark.json';
import { mdRoundTrip, normalize } from './helpers';

// Sections entirely outside our schema
const SKIP_SECTIONS = new Set(['Tabs', 'Indented code blocks']);

// Sections still failing idempotence on this corpus.
//
// Both blocked on the same structural root cause (PM mark hydration in
// `@handlewithcare/remark-prosemirror`'s `hydrateMarks` partitions by
// `marks[0]` and the schema-normalized order places emphasis before
// strong, producing `[emphasis(strong(X)), strong(Y)]` on round-trip
// instead of `strong(emphasis(X), Y)`). See evidence/r6-failure-modes.md.
//
// Pass rates as of US-012 landing:
//   - Backslash escapes: 11/13 (HTML entity decode + context-sensitive
//     unsafe-char escaping in mdast-util-to-markdown)
//   - Emphasis and strong emphasis: 127/132 (mark hydration + Code mark
//     `excludes: '_'`)
const NORMALIZE_SECTIONS = new Set(['Backslash escapes', 'Emphasis and strong emphasis']);

// Crash ceiling. Actual count: 0 (probed across full corpus 2026-04-16).
// Drop to 0 closes the silent-crash-tolerance hole. Any new crash will
// fail the dedicated assertion at the bottom of the suite.
const KNOWN_CRASH_CEILING = 0;

describe('CommonMark corpus — round-trip stability', () => {
  let idx = 0;
  let crashCount = 0;
  for (const example of commonmark) {
    if (SKIP_SECTIONS.has(example.section)) continue;
    idx++;

    test(`[${example.section}] example ${idx}`, () => {
      let output1: string;
      try {
        output1 = normalize(mdRoundTrip(example.markdown));
      } catch {
        // Pre-existing upstream parser crash on edge-case inputs
        // (e.g., empty list items). Tracked, not blocking.
        crashCount++;
        return;
      }

      if (!NORMALIZE_SECTIONS.has(example.section)) {
        // Idempotence: second round-trip must equal first
        const output2 = normalize(mdRoundTrip(output1));
        expect(output2).toBe(output1);
      }
    });
  }

  test('crash count does not exceed known ceiling', () => {
    expect(crashCount).toBeLessThanOrEqual(KNOWN_CRASH_CEILING);
  });
});
