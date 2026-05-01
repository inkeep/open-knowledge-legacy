import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const altText = fc.array(safeWord, { minLength: 1, maxLength: 4 }).map((words) => words.join(' '));

const urlValue = fc.oneof(
  safeWord.map((s) => `https://example.com/${s}.png`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}(${b}).png`),
  fc
    .tuple(safeWord, safeWord, safeWord)
    .map(([a, b, c]) => `https://example.com/${a}(${b}(${c})).png`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}(${b}.png`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a})${b}.png`),
  safeWord.map((s) => `https://example.com/path\\${s}.png`),
  safeWord.map((s) => `/local/${s}.png`),
);

const imageArbitrary = fc.tuple(altText, urlValue).map(([alt, url]) => `![${alt}](${url})`);

const imageWithTitle = fc
  .tuple(altText, urlValue, safeWord)
  .map(([alt, url, title]) => `![${alt}](${url} "${title}")`);

const emptyAltImage = urlValue.map((url) => `![](${url})`);

describe('image edge — double round-trip stable (US-010 / R6c)', () => {
  test(
    'URL shapes: balanced / unbalanced parens, backslashes',
    () => {
      assertAcrossSeeds(
        fc.property(imageArbitrary, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'images with title (quoted)',
    () => {
      assertAcrossSeeds(
        fc.property(imageWithTitle, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'empty-alt images',
    () => {
      assertAcrossSeeds(
        fc.property(emptyAltImage, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
