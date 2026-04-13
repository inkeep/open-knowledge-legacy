/**
 * Invariant I9 — Guard completeness: protectFromMdx() eliminates all
 * crash-causing `<` and `{` patterns from the input.
 *
 * Stronger than I8: I8 tests that parse() doesn't throw unexpected errors.
 * I9 tests that the GUARD ITSELF is complete — after protection, remark-mdx
 * should never encounter an unmatched `<` or unclosed `{` that causes
 * "Unexpected end of file" errors.
 *
 * The only acceptable post-guard error is acorn rejecting matched `{…}` with
 * non-JS content ("Could not parse expression with acorn") — these have
 * properly matched braces that the brace guard correctly passes through.
 *
 * If I9 fails, the guard has a coverage gap. If I8 fails but I9 passes,
 * the issue is downstream of the guard (handler bug, schema gap, etc.).
 */

import { describe, test } from 'bun:test';
import { VFileMessage } from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
// Import the guard via relative path — workspace packages don't expose subpath exports
import { protectFromMdx } from '../../../../packages/core/src/markdown/autolink-void-html-guard.ts';
import { NUM_RUNS, PBT_TIMEOUT_MS } from './helpers';

/**
 * Parse with remark-parse + remark-mdx only (no PM conversion).
 * This isolates the guard test from downstream PM schema issues.
 */
function mdxParse(source: string): void {
  const processor = unified().use(remarkParse).use(remarkMdx);
  const tree = processor.parse(source);
  processor.runSync(tree);
}

/**
 * Errors that indicate a GUARD GAP — the guard should have prevented these.
 *
 * "Unexpected end of file in expression" → unclosed `{`
 * "Unexpected end of file before name"   → bare `</` or `<`
 * "Unexpected end of file in name"       → `<foo` unclosed
 * "Unexpected character"                 → `<50ms`-style bare `<`
 *
 * NOT a guard gap:
 * "Could not parse expression with acorn" → matched `{…}` with non-JS (expected)
 */
function isGuardGap(err: unknown): boolean {
  if (!(err instanceof VFileMessage) && !(err instanceof Error)) return false;
  const msg = (err as Error).message;
  if (msg.includes('Unexpected end of file')) return true;
  if (msg.includes('Unexpected character')) return true;
  return false;
}

/** Generate strings with high density of guard-triggering characters. */
const guardTriggerText = fc
  .array(
    fc.oneof(
      {
        weight: 3,
        arbitrary: fc.constantFrom(
          ...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n',
        ),
      },
      { weight: 2, arbitrary: fc.constantFrom(...'<>{}/') },
      { weight: 1, arbitrary: fc.constantFrom(...'[]()\\:@`#*_$~!&"\'=') },
      { weight: 1, arbitrary: fc.constant('\n\n') }, // paragraph break — exercises brace flush
    ),
    { maxLength: 200 },
  )
  .map((chars) => chars.join(''));

/** Generate strings that mix valid markdown constructs with dangerous chars. */
const mixedMarkdownDangerous = fc
  .array(
    fc.oneof(
      // Valid markdown fragments
      fc.constantFrom(
        '# Heading',
        '**bold**',
        '*italic*',
        '`code`',
        '> quote',
        '- item',
        '1. item',
        '---',
        '```\ncode\n```',
        '<https://url>',
        '[[WikiLink]]',
        '<br>',
        '<div>x</div>',
        '<Callout>body</Callout>',
        '<Icon />',
        '<!-- comment -->',
        '{expression}',
        '{/* comment */}',
        ':::note\ncontent\n:::',
      ),
      // Dangerous fragments
      fc.constantFrom(
        '<',
        '< ',
        '<foo',
        '<foo bar',
        '{',
        '{ ',
        '{{',
        '{a',
        '</',
        '</foo',
        '<Component',
        '<$',
        '<_',
        '<<<',
        'a<b',
        'text {unclosed',
        '<50ms',
      ),
      // Random text with trigger chars
      guardTriggerText.map((s) => s.slice(0, 40)),
    ),
    { minLength: 1, maxLength: 8 },
  )
  .map((parts) => parts.join('\n\n'));

describe('I9 — guard completeness: protectFromMdx() eliminates crash patterns', () => {
  test(
    'protected output never causes "Unexpected end of file" in remark-mdx',
    () => {
      fc.assert(
        fc.property(guardTriggerText, (s) => {
          const protected_ = protectFromMdx(s);
          try {
            mdxParse(protected_);
          } catch (err) {
            if (isGuardGap(err)) {
              throw new Error(
                `Guard gap: protectFromMdx() failed to protect input.\n` +
                  `Input: ${JSON.stringify(s.slice(0, 100))}\n` +
                  `Protected: ${JSON.stringify(protected_.slice(0, 100))}\n` +
                  `Error: ${(err as Error).message}`,
              );
            }
            // Non-gap errors (acorn, etc.) are acceptable
          }
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'mixed valid markdown + dangerous chars — guard still complete',
    () => {
      fc.assert(
        fc.property(mixedMarkdownDangerous, (s) => {
          const protected_ = protectFromMdx(s);
          try {
            mdxParse(protected_);
          } catch (err) {
            if (isGuardGap(err)) {
              throw new Error(
                `Guard gap on mixed input.\n` +
                  `Input: ${JSON.stringify(s.slice(0, 200))}\n` +
                  `Error: ${(err as Error).message}`,
              );
            }
          }
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'multi-seed coverage (5 seeds)',
    () => {
      for (const seed of [42, 137, 2718, 31415, 99991]) {
        fc.assert(
          fc.property(guardTriggerText, (s) => {
            const protected_ = protectFromMdx(s);
            try {
              mdxParse(protected_);
            } catch (err) {
              if (isGuardGap(err)) {
                throw new Error(
                  `Guard gap (seed ${seed}).\n` +
                    `Input: ${JSON.stringify(s.slice(0, 100))}\n` +
                    `Error: ${(err as Error).message}`,
                );
              }
            }
          }),
          { numRuns: Math.floor(NUM_RUNS / 5), seed },
        );
      }
    },
    PBT_TIMEOUT_MS,
  );
});
