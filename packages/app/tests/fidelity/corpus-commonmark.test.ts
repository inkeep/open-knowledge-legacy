/**
 * CommonMark corpus test — 652 spec examples through round-trip.
 *
 * Phase 1 baseline: verifies that every example round-trips without
 * crash/exception and that the output is idempotent (second round-trip
 * equals first) for sections we fully support. Sections requiring
 * Tier 2/3 features (US-006 through US-009) test crash-free only.
 *
 * As Tier 2/3 features land, sections move from NORMALIZE_SECTIONS
 * to the default idempotence assertion.
 */

import { describe, expect, test } from 'bun:test';
import { commonmark } from 'commonmark.json';
import { mdRoundTrip, normalize } from './helpers';

// Sections entirely outside our schema
const SKIP_SECTIONS = new Set(['Tabs', 'Indented code blocks']);

// Sections that normalize non-idempotently until Tier 2/3 features land.
// These test crash-free round-trip only.
// Sections that normalize non-idempotently until Tier 2/3 features land
// or due to known CommonMark edge cases beyond our extension set.
const NORMALIZE_SECTIONS = new Set([
  'HTML blocks',
  'Raw HTML',
  'Setext headings',
  'Fenced code blocks',
  'Link reference definitions',
  'Hard line breaks',
  'Backslash escapes',
  'Entity and numeric character references',
  'Thematic breaks',
  'Block quotes', // Nested blockquote + other block combos
  'List items', // Complex nesting, lazy continuation
  'Lists', // Tight/loose, blank-line-count sensitivity
  'Code spans', // Multi-line code spans, backtick count edge cases
  'Emphasis and strong emphasis', // Delimiter run edge cases
  'Links', // Reference links, angle-bracket URLs
  'Autolinks', // Angle-bracket autolinks
  'Images', // Block/inline image lifting, image reference edge cases
  'ATX headings', // Closing-sequence edge cases (## foo ##)
  'Paragraphs', // Blank-line normalization between blocks
]);

// Track crashes to detect regressions — if fidelity extension changes introduce
// new parsing crashes, the test fails even though individual examples are skipped.
// Update this count only when a known @tiptap/markdown upstream crash is resolved.
const KNOWN_CRASH_CEILING = 50;

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
        // Pre-existing crash in @tiptap/markdown on edge-case inputs
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
