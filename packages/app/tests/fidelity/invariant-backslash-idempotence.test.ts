import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const safePhrase = fc
  .array(safeWord, { minLength: 1, maxLength: 3 })
  .map((words) => words.join(' '));

const entityName = fc.constantFrom('amp', 'lt', 'gt', 'quot', 'ouml', 'auml', 'uuml');

const backslashEntity = entityName.map((name) => `\\&${name};`);

const backslashAmpThenText = safeWord.map((word) => `\\&${word}`);

const backslashAtNonAmbiguousPositions = fc
  .tuple(safePhrase, fc.constantFrom('foo', 'bar', 'baz'))
  .map(([phrase, suffix]) => `${phrase} \\${suffix}`);

describe('backslash escape idempotence — double round-trip stable (R24)', () => {
  test(
    'backslash before named HTML entity reference',
    () => {
      assertAcrossSeeds(
        fc.property(backslashEntity, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'backslash + ampersand followed by entity-like text',
    () => {
      assertAcrossSeeds(
        fc.property(backslashAmpThenText, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'backslash at non-§2.4-ambiguous positions',
    () => {
      assertAcrossSeeds(
        fc.property(backslashAtNonAmbiguousPositions, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
