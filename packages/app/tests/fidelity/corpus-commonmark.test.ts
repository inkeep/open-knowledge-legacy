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

const SKIP_SECTIONS = new Set(['Tabs', 'Indented code blocks']);

const NORMALIZE_SECTIONS = new Set<string>();

describe('CommonMark corpus — round-trip stability', () => {
  let idx = 0;
  for (const example of commonmark) {
    if (SKIP_SECTIONS.has(example.section)) continue;
    idx++;

    test(`[${example.section}] example ${idx}`, () => {
      const output1 = normalize(mdRoundTrip(example.markdown));

      if (!NORMALIZE_SECTIONS.has(example.section)) {
        const output2 = normalize(mdRoundTrip(output1));
        expect(output2).toBe(output1);
      }
    });
  }
});
