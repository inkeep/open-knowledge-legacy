/**
 * CommonMark corpus test — 652 spec examples through round-trip.
 *
 * Every example must round-trip without crash AND be idempotent
 * (`serialize(parse(serialize(parse(x)))) === serialize(parse(x))`)
 * for every section EXCEPT those listed in NORMALIZE_SECTIONS.
 *
 * US-012 (R5a) tightening: 17 of the original 19 NORMALIZE_SECTIONS
 * promoted to default idempotence assertion. KNOWN_CRASH_CEILING dropped
 * from 50 to 0 (actual crash count is 0).
 *
 * US-017 (R24) closure: the remaining 2 sections (Emphasis and strong
 * emphasis, Backslash escapes) promoted to idempotence after landing
 * (a) outside-in greedy mark hydration in the
 * `@handlewithcare/remark-prosemirror` patch, (b) removal of `excludes: '_'`
 * from the Code mark via `CodeMarkFidelity`, (c) full CommonMark §2.4
 * escapable-char tagging in position-slice + value-consistency guard for
 * R23-PUA interactions, and (d) entity-shaped `\&entity;` escape policy
 * in `safeText`. NORMALIZE_SECTIONS is now empty — the full 19-section
 * corpus asserts byte-identical idempotence on every example.
 */

import { describe, expect, test } from 'bun:test';
import { commonmark } from 'commonmark.json';
import { mdRoundTrip, normalize } from './helpers';

// Sections entirely outside our schema
const SKIP_SECTIONS = new Set(['Tabs', 'Indented code blocks']);

// US-017 (R24) landed — every formerly-NORMALIZE section now passes
// idempotence. Set kept for forward extensibility (a future spec section
// added to the corpus that proves load-bearing-non-idempotent could be
// noted here with a citation), but currently empty by design.
const NORMALIZE_SECTIONS = new Set<string>();

// Zero-crash invariant: every example must round-trip without throwing.
// Per-example tests re-throw on parse/serialize failure so Bun reports
// the exact example that regressed; no describe-scope accumulator is
// involved, so the signal is order-independent and cannot be masked by
// an earlier-running ceiling assertion. (Prior to 2026-04-16 this was a
// `crashCount` counter + final ceiling test at 0; the counter-based
// pattern works today but made the "any crash fails" invariant depend
// on Bun running the ceiling test strictly after all generated tests.)

describe('CommonMark corpus — round-trip stability', () => {
  let idx = 0;
  for (const example of commonmark) {
    if (SKIP_SECTIONS.has(example.section)) continue;
    idx++;

    test(`[${example.section}] example ${idx}`, () => {
      // Re-throw on crash so the specific failing example is reported
      // with the original error. KNOWN_CRASH_CEILING effectively 0.
      const output1 = normalize(mdRoundTrip(example.markdown));

      if (!NORMALIZE_SECTIONS.has(example.section)) {
        // Idempotence: second round-trip must equal first
        const output2 = normalize(mdRoundTrip(output1));
        expect(output2).toBe(output1);
      }
    });
  }
});
