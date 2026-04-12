/**
 * GFM corpus test — round-trip stability on GFM extension examples.
 *
 * Phase 1 baseline: verifies crash-free round-trip and idempotence
 * for sections we fully support.
 */

import { describe, expect, test } from 'bun:test';
import gfmExamples from './fixtures/gfm-examples.json';
import { mdRoundTrip, normalize } from './helpers';

// Sections that normalize non-idempotently until Tier 2/3 features land
const NORMALIZE_SECTIONS = new Set(['Tables']);

describe('GFM corpus — round-trip stability', () => {
  for (let i = 0; i < gfmExamples.length; i++) {
    const example = gfmExamples[i];
    test(`[${example.section}] example ${i + 1}`, () => {
      const output1 = normalize(mdRoundTrip(example.markdown));

      if (!NORMALIZE_SECTIONS.has(example.section)) {
        const output2 = normalize(mdRoundTrip(output1));
        expect(output2).toBe(output1);
      }
    });
  }
});
