/**
 * Invariant — list nesting double round-trip stable.
 *
 * Targets the US-011 / R6d fix: PM `listItem` schema is `paragraph block*`,
 * so when source mdast has a non-paragraph first child (code block, quote,
 * thematicBreak, nested list), `nodeType.createAndFill` synthesizes an
 * empty paragraph to satisfy validation. Without the artifact-strip in the
 * `listItem` PM→mdast handler, the synthetic paragraph propagated back to
 * mdast and serialized as `"1. \n\n   <indented-block>"` — which CommonMark
 * refuses as list continuation, so the block escapes the listItem on
 * re-parse → second round-trip flattens what the first round-trip nested.
 *
 * This PBT generates lists with various non-paragraph first children and
 * asserts double round-trip stability after first-pass normalization.
 *
 * Bug shape per `evidence/r6-failure-modes.md` Finding 3 + iteration 11
 * diagnosis (progress.txt). Fixed in `packages/core/src/markdown/index.ts`
 * `buildPmToMdastHandlers.listItem`.
 *
 * Tier-2 1K samples; tier-3 10K via `STRESS_FIDELITY=1`.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { mdRoundTrip, NUM_RUNS, normalize, PBT_TIMEOUT_MS } from './helpers';

const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const safePhrase = fc
  .array(safeWord, { minLength: 1, maxLength: 4 })
  .map((words) => words.join(' '));

/** A bullet list item whose first block is something OTHER than a paragraph. */
const itemWithLeadingNonPara = fc.oneof(
  // code block first
  fc.tuple(safeWord, safePhrase).map(([lang, body]) => `\`\`\`${lang}\n${body}\n\`\`\``),
  // thematicBreak first
  fc.constantFrom('---', '***'),
  // blockquote first
  safePhrase.map((text) => `> ${text}`),
  // nested unordered list first
  fc
    .array(safePhrase, { minLength: 2, maxLength: 3 })
    .map((items) => items.map((it) => `- ${it}`).join('\n')),
);

/**
 * One bullet list with N items, each containing an optional leading
 * non-paragraph block followed by a paragraph. Indented 3 spaces under
 * the list marker per CommonMark continuation rules.
 */
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

/** Mixed bullet/ordered nested. */
const mixedNestedList = fc.array(safePhrase, { minLength: 2, maxLength: 3 }).chain((parents) =>
  fc.array(safePhrase, { minLength: 2, maxLength: 3 }).map((children) => {
    const childItems = children.map((c) => `  - ${c}`).join('\n');
    return parents.map((p) => `- ${p}\n${childItems}`).join('\n');
  }),
);

/** Ordered list whose first item leads with a code block (CommonMark example 252). */
const orderedListWithLeadingCode = fc
  .tuple(safeWord, safePhrase)
  .map(([body, tail]) => `1. \`\`\`\n   ${body}\n   \`\`\`\n\n   ${tail}\n`);

describe('list nesting — double round-trip stable (US-011 / R6d)', () => {
  test(
    'bullet list items with leading code/quote/thematicBreak/nested list',
    () => {
      fc.assert(
        fc.property(listWithLeadingNonParaItems, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'mixed nested bullet + bullet (depth 2)',
    () => {
      fc.assert(
        fc.property(mixedNestedList, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'ordered list with leading code block (CommonMark example 252 shape)',
    () => {
      fc.assert(
        fc.property(orderedListWithLeadingCode, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );
});
