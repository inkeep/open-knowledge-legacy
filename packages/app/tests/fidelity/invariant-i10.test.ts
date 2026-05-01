import { describe, test } from 'bun:test';
import { VFileMessage } from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';
import {
  containerWithDangerous,
  deeplyNested,
  interleavedDoc,
  mdxWithDangerousContent,
  mixedInlineDangerous,
  truncatedConstruct,
  wrappedDangerous,
} from './arbitraries';
import { mdManager, NUM_RUNS, PBT_TIMEOUT_MS } from './helpers';

function isExpectedParseError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true;
  if (err instanceof VFileMessage) return true;
  if (err instanceof RangeError && err.message.includes('Invalid content for node')) return true;
  return false;
}

function assertNoCrash(input: string): void {
  try {
    mdManager.parse(input);
  } catch (err) {
    if (!isExpectedParseError(err)) {
      throw new Error(
        `Unexpected ${(err as Error).constructor.name}: ${(err as Error).message}\n` +
          `Input: ${JSON.stringify(input.slice(0, 200))}`,
      );
    }
  }
}

describe('I10 — structural crash resistance: nested/truncated/interleaved', () => {
  test(
    'dangerous chars inside marks (emphasis, strong, strikethrough, code)',
    () => {
      fc.assert(
        fc.property(wrappedDangerous, (s) => {
          assertNoCrash(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'mixed inline: valid content interleaved with dangerous fragments',
    () => {
      fc.assert(
        fc.property(mixedInlineDangerous, (s) => {
          assertNoCrash(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'containers (blockquote, list) with dangerous content',
    () => {
      fc.assert(
        fc.property(containerWithDangerous, (s) => {
          assertNoCrash(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'truncated constructs — half-typed JSX, unclosed fences, broken links',
    () => {
      fc.assert(
        fc.property(truncatedConstruct, (s) => {
          assertNoCrash(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'MDX components containing dangerous inline content',
    () => {
      fc.assert(
        fc.property(mdxWithDangerousContent, (s) => {
          assertNoCrash(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'interleaved documents — valid blocks mixed with truncated/dangerous ones',
    () => {
      fc.assert(
        fc.property(interleavedDoc, (s) => {
          assertNoCrash(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'deeply nested: blockquote > list > marks > dangerous chars',
    () => {
      fc.assert(
        fc.property(deeplyNested, (s) => {
          assertNoCrash(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test('hardcoded structural edge cases', () => {
    const cases = [
      '**text with <bare angle**',
      '*emphasis with {unclosed brace*',
      '~~strike with <br> inside~~',
      '`code with <angle>`',
      '**bold with [[WikiLink]] inside**',

      '# Heading\n\n<Callout>unclosed body',
      'Paragraph\n\n```js\nunclosed code',
      'Text\n\n:::note\nunclosed directive',
      'Normal text [broken link](https://',
      'Content [[broken wiki',

      '> blockquote with <bare angle',
      '> quote with {unclosed brace',
      '- list item with <br> and <bare',
      '1. ordered with {expr} and {broken',
      '> > double nested with <danger',

      '<Callout>\n\nContent with <br> and <bare\n\n</Callout>',
      '<Note>\n\n[[WikiLink]] and {expression}\n\n</Note>',
      '<Card>\n\n<https://autolink.com> text\n\n</Card>',

      '# Heading\n\n<bare angle\n\n**bold text**\n\n{unclosed',
      '```js\ncode\n```\n\n<Component\n\n- list item',
      '---\n\n<foo bar\n\n> quote',

      '> - **bold with <angle>**',
      '> - *italic [[Page]] and <bare*',
      '> 1. `code` and {brace} text',

      '<Callout>see <https://url></Callout>',
      '**[[Page|<alias>]]**',
      '> <https://autolink.com> and text',
      '- <Icon /> item with content',
      '`<not html>` in code span',

      '*italic **bold* text**',
      '**bold *italic** text*',
      '<div><span>nested</div></span>',
      '[[Page]] <br> {expr} in one line',
    ];

    for (const input of cases) {
      assertNoCrash(input);
    }
  });
});
