import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPrimitiveProps, stableHash } from './JsxComponentView.tsx';

/** Test helper: build a `ReadonlySet<string>` of reactnode-typed prop names.
 *  (In production the descriptor registry pre-computes this once at build
 *  time — see `packages/app/src/editor/registry/index.ts`.) */
function reactNodes(...names: string[]): ReadonlySet<string> {
  return new Set(names);
}

describe('extractPrimitiveProps', () => {
  test('passes through declared non-reactnode props', () => {
    const attrs = { props: { type: 'warning', title: 'Heads up' } };
    const result = extractPrimitiveProps(attrs, reactNodes());
    expect(result).toEqual({ type: 'warning', title: 'Heads up' });
  });

  test('excludes reactnode-typed prop names (content holes are NOT render-time props)', () => {
    const attrs = { props: { title: 'Hi', children: 'shouldnt be here' } };
    const result = extractPrimitiveProps(attrs, reactNodes('children'));
    expect(result).toEqual({ title: 'Hi' });
    expect(result).not.toHaveProperty('children');
  });

  test('REGRESSION: undeclared attrs pass through (e.g. InlineTOC items, TypeTable type)', () => {
    const attrs = {
      props: {
        items: [
          { title: 'Intro', url: '#intro', depth: 1 },
          { title: 'Usage', url: '#usage', depth: 2 },
        ],
      },
    };
    const result = extractPrimitiveProps(attrs, reactNodes('children'));

    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(2);
  });

  test('REGRESSION: preserves unknown attrs alongside declared ones (FR-21 merge symmetry)', () => {
    const attrs = {
      props: {
        title: 'Custom Card',
        description: 'With extras',
        color: '#F05032',
        external: true,
      },
    };
    const result = extractPrimitiveProps(attrs, reactNodes());
    expect(result).toEqual({
      title: 'Custom Card',
      description: 'With extras',
      color: '#F05032',
      external: true,
    });
  });

  test('handles empty props', () => {
    const result = extractPrimitiveProps({ props: {} }, reactNodes());
    expect(result).toEqual({});
  });

  test('handles missing props attr', () => {
    const result = extractPrimitiveProps({}, reactNodes());
    expect(result).toEqual({});
  });

  test('XSS: strips javascript: URL from href before it reaches live React', () => {
    const attrs = { props: { href: 'javascript:alert(1)', title: 'bad' } };
    const result = extractPrimitiveProps(attrs, reactNodes());
    expect(result.href).toBe('#');
    expect(result.title).toBe('bad');
  });

  test('XSS: drops dangerouslySetInnerHTML entirely', () => {
    const attrs = {
      props: {
        dangerouslySetInnerHTML: { __html: '<img src=x onerror=alert(1)>' },
        title: 'safe',
      },
    };
    const result = extractPrimitiveProps(attrs, reactNodes());
    expect(result).not.toHaveProperty('dangerouslySetInnerHTML');
    expect(result.title).toBe('safe');
  });

  test('XSS: drops every on* event-handler prop', () => {
    const attrs = {
      props: { onClick: 'alert(1)', onError: 'alert(2)', title: 'safe' },
    };
    const result = extractPrimitiveProps(attrs, reactNodes());
    expect(result).not.toHaveProperty('onClick');
    expect(result).not.toHaveProperty('onError');
    expect(result.title).toBe('safe');
  });

  test('XSS: sanitizes nested URLs inside array-of-objects (InlineTOC.items shape)', () => {
    const attrs = {
      props: {
        items: [
          { title: 'bad', url: 'javascript:alert(1)' },
          { title: 'good', url: 'https://ok.example.com' },
        ],
      },
    };
    const result = extractPrimitiveProps(attrs, reactNodes());
    const items = result.items as Array<{ title: string; url: string }>;
    expect(items[0].url).toBe('#');
    expect(items[1].url).toBe('https://ok.example.com');
  });

  test('XSS: drops style with url(javascript:…)', () => {
    const attrs = {
      props: { style: 'background: url(javascript:alert(1)); color: red' },
    };
    const result = extractPrimitiveProps(attrs, reactNodes());
    expect(result.style).toBe('');
  });
});

describe('stableHash', () => {
  test('key-order independence — primary load-bearing invariant', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    expect(stableHash({ type: 'warn', title: 'x' })).toBe(stableHash({ title: 'x', type: 'warn' }));
  });

  test('recurses into nested objects — inner key order also normalized', () => {
    expect(stableHash({ x: { b: 1, a: 2 } })).toBe(stableHash({ x: { a: 2, b: 1 } }));
  });

  test('arrays are order-sensitive — [1,2] and [2,1] hash distinctly', () => {
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
  });

  test('primitives and null round-trip via JSON.stringify', () => {
    expect(stableHash(null)).toBe('null');
    expect(stableHash(42)).toBe('42');
    expect(stableHash('hello')).toBe('"hello"');
    expect(stableHash(true)).toBe('true');
  });

  test('empty object + empty array + undefined have distinct hashes', () => {
    expect(stableHash({})).toBe('{}');
    expect(stableHash([])).toBe('[]');
    expect(stableHash(undefined)).toBe(JSON.stringify(undefined));
  });
});

const VIEW_FILE = join(dirname(fileURLToPath(import.meta.url)), 'JsxComponentView.tsx');
const KIND_GUARD_RE = /attrs\.kind\s*(?:!==|===)\s*['"]element['"]/;
const EXEMPTION_PHRASE = 'setNodeMarkup-no-kind-guard';

describe('JsxComponentView kind-discriminator drift-guard (Pass 1 Minor 1)', () => {
  const GUARD_WINDOW = 40;

  test(`every setNodeMarkup call has a 'kind === element' guard within ${GUARD_WINDOW} lines above`, () => {
    const src = readFileSync(VIEW_FILE, 'utf8');
    const lines = src.split('\n');
    const offenders: Array<{ line: number; snippet: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.trim().startsWith('//')) continue;
      if (line.trim().startsWith('*')) continue;
      if (!line.includes('setNodeMarkup(')) continue;
      const window = lines.slice(Math.max(0, i - GUARD_WINDOW), i).join('\n');
      const hasGuard = KIND_GUARD_RE.test(window);
      const hasExemption = window.includes(EXEMPTION_PHRASE);
      if (!hasGuard && !hasExemption) {
        offenders.push({ line: i + 1, snippet: line.trim().slice(0, 100) });
      }
    }
    expect(
      offenders,
      `setNodeMarkup call site(s) without a 'kind === element' guard within ${GUARD_WINDOW} lines: ` +
        `${JSON.stringify(offenders)}. Either add the guard or document the exemption ` +
        `with a comment containing the literal phrase '${EXEMPTION_PHRASE}'.`,
    ).toEqual([]);
  });
});
