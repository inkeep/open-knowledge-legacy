/**
 * Regression tests for `extractPrimitiveProps` (JsxComponentView.tsx).
 *
 * The function's contract:
 *   - Passes through every declared non-reactnode prop.
 *   - Excludes prop names the descriptor marked as `reactnode`.
 *   - Preserves unknown attrs (FR-21 merge symmetry — fumadocs components
 *     often require attrs we don't declare, e.g. `InlineTOC.items`).
 *   - Routes every return value through `sanitizeComponentProps` — XSS
 *     denylist (`dangerouslySetInnerHTML`, `on*` events, React internals),
 *     URL-scheme allowlist, style sanitization, nested URL traversal.
 *
 * Originally the implementation iterated ONLY the descriptor-declared
 * PropDef entries, dropping any attr not in the registry. Example crash:
 * `<InlineTOC items={[...]}>` → fumadocs InlineTOC does `items.map(...)`
 * → `TypeError: Cannot read properties of undefined (reading 'map')`
 * because the `items` attr was silently dropped.
 *
 * Also includes the kind-discriminator drift-guard (post-Pass 1 review
 * Minor 1 follow-up). Asserts every `setNodeMarkup` call in
 * `JsxComponentView.tsx` is preceded by a `kind === 'element'` (or
 * `kind !== 'element'`) guard within 30 lines so a future write site that
 * targets jsxComponent without consulting the discriminator can't slip in
 * silently.
 */

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
    // Shouldn't happen in practice (parser wouldn't put children in props),
    // but asserting the filter excludes reactnode names if they somehow
    // appear.
    const attrs = { props: { title: 'Hi', children: 'shouldnt be here' } };
    const result = extractPrimitiveProps(attrs, reactNodes('children'));
    expect(result).toEqual({ title: 'Hi' });
    expect(result).not.toHaveProperty('children');
  });

  test('REGRESSION: undeclared attrs pass through (e.g. InlineTOC items, TypeTable type)', () => {
    // Registry PropDef only declares `children: reactnode`, but fumadocs
    // InlineTOC requires an `items` array or it crashes.
    const attrs = {
      props: {
        items: [
          { title: 'Intro', url: '#intro', depth: 1 },
          { title: 'Usage', url: '#usage', depth: 2 },
        ],
      },
    };
    const result = extractPrimitiveProps(attrs, reactNodes('children'));

    // The undeclared `items` MUST reach the component.
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(2);
  });

  test('REGRESSION: preserves unknown attrs alongside declared ones (FR-21 merge symmetry)', () => {
    // fumadocs Card has `title`/`description`/`color`/`external` attrs; if
    // the descriptor only declares title+description, color/external must
    // still reach the rendered component.
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

  // ── Render-layer XSS mitigation contract (sanitizeComponentProps) ──────

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
  // Load-bearing invariant: the ErrorBoundary reset key depends on two props
  // objects with identical (key, value) pairs hashing to the same string,
  // regardless of insertion order. Without this, post-edit re-serialization
  // reorders keys and the boundary remounts mid-typing, stealing focus. See
  // the comment at JsxComponentView.tsx:196-204 for the original bug.
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

// ── kind-discriminator drift-guard (Pass 1 review Minor 1 follow-up) ───────
//
// `jsxComponent.addAttributes()` declares `kind: 'element' | 'expression'`
// as a discriminator (see `packages/core/src/extensions/jsx-component.ts`).
// `kind === 'expression'` nodes carry only `sourceRaw` semantically; an
// element-shaped attr spread onto an expression node would pass through
// `setNodeMarkup` cleanly but the serializer at `markdown/index.ts:1048`
// would silently emit `sourceRaw` verbatim, dropping every prop edit.
//
// Today exactly one production caller writes element-shaped attrs to
// jsxComponent: the PropPanel `onChange` at `JsxComponentView.tsx`'s
// setNodeMarkup dispatch. That site has the boundary guard
// (`if (curNode.attrs.kind !== 'element') return;`) immediately above the
// dispatch. This test prevents the next setNodeMarkup site from skipping
// the guard — catches the exact drift class the Pass 1 review flagged.
//
// If a legitimate setNodeMarkup site lands that doesn't need the guard
// (e.g. clearing the entire node for a different reason), document the
// exemption with a comment containing the literal phrase
// `setNodeMarkup-no-kind-guard` within 30 lines above the call. The test
// scans the file as text — comment-based exemption is the escape hatch.

const VIEW_FILE = join(dirname(fileURLToPath(import.meta.url)), 'JsxComponentView.tsx');
const KIND_GUARD_RE = /attrs\.kind\s*(?:!==|===)\s*['"]element['"]/;
const EXEMPTION_PHRASE = 'setNodeMarkup-no-kind-guard';

describe('JsxComponentView kind-discriminator drift-guard (Pass 1 Minor 1)', () => {
  // 40-line window: covers the existing site (guard at L856 + intermediate
  // attr-prep at L857-887 + dispatch at L888) with margin for future
  // refactors that add prep steps. A larger window risks letting the guard
  // drift far from the call; a smaller window forces structural noise.
  const GUARD_WINDOW = 40;

  test(`every setNodeMarkup call has a 'kind === element' guard within ${GUARD_WINDOW} lines above`, () => {
    const src = readFileSync(VIEW_FILE, 'utf8');
    const lines = src.split('\n');
    const offenders: Array<{ line: number; snippet: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      // Skip comments — the comment-prose phrase `setNodeMarkup(pos, ...)`
      // appears in docblocks above the actual call (e.g. line 839).
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
