import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const linkText = fc.array(safeWord, { minLength: 1, maxLength: 4 }).map((words) => words.join(' '));

const urlValue = fc.oneof(
  safeWord.map((s) => `https://example.com/${s}`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}(${b})`),
  fc.tuple(safeWord, safeWord, safeWord).map(([a, b, c]) => `https://example.com/${a}(${b}(${c}))`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}(${b}`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a})${b}`),
  safeWord.map((s) => `https://example.com/path\\${s}`),
  fc.tuple(safeWord, safeWord).map(([a, b]) => `https://example.com/${a}\\(${b}\\)`),
  safeWord.map((s) => `/local/${s}`),
);

const linkArbitrary = fc.tuple(linkText, urlValue).map(([text, url]) => `[${text}](${url})`);

const linkWithTitle = fc
  .tuple(linkText, urlValue, safeWord)
  .map(([text, url, title]) => `[${text}](${url} "${title}")`);

const emptyTextLink = urlValue.map((url) => `[](${url})`);

describe('link edge — double round-trip stable (US-010 / R6b)', () => {
  test(
    'URL shapes: balanced / unbalanced parens, backslashes',
    () => {
      assertAcrossSeeds(
        fc.property(linkArbitrary, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'links with title (quoted)',
    () => {
      assertAcrossSeeds(
        fc.property(linkWithTitle, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'empty-text links',
    () => {
      assertAcrossSeeds(
        fc.property(emptyTextLink, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
