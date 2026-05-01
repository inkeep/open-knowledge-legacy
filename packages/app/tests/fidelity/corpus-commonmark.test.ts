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
