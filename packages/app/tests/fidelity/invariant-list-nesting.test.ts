import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const safePhrase = fc
  .array(safeWord, { minLength: 1, maxLength: 4 })
  .map((words) => words.join(' '));

const itemWithLeadingNonPara = fc.oneof(
  fc.tuple(safeWord, safePhrase).map(([lang, body]) => `\`\`\`${lang}\n${body}\n\`\`\``),
  fc.constantFrom('---', '***'),
  safePhrase.map((text) => `> ${text}`),
  fc
    .array(safePhrase, { minLength: 2, maxLength: 3 })
    .map((items) => items.map((it) => `- ${it}`).join('\n')),
);

const listWithLeadingNonParaItems = fc
  .array(
    fc.tuple(itemWithLeadingNonPara, safePhrase).map(([leading, para]) => {
      const indented = leading
        .split('\n')
        .map((l, i) => (i === 0 ? l : `  ${l}`))
        .join('\n');
      return `- ${indented}\n\n  ${para}`;
    }),
    { minLength: 1, maxLength: 3 },
  )
  .map((items) => items.join('\n\n'));

const mixedNestedList = fc.array(safePhrase, { minLength: 2, maxLength: 3 }).chain((parents) =>
  fc.array(safePhrase, { minLength: 2, maxLength: 3 }).map((children) => {
    const childItems = children.map((c) => `  - ${c}`).join('\n');
    return parents.map((p) => `- ${p}\n${childItems}`).join('\n');
  }),
);

const orderedListWithLeadingCode = fc
  .tuple(safeWord, safePhrase)
  .map(([body, tail]) => `1. \`\`\`\n   ${body}\n   \`\`\`\n\n   ${tail}\n`);

describe('list nesting — double round-trip stable (US-011 / R6d)', () => {
  test(
    'bullet list items with leading code/quote/thematicBreak/nested list',
    () => {
      assertAcrossSeeds(
        fc.property(listWithLeadingNonParaItems, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'mixed nested bullet + bullet (depth 2)',
    () => {
      assertAcrossSeeds(
        fc.property(mixedNestedList, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'ordered list with leading code block (CommonMark example 252 shape)',
    () => {
      assertAcrossSeeds(
        fc.property(orderedListWithLeadingCode, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});
