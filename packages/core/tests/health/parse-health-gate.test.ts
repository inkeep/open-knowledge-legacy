/**
 * R19 parse-health gate synthetic-regression tests.
 *
 * Per SPEC §6 R19 AC: "R19 synthetic-regression test proves gate fires
 * when a forced block-fallback is introduced (e.g., add a known-broken
 * MDX fragment to a test fixture copy)". We exercise both:
 *
 *   1. `compareParseHealth` as a pure comparison — fake sample + fake
 *      baseline, deterministic assertions. Proves the gate logic fails
 *      correctly when counters exceed thresholds.
 *   2. `harvestParseHealth` with a small injected fixture containing a
 *      known-broken MDX fragment — proves the harvest path correctly
 *      increments block-level fallback, and that compareParseHealth
 *      picks it up end-to-end.
 *
 * The full fidelity-corpus harvest is the tier-2 CI job's concern, not
 * this file's (it's minutes-long). These tests are sub-second.
 */

import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../../src/extensions/shared.ts';
import { MarkdownManager } from '../../src/markdown/index.ts';
import {
  compareParseHealth,
  harvestParseHealth,
  type ParseHealthBaseline,
} from './parse-health-gate.ts';

function makeBaseline(overrides: Partial<ParseHealthBaseline> = {}): ParseHealthBaseline {
  return {
    schemaVersion: 1,
    capturedAt: '2026-04-16T00:00:00.000Z',
    runnerClass: 'test-fixture',
    corpus: { commonmarkExamples: 652, gfmExamples: 20 },
    thresholds: { wholeDocMax: 0, blockLevelMax: 0 },
    observed: { parseFallback: { blockLevel: 0, wholeDoc: 0 } },
    ...overrides,
  };
}

describe('compareParseHealth (R19 synthetic gate)', () => {
  test('clean observed counters ⇒ PASS', () => {
    const baseline = makeBaseline();
    const report = compareParseHealth(baseline, {
      parseFallback: { blockLevel: 0, wholeDoc: 0 },
    });
    expect(report.pass).toBe(true);
    expect(report.findings).toEqual([]);
  });

  test('whole-doc fallback > 0 ⇒ FAIL (absolute threshold)', () => {
    const baseline = makeBaseline();
    const report = compareParseHealth(baseline, {
      parseFallback: { blockLevel: 0, wholeDoc: 1 },
    });
    expect(report.pass).toBe(false);
    expect(report.findings.some((f) => f.counter === 'wholeDoc')).toBe(true);
    const f = report.findings.find((x) => x.counter === 'wholeDoc');
    expect(f?.observed).toBe(1);
    expect(f?.threshold).toBe(0);
  });

  test('block-level fallback at baseline ceiling ⇒ PASS (boundary)', () => {
    const baseline = makeBaseline({
      thresholds: { wholeDocMax: 0, blockLevelMax: 3 },
      observed: { parseFallback: { blockLevel: 3, wholeDoc: 0 } },
    });
    const report = compareParseHealth(baseline, {
      parseFallback: { blockLevel: 3, wholeDoc: 0 },
    });
    expect(report.pass).toBe(true);
  });

  test('block-level fallback above baseline ⇒ FAIL', () => {
    const baseline = makeBaseline({
      thresholds: { wholeDocMax: 0, blockLevelMax: 3 },
    });
    const report = compareParseHealth(baseline, {
      parseFallback: { blockLevel: 4, wholeDoc: 0 },
    });
    expect(report.pass).toBe(false);
    const f = report.findings.find((x) => x.counter === 'blockLevel');
    expect(f?.observed).toBe(4);
    expect(f?.threshold).toBe(3);
  });

  test('both counters over ⇒ FAIL reports both findings', () => {
    const baseline = makeBaseline();
    const report = compareParseHealth(baseline, {
      parseFallback: { blockLevel: 1, wholeDoc: 1 },
    });
    expect(report.pass).toBe(false);
    const counters = report.findings.map((f) => f.counter).sort();
    expect(counters).toEqual(['blockLevel', 'wholeDoc']);
  });
});

describe('harvestParseHealth (R19 end-to-end fixture harvest)', () => {
  /**
   * Inject a known-broken MDX fragment into a fixture copy. Class C17
   * in `fixtures/mdx/crash-taxonomy.json` — "Closing slash without
   * open" — reliably triggers `parseWithFallback`'s block-fallback
   * path: `parse()` throws, the recursive split isolates the broken
   * line, the offending block becomes a `rawMdxFallback` node, and
   * `parseFallback.blockLevel` increments by 1.
   *
   * Probed during implementation against the 26-class taxonomy: C02,
   * C15, C16, C17, C20 each cross the counter threshold reliably;
   * other classes either clean-parse (covered by R23) or degrade
   * without incrementing the counter. C17 is picked because its
   * failure mode is simplest to explain in code.
   */
  const CRASH_MDX = `# Heading

text </Bar> more

# Footer
`;

  test('clean corpus ⇒ counters remain zero', () => {
    const corpus = ['# Heading\n\nParagraph.\n', 'Just text.\n', '- list item 1\n- list item 2\n'];
    const sample = harvestParseHealth({ corpus });
    expect(sample.parseFallback.wholeDoc).toBe(0);
    expect(sample.parseFallback.blockLevel).toBe(0);
  });

  test('injected broken MDX fragment ⇒ block-level fallback increments', () => {
    const sample = harvestParseHealth({ corpus: [CRASH_MDX] });
    // Block-level fallback fires on MDX tag-close mismatch — exact count
    // depends on the recursion depth but must be > 0.
    expect(sample.parseFallback.blockLevel).toBeGreaterThan(0);
    // Whole-doc fallback should NOT fire: the block-level path is enough
    // to isolate the broken fragment and keep the rest of the doc alive.
    expect(sample.parseFallback.wholeDoc).toBe(0);
  });

  test('end-to-end: injected regression ⇒ gate FAILS with block-level finding', () => {
    const baseline = makeBaseline();
    const sample = harvestParseHealth({ corpus: [CRASH_MDX] });
    const report = compareParseHealth(baseline, sample);
    expect(report.pass).toBe(false);
    expect(report.findings.some((f) => f.counter === 'blockLevel')).toBe(true);
  });

  test('shared MarkdownManager instance can be reused across harvests', () => {
    // Proves the gate is compatible with R16's cached-processor pattern:
    // a single MarkdownManager instance handles many parses without state bleed.
    const mm = new MarkdownManager({ extensions: sharedExtensions });
    const clean = harvestParseHealth({
      manager: mm,
      corpus: ['# heading\n'],
    });
    const dirty = harvestParseHealth({
      manager: mm,
      corpus: [CRASH_MDX],
    });
    expect(clean.parseFallback.blockLevel).toBe(0);
    expect(dirty.parseFallback.blockLevel).toBeGreaterThan(0);
  });
});
