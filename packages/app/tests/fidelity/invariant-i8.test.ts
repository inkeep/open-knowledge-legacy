
import { describe, test } from 'bun:test';
import { VFileMessage } from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';
import { block } from './arbitraries';
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
      throw err; // Unexpected error type — test fails
    }
  }
}

const dangerousText = fc
  .array(
    fc.oneof(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;?!\n'),
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
      'text <foo bar',
      '<Component',
      '<',
      'a<b',
      'a<B>c<D',
      '<$special>',
      '<_private>',
      '<$',
      '<_',
      '</',
      '</foo',
      '</Callout',
      '<<<merge>>>',
      '<<<<<<< HEAD',
      '>>>>>>> main',
      '<script>alert(1)</script>',
      ':::note\nopen directive',
      '::leafDirective',
      '{',
      '{ ',
      'text {',
      '{ unclosed',
      'a{b',
      '{a',
      '{{',
      '{{{',
      '{a{b',
      '{a:b}',
      '{a b}',
      '{a;b}',
      '{if(x)y}',
      '{a {b}}',
      '{<>}',
      '{&}',
      '{*}',
      '{#}',
      '{expression}',
      '{/* comment */}',
      '{}',
      '~:a~',
      '*:a*',
      '---\n\n---',
      '---\n---',
      '< < < <',
      'a<b<c<d',
      'end of line <',
      '< start of line',
      'mid < dle',
      '<div',
      '<div class="x"',
      '<span style=',
      '**bold** and <foo unclosed',
      'if (x < y) { z > w }',
      'a < b && c > d',
      '<foo and {bar',
      '<Callout>{content}</Callout>',
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
