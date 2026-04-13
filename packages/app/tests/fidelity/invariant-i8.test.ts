/**
 * Invariant I8 — Crash resistance: parse() never throws unexpected errors.
 *
 * The pipeline's contract: parse() may throw SyntaxError for inputs
 * containing matched `{…}` with non-JavaScript content (remark-mdx/acorn
 * rejects them). Observer B catches these SyntaxErrors and keeps last valid
 * XmlFragment state — this is the correct behavior during live editing.
 *
 * What parse() must NEVER do:
 *   - Throw non-SyntaxError (TypeError, RangeError, etc.) — these indicate
 *     handler bugs, not transient parse noise
 *   - Crash on bare unmatched `<` or `{` — the R23 guard must protect these
 *
 * Added after the bare `<letter` regression (PR #95): files containing
 * `text <foo bar` (bare `<` + letter, no closing `>`) crashed remark-mdx.
 * Extended to cover bare `{` (same crash class — remark-mdx claims `{` as
 * JSX expression start, crashes on unclosed braces).
 */

import { describe, test } from 'bun:test';
import { VFileMessage } from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';
import { block } from './arbitraries';
import { mdManager, NUM_RUNS, PBT_TIMEOUT_MS } from './helpers';

/**
 * Check whether an error is an expected parse error.
 *
 * Three error types are expected for certain random inputs:
 *   - SyntaxError: from acorn when `{…}` content isn't valid JavaScript
 *   - VFileMessage: from remark-mdx when tag/expression syntax is malformed
 *   - RangeError "Invalid content for node": from ProseMirror when valid mdast
 *     maps to a PM structure that violates the schema (e.g., text directive
 *     inside strikethrough → inline jsxComponent in doc-level position)
 *
 * Observer B catches these and keeps last valid XmlFragment state.
 * Other error types (TypeError from null access, etc.) indicate handler bugs
 * and should fail the test.
 */
function isExpectedParseError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true;
  if (err instanceof VFileMessage) return true;
  if (err instanceof RangeError && err.message.includes('Invalid content for node')) return true;
  return false;
}

/**
 * Assert that parse() either succeeds or throws only expected parse errors.
 * Unexpected errors (TypeError, RangeError, etc.) cause the test to fail.
 */
function assertNoCrash(input: string): void {
  try {
    mdManager.parse(input);
  } catch (err) {
    if (!isExpectedParseError(err)) {
      throw err; // Unexpected error type — test fails
    }
  }
}

/** Generate strings that mix normal text with markdown/MDX syntax-trigger characters. */
const dangerousText = fc
  .array(
    fc.oneof(
      // Normal text chars (majority)
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;?!\n'),
      // Syntax-trigger chars (minority but always present)
      fc.constantFrom(...'<>&[]{}:@`#\\*_$~!/()'),
    ),
    { maxLength: 150 },
  )
  .map((chars) => chars.join(''));

describe('I8 — crash resistance: parse() never throws unexpected errors', () => {
  test(
    'arbitrary prose with dangerous characters',
    () => {
      fc.assert(
        fc.property(dangerousText, (s) => {
          assertNoCrash(s);
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'multi-block documents with dangerous chars adjacent to valid blocks',
    () => {
      fc.assert(
        fc.property(
          fc
            .tuple(dangerousText, block, dangerousText)
            .map(([pre, b, post]) => `${pre}\n\n${b}\n\n${post}`),
          (md) => {
            assertNoCrash(md);
          },
        ),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test('hardcoded regression cases — known-crashworthy inputs', () => {
    const mustNotCrash = [
      // Bare <letter (the PR #95 regression — R23 guard protects these)
      'text <foo bar',
      '<Component',
      '<',
      'a<b',
      'a<B>c<D',
      // remark-mdx also claims $ and _ after <
      '<$special>',
      '<_private>',
      '<$',
      '<_',
      // Incomplete close tags
      '</',
      '</foo',
      '</Callout',
      // Git merge markers
      '<<<merge>>>',
      '<<<<<<< HEAD',
      '>>>>>>> main',
      // XSS-shaped content
      '<script>alert(1)</script>',
      // Unclosed directives
      ':::note\nopen directive',
      '::leafDirective',
      // Bare unmatched { (R23 brace guard protects these)
      '{',
      '{ ',
      'text {',
      '{ unclosed',
      'a{b',
      '{a',
      // Consecutive/nested unmatched braces
      '{{',
      '{{{',
      '{a{b',
      // Matched braces with non-JS content — SyntaxError is EXPECTED
      // (Observer B catches and keeps last valid state)
      '{a:b}',
      '{a b}',
      '{a;b}',
      '{if(x)y}',
      '{a {b}}',
      '{<>}',
      '{&}',
      '{*}',
      '{#}',
      // Valid MDX expressions (should parse successfully)
      '{expression}',
      '{/* comment */}',
      '{}',
      // Text directive inside inline marks (PM schema gap — RangeError)
      '~:a~',
      '*:a*',
      // Empty frontmatter (NG11)
      '---\n\n---',
      '---\n---',
      // Multiple bare < in sequence
      '< < < <',
      'a<b<c<d',
      // Bare < at various positions
      'end of line <',
      '< start of line',
      'mid < dle',
      // Unclosed HTML
      '<div',
      '<div class="x"',
      '<span style=',
      // Mixed valid + invalid
      '**bold** and <foo unclosed',
      'if (x < y) { z > w }',
      'a < b && c > d',
      // Mixed bare < and {
      '<foo and {bar',
      '<Callout>{content}</Callout>',
      // Empty/whitespace
      '',
      ' ',
      '\n',
      '\n\n\n',
    ];

    for (const input of mustNotCrash) {
      assertNoCrash(input);
    }
  });
});
