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

  test('single-dollar `$x$` parses as math (D-M5b heuristic)', () => {
    const json = mdManager.parse('A formula $x$ in prose.\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('x');
  });

  test('paired-double `$$x^2$$` round-trips byte-identical', () => {
    const source = 'Result: $$x^2$$.\n';
    const json = mdManager.parse(source);
    const out = mdManager.serialize(json);
    expect(out).toBe(source);
  });

  test('single-dollar `$x^2$` normalizes to `$$x^2$$` on serialize (D-M5b normalization)', () => {
    const source = 'Result: $x^2$.\n';
    const json = mdManager.parse(source);
    const out = mdManager.serialize(json);
    expect(out).toBe('Result: $$x^2$$.\n');
  });

  test('`<InlineMath formula="x" id="eq-1" />` round-trips byte-identical (id-bearing JSX form)', () => {
    const source = 'Result: <InlineMath formula="x^2" id="eq-1" />\n';
    const json = mdManager.parse(source);
    const node = findInJson(json, (n) => n.type === 'mathInline');
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('x^2');
    expect(node?.attrs?.id).toBe('eq-1');
    const out = mdManager.serialize(json);
    expect(out).toBe(source);
  });

  test('`<InlineMath formula="x" />` without id serializes to `$$x$$` (bare-formula branch)', () => {
    const source = 'Result: <InlineMath formula="x^2" />.\n';
    const json = mdManager.parse(source);
    const node = findInJson(json, (n) => n.type === 'mathInline');
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('x^2');
    const out = mdManager.serialize(json);
    expect(out).toContain('$$x^2$$');
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

describe('D-M5b heuristic — `$…$` ambiguity guard (currency-safe)', () => {
  test('`$$` inside a code span does NOT parse as math', () => {
    const json = mdManager.parse('Use the `$$E=mc^2$$` syntax.\n');
    const dollarMath = findInJson(json, isComponent('DollarMath'));
    expect(dollarMath).toBeNull();
    const inlineMath = findInJson(json, (n) => n.type === 'mathInline');
    expect(inlineMath).toBeNull();
  });

  test('`$x$` inside a code span does NOT parse as math', () => {
    const json = mdManager.parse('Inline `$x$` in code.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('currency `Costs $5.00 plus tax` stays prose (no closing $ on line)', () => {
    const json = mdManager.parse('Costs $5.00 plus tax.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('shell var `$PATH` stays prose', () => {
    const json = mdManager.parse('Set $PATH and try again.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('paired-dollar prose `Pay $5 to $10 dollars` stays prose (the regression case)', () => {
    const json = mdManager.parse('Pay $5 to $10 dollars in prose.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('two currency mentions on same line stay prose', () => {
    const json = mdManager.parse('Tickets cost $20 or $30 each.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('opening `$` followed by space `$ x$` stays prose (rule 1)', () => {
    const json = mdManager.parse('Bad $ x$ syntax.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('closing `$` preceded by space `$x $` stays prose (rule 3)', () => {
    const json = mdManager.parse('Bad $x $ syntax.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('digit-after-close `$x$5` stays prose (rule 4, currency carve-out)', () => {
    const json = mdManager.parse('Item $x$5 listed.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });

  test('`$` with newline between stays prose (rule 2, same-line requirement)', () => {
    const json = mdManager.parse('First $x\nthen $y in next line.\n');
    expect(findInJson(json, (n) => n.type === 'mathInline')).toBeNull();
  });
});

describe('D-M5b heuristic — single-dollar acceptance', () => {
  const isMathInline = (n: JSONContent) => n.type === 'mathInline';

  test('basic `$x$` mid-paragraph', () => {
    const json = mdManager.parse('A formula $x$ here.\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('x');
  });

  test('multi-character formula `$E = mc^2$`', () => {
    const json = mdManager.parse('Famously $E = mc^2$ from Einstein.\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('E = mc^2');
  });

  test('LaTeX with super/subscript `$x^2 + y_1$`', () => {
    const json = mdManager.parse('Pythagoras: $x^2 + y_1$ here.\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('x^2 + y_1');
  });

  test('two `$x$ … $y$` matches in one paragraph each promote independently', () => {
    const json = mdManager.parse('Both $x$ and $y$ are variables.\n');
    const count = countInJson(json, isMathInline);
    expect(count).toBe(2);
  });

  test('`$x$` at start of paragraph', () => {
    const json = mdManager.parse('$x$ is a variable.\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('x');
  });

  test('`$x$` at end of paragraph followed by punctuation', () => {
    const json = mdManager.parse('We define $x$.\n');
    const node = findInJson(json, isMathInline);
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('x');
  });

  test('paired-double `$$x$$` continues to work alongside single-dollar', () => {
    const json = mdManager.parse('Single $x$ vs paired $$y$$ in prose.\n');
    const count = countInJson(json, isMathInline);
    expect(count).toBe(2);
  });

  test('known edge: `Cost $5$ each` matches as math (Obsidian-parity edge)', () => {
    const json = mdManager.parse('Cost $5$ each.\n');
    const node = findInJson(json, (n) => n.type === 'mathInline');
    expect(node).toBeDefined();
    expect(node?.attrs?.formula).toBe('5');
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
