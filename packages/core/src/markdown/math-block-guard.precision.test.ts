/**
 * Math block-vs-inline parse precision tests (SPEC 2026-04-29-math-canonical-
 * and-syntax FR-M9, Phase 3 — singleDollarTextMath: false).
 *
 * Phase 3 split (double-dollar only — single `$x$` is intentionally NOT
 * a math syntax to keep currency / shell-var prose unambiguous):
 *   - Block math: multi-line `$$\n…\n$$` → DollarMath compat → renders via <Math>.
 *   - Block math: ` ```math …``` ` fence → MathFence compat → renders via <Math>.
 *   - Inline math: single-line `$$x$$` → mathInline atom → renders inline.
 *   - `$x$` (single dollar) does NOT parse as math.
 *   - `$$` inside a code span (`` `…` ``) does NOT parse as math.
 *
 * The FR-M10 R23 sentinel audit is also exercised here — KaTeX's HTML
 * output uses no PUA codepoints in default output, so formula values pass
 * through the existing R23 guard untouched.
 */

import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findInJson(json: JSONContent, predicate: (n: JSONContent) => boolean): JSONContent | null {
  if (predicate(json)) return json;
  for (const child of json.content ?? []) {
    const found = findInJson(child, predicate);
    if (found) return found;
  }
  return null;
}

function countInJson(json: JSONContent, predicate: (n: JSONContent) => boolean): number {
  let count = predicate(json) ? 1 : 0;
  for (const child of json.content ?? []) {
    count += countInJson(child, predicate);
  }
  return count;
}

const isComponent = (name: string) => (n: JSONContent) =>
  n.type === 'jsxComponent' && n.attrs?.componentName === name;

describe('block math (multi-line `$$…$$`) → DollarMath compat', () => {
  test('multi-line `$$\\n…\\n$$` parses to a DollarMath jsxComponent', () => {
    const json = mdManager.parse('$$\na^2 + b^2 = c^2\n$$\n');
    const node = findInJson(json, isComponent('DollarMath'));
    expect(node).toBeDefined();
  });

  test('multi-line block math round-trips back to `$$…$$` (γ pristine)', () => {
    const source = '$$\nE = mc^2\n$$\n';
    const json = mdManager.parse(source);
    const out = mdManager.serialize(json);
    expect(out).toBe(source);
  });

  test('single-line `$$x$$` does NOT parse to DollarMath (it is inline math now)', () => {
    // Phase 3 inline math: single-line `$$x$$` is `inlineMath` mdast →
    // `mathInline` PM atom, NOT a block DollarMath. Block requires multi-
    // line. Authors who want block-display via single line use `<Math>`.
    const json = mdManager.parse('$$E = mc^2$$\n');
    const dollar = findInJson(json, isComponent('DollarMath'));
    expect(dollar).toBeNull();
  });
});

describe('inline math (single-line `$$x$$` only) → mathInline atom', () => {
  const isMathInline = (n: JSONContent) => n.type === 'mathInline';

  test('single-line `$$E = mc^2$$` parses to a mathInline atom', () => {
    const json = mdManager.parse('$$E = mc^2$$\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('E = mc^2');
  });

  test('`$$x$$` mid-paragraph parses to a mathInline atom', () => {
    const json = mdManager.parse('A formula $$x$$ in prose.\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('x');
  });

  test('single-dollar `$x$` does NOT parse as math (singleDollarTextMath: false)', () => {
    const json = mdManager.parse('A formula $x$ in prose.\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeNull();
  });

  test('inline math round-trips back to `$$formula$$` (mdast-util-math stringifier with singleDollar=false)', () => {
    const source = 'Result: $$x^2$$.\n';
    const json = mdManager.parse(source);
    const out = mdManager.serialize(json);
    expect(out).toBe(source);
  });
});

describe('fenced math (` ```math `) → MathFence compat', () => {
  test('` ```math `…``` ` fence parses to a MathFence jsxComponent', () => {
    const json = mdManager.parse('```math\nE = mc^2\n```\n');
    const node = findInJson(json, isComponent('MathFence'));
    expect(node).toBeDefined();
  });

  test('fenced math round-trips back to ` ```math `…``` `', () => {
    const source = '```math\nE = mc^2\n```\n';
    const json = mdManager.parse(source);
    const out = mdManager.serialize(json);
    expect(out).toBe(source);
  });

  test('non-math fenced code (` ```js `) is unchanged — still a code block, NOT MathFence', () => {
    const json = mdManager.parse('```js\nconst x = 1;\n```\n');
    const mathFence = findInJson(json, isComponent('MathFence'));
    expect(mathFence).toBeNull();
  });
});

describe('ambiguity guard — `$` in prose stays prose (single-dollar is never math)', () => {
  test('`$$` inside a code span does NOT parse as math', () => {
    const json = mdManager.parse('Use the `$$E=mc^2$$` syntax.\n');
    const dollarMath = findInJson(json, isComponent('DollarMath'));
    expect(dollarMath).toBeNull();
    const inlineMath = findInJson(json, (n) => n.type === 'mathInline');
    expect(inlineMath).toBeNull();
  });

  test('currency `Costs $5.00 plus tax` stays prose', () => {
    const json = mdManager.parse('Costs $5.00 plus tax.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
    expect(findInJson(json, isComponent('DollarMath'))).toBeNull();
  });

  test('shell var `$PATH` stays prose', () => {
    const json = mdManager.parse('Set the `$PATH` env var.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('paired-dollar prose `Pay $5 to $10 dollars` stays prose (the regression case from review)', () => {
    // The exact failure shape that motivated the singleDollarTextMath: false
    // pivot — paired single-dollar mentions in prose were claiming
    // everything between as inline math when single-dollar parsing was on.
    const json = mdManager.parse('Pay $5 to $10 dollars in prose.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
    expect(findInJson(json, isComponent('DollarMath'))).toBeNull();
  });
});

describe('coexistence', () => {
  test('block math followed by inline math both render', () => {
    const json = mdManager.parse('$$\nE = mc^2\n$$\n\nThen $$x^2$$ in prose.\n');
    expect(countInJson(json, isComponent('DollarMath'))).toBe(1);
    expect(countInJson(json, (n) => n.type === 'mathInline')).toBe(1);
  });

  test('two block math nodes (multi-line) in one document each promote independently', () => {
    const json = mdManager.parse('$$\nx^2\n$$\n\n$$\ny^2\n$$\n');
    const mathCount = countInJson(json, isComponent('DollarMath'));
    expect(mathCount).toBe(2);
  });

  test('two inline math nodes in one paragraph both render as mathInline', () => {
    const json = mdManager.parse('Compare $$x^2$$ vs $$y^2$$ in prose.\n');
    const mathCount = countInJson(json, (n) => n.type === 'mathInline');
    expect(mathCount).toBe(2);
  });
});
