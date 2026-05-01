import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import {
  blockquote,
  bulletList,
  bulletListPlus,
  bulletListStar,
  codeBlock,
  codeBlockTilde,
  hardBreakBackslash,
  hardBreakSpaces,
  heading,
  htmlBlock,
  linkRefDef,
  orderedList,
  orderedListParen,
  paragraph,
  paragraphWithFidelityChars,
  paragraphWithMarks,
  setextH1,
  setextH2,
  thematicBreakStar,
  thematicBreakUnderscore,
} from './arbitraries';
import { mdRoundTrip, NUM_RUNS, normalize } from './helpers';

describe('I1 — identity: serialize(parse(md)) === md', () => {
  test('heading', () => {
    fc.assert(
      fc.property(heading, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('paragraph', () => {
    fc.assert(
      fc.property(paragraph, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('paragraph with fidelity chars (& < >)', () => {
    fc.assert(
      fc.property(paragraphWithFidelityChars, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('code block', () => {
    fc.assert(
      fc.property(codeBlock, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('blockquote', () => {
    fc.assert(
      fc.property(blockquote, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('bullet list', () => {
    fc.assert(
      fc.property(bulletList, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('ordered list', () => {
    fc.assert(
      fc.property(orderedList, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('paragraph with inline marks (R19)', () => {
    fc.assert(
      fc.property(paragraphWithMarks, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('code block with tilde fence (~)', () => {
    fc.assert(
      fc.property(codeBlockTilde, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('bullet list with * marker', () => {
    fc.assert(
      fc.property(bulletListStar, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('bullet list with + marker', () => {
    fc.assert(
      fc.property(bulletListPlus, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('ordered list with ) delimiter', () => {
    fc.assert(
      fc.property(orderedListParen, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('thematic break with ***', () => {
    fc.assert(
      fc.property(thematicBreakStar, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('thematic break with ___', () => {
    fc.assert(
      fc.property(thematicBreakUnderscore, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('setext heading level 1 (= underline)', () => {
    fc.assert(
      fc.property(setextH1, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('setext heading level 2 (- underline)', () => {
    fc.assert(
      fc.property(setextH2, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('hard break with backslash', () => {
    fc.assert(
      fc.property(hardBreakBackslash, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('hard break with two spaces', () => {
    fc.assert(
      fc.property(hardBreakSpaces, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('HTML block', () => {
    fc.assert(
      fc.property(htmlBlock, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('link reference definition', () => {
    fc.assert(
      fc.property(linkRefDef, (md) => {
        expect(normalize(mdRoundTrip(md))).toBe(normalize(md));
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
