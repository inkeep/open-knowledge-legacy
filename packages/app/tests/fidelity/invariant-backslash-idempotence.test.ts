import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const safePhrase = fc
  .array(safeWord, { minLength: 1, maxLength: 3 })
  .map((words) => words.join(' '));

const entityName = fc.constantFrom('amp', 'lt', 'gt', 'quot', 'ouml', 'auml', 'uuml');

const bareEntityNamed = entityName.map((name) => `&${name};\n`);
const bareEntityDecimal = fc.integer({ min: 33, max: 126 }).map((cp) => `&#${cp};\n`);
const bareEntityHex = fc.integer({ min: 0x21, max: 0x7e }).map((cp) => `&#x${cp.toString(16)};\n`);

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

describe('backslash-escape-r23-pua-preservation — backslash-escape survival for R23-PUA chars', () => {
  test('escaped less-than `\\<` survives byte-identical round-trip', () => {
    const input = 'a \\<b\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test('escaped less-than at line start `\\<xyz` survives byte-identical round-trip', () => {
    const input = '\\<xyz\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test('multiple escaped `\\<` patterns in one paragraph survive byte-identical round-trip', () => {
    const input = 'compare \\<a\\> with \\<b\\>\n';
    expect(mdRoundTrip(input)).toBe(input);
  });
});

describe('G3 — bare HTML entity-ref preservation (FR-2)', () => {
  test('named entity ref `&amp;` survives byte-identical round-trip', () => {
    const input = 'Tom &amp; Jerry\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test('decimal numeric entity ref `&#65;` survives byte-identical round-trip', () => {
    const input = '&#65; is the letter A\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test('hex numeric entity ref `&#x41;` survives byte-identical round-trip', () => {
    const input = '&#x41; is the letter A\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test(
    'bare named entity refs survive byte-identical round-trip (PBT)',
    () => {
      assertAcrossSeeds(
        fc.property(bareEntityNamed, (md) => {
          expect(mdRoundTrip(md)).toBe(md);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'bare decimal numeric entity refs survive byte-identical round-trip (PBT)',
    () => {
      assertAcrossSeeds(
        fc.property(bareEntityDecimal, (md) => {
          expect(mdRoundTrip(md)).toBe(md);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'bare hex numeric entity refs survive byte-identical round-trip (PBT)',
    () => {
      assertAcrossSeeds(
        fc.property(bareEntityHex, (md) => {
          expect(mdRoundTrip(md)).toBe(md);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
