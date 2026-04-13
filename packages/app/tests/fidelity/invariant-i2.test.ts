/**
 * Invariant I2 — Character preservation: every literal char in input
 * appears literally in the output. No HTML entity encoding.
 *
 * Specifically tests that & < > are NOT entity-encoded to &amp; &lt; &gt;.
 * Also tests R20: link URLs with & preserved.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { paragraphWithFidelityChars } from './arbitraries';
import { mdRoundTrip, NUM_RUNS } from './helpers';

describe('I2 — character preservation: no entity encoding', () => {
  test('& < > in paragraphs are literal in output', () => {
    fc.assert(
      fc.property(paragraphWithFidelityChars, (md) => {
        const output = mdRoundTrip(md);
        // No HTML entity encoding
        expect(output).not.toContain('&amp;');
        expect(output).not.toContain('&lt;');
        expect(output).not.toContain('&gt;');
        // Original chars preserved
        if (md.includes('&')) expect(output).toContain('&');
        if (md.includes('<')) expect(output).toContain('<');
        if (md.includes('>')) expect(output).toContain('>');
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('link URL with & (R20)', () => {
    const input = '[text](https://example.com?a=1&b=2)\n';
    const output = mdRoundTrip(input);
    expect(output).toContain('a=1&b=2');
    expect(output).not.toContain('&amp;');
  });

  test('& in heading text', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.integer({ min: 1, max: 6 }), fc.constant('H&M Store')),
        ([level, text]) => {
          const md = `${'#'.repeat(level)} ${text}`;
          const output = mdRoundTrip(md);
          expect(output).toContain('H&M');
          expect(output).not.toContain('&amp;');
        },
      ),
      { numRuns: 6, seed: 42 },
    );
  });
});
