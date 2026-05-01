
import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const safePhrase = fc
  .array(safeWord, { minLength: 1, maxLength: 3 })
  .map((words) => words.join(' '));

const adjacentMarkRuns = fc
  .tuple(fc.constantFrom('*', '_'), fc.integer({ min: 1, max: 3 }), safePhrase, safePhrase)
  .map(([delim, runLen, inner, outer]) => {
    const open = delim.repeat(runLen);
    const close = delim.repeat(runLen);
    return `${open}${inner}${delim}${outer}${close}`;
  });

const emphasisWithCode = fc
  .tuple(safePhrase, safeWord)
  .map(([text, code]) => `*${text} \`${code}\` more*`);

describe('emphasis cumulation — double round-trip stable (R24)', () => {
  test(
    'adjacent strong + emphasis with delimiter run length variation',
    () => {
      assertAcrossSeeds(
        fc.property(adjacentMarkRuns, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'emphasis containing inline code',
    () => {
      assertAcrossSeeds(
        fc.property(emphasisWithCode, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
