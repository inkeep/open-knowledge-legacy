import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const safePhrase = fc
  .array(safeWord, { minLength: 1, maxLength: 4 })
  .map((words) => words.join(' '));

const recognizedHtmlBlock = fc.oneof(
  safePhrase.map((body) => `<div>${body}</div>`),
  safePhrase.map((body) => `<section>${body}</section>`),
  safePhrase.map((body) => `<article>${body}</article>`),
  safePhrase.map((body) => `<details><summary>S</summary>${body}</details>`),
  safePhrase.map((body) => `<!-- ${body} -->`),
  safePhrase.map((body) => `<![CDATA[${body}]]>`),
  fc.tuple(safeWord, safePhrase).map(([target, body]) => `<?${target} ${body}?>`),
  fc.constant('<DOCTYPE html>'),
  fc.constant('<!DOCTYPE html>'),
);

const htmlBlockWithFollowing = fc
  .tuple(recognizedHtmlBlock, safePhrase)
  .map(([html, para]) => `${html}\n\n${para}`);

const twoHtmlBlocks = fc
  .tuple(recognizedHtmlBlock, recognizedHtmlBlock)
  .map(([a, b]) => `${a}\n\n${b}`);

describe('HTML block edge — double round-trip stable (US-009 / R6a Finding 4)', () => {
  test(
    'recognized HTML block shapes (div / details / comment / CDATA / PI / DOCTYPE)',
    () => {
      assertAcrossSeeds(
        fc.property(recognizedHtmlBlock, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'HTML block followed by paragraph',
    () => {
      assertAcrossSeeds(
        fc.property(htmlBlockWithFollowing, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'two adjacent HTML blocks',
    () => {
      assertAcrossSeeds(
        fc.property(twoHtmlBlocks, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
