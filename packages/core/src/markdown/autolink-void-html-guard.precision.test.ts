/**
 * Guard precision: protectFromMdx() does NOT modify valid MDX constructs.
 *
 * Dual coverage with I9 (guard completeness):
 *   I9:  guard catches ALL dangerous patterns (no false negatives)
 *   This: guard passes through ALL valid patterns (no false positives)
 *
 * A guard false positive = valid MDX incorrectly guarded → parsed as
 * plain text → broken round-trip. Found after the URL-in-attr regression:
 * `<Image src="https://url" />` was guarded because the stray-`/` check
 * matched `/` inside the quoted URL.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { protectFromMdx } from './autolink-void-html-guard.ts';

const safeWord = fc.stringMatching(/^[a-zA-Z]{2,8}$/);
const tagName = safeWord.map((w) => w.charAt(0).toUpperCase() + w.slice(1));

/** Generate valid self-closing JSX with various attribute patterns. */
const selfClosingJsx = fc.oneof(
  // No attrs: <Tag />
  tagName.map((name) => `<${name} />`),
  // String attr: <Tag attr="value" />
  fc.tuple(tagName, safeWord, safeWord).map(([name, attr, val]) => `<${name} ${attr}="${val}" />`),
  // URL attr: <Tag src="https://example.com/path?a=1&b=2" />
  fc
    .tuple(tagName, fc.constantFrom('src', 'href', 'url', 'data'))
    .map(([name, attr]) => `<${name} ${attr}="https://example.com/path/to/resource?a=1&b=2" />`),
  // Multiple attrs: <Tag a="1" b="2" />
  fc
    .tuple(tagName, safeWord, safeWord, safeWord, safeWord)
    .map(([name, a1, v1, a2, v2]) => `<${name} ${a1}="${v1}" ${a2}="${v2}" />`),
  // Expression attr: <Tag data={expression} />
  fc
    .tuple(tagName, safeWord, safeWord)
    .map(([name, attr, expr]) => `<${name} ${attr}={${expr}} />`),
);

/** Generate valid paired JSX. */
const pairedJsx = fc
  .tuple(tagName, safeWord)
  .map(([name, body]) => `<${name}>\n\n${body}\n\n</${name}>`);

/** Generate valid multi-line self-closing JSX. */
const multiLineSelfClosing = fc
  .tuple(tagName, safeWord, safeWord)
  .map(([name, attr, val]) => `<${name}\n  ${attr}="${val}"\n/>`);

const NUM_RUNS = process.env.STRESS_FIDELITY === '1' ? 10_000 : 1_000;
const TIMEOUT = process.env.STRESS_FIDELITY === '1' ? 90_000 : 30_000;

describe('Guard precision: valid MDX survives protectFromMdx() unchanged', () => {
  test(
    'self-closing JSX with attrs (including URLs) not guarded',
    () => {
      fc.assert(
        fc.property(selfClosingJsx, (mdx) => {
          const protected_ = protectFromMdx(mdx);
          // The opening < must NOT be replaced with PUA sentinel
          expect(protected_[0]).toBe('<');
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    TIMEOUT,
  );

  test(
    'paired JSX not guarded',
    () => {
      fc.assert(
        fc.property(pairedJsx, (mdx) => {
          const protected_ = protectFromMdx(mdx);
          expect(protected_[0]).toBe('<');
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    TIMEOUT,
  );

  test(
    'multi-line self-closing JSX not guarded',
    () => {
      fc.assert(
        fc.property(multiLineSelfClosing, (mdx) => {
          const protected_ = protectFromMdx(mdx);
          expect(protected_[0]).toBe('<');
        }),
        { numRuns: NUM_RUNS, seed: 42 },
      );
    },
    TIMEOUT,
  );

  test('hardcoded valid MDX patterns — none guarded', () => {
    const valid = [
      '<Callout>body text</Callout>',
      '<Note>text with **bold**</Note>',
      '<Icon />',
      '<Widget title="hello" />',
      '<Image src="https://example.com?a=1&b=2" />',
      '<Chart data="https://api.example.com/v1/data" />',
      '<Link href="/path/to/page" />',
      '<Widget\n  variant="large"\n/>',
      '<Widget\n  title="hello"\n  data="https://api.com/v1"\n/>',
      '<Callout type="warning">\n\nContent here\n\n</Callout>',
      '<Accordion title="First">\n\nContent\n\n</Accordion>',
    ];

    for (const mdx of valid) {
      const protected_ = protectFromMdx(mdx);
      expect(protected_[0]).toBe('<');
    }
  });
});
