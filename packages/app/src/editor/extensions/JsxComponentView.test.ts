/**
 * Regression test for extractPrimitiveProps.
 *
 * Originally the implementation iterated ONLY the descriptor-declared PropDef
 * entries, dropping any attr not in the registry from the rendered component's
 * props. Example crash: `<InlineTOC items={[...]}>` → fumadocs InlineTOC does
 * `items.map(...)` → `TypeError: Cannot read properties of undefined (reading
 * 'map')` because the `items` attr was silently dropped.
 *
 * The fix makes the render path symmetric with FR-21's reconstructAttrs merge:
 * ALL keys from `attrs.props` (destructureAttrs stores every attribute there)
 * pass through, and only PropDef entries whose type is 'reactnode' are excluded
 * (those are content holes — handled by NodeViewContent).
 */
import { describe, expect, test } from 'bun:test';
import type { PropDef } from '@inkeep/open-knowledge-core';
import { extractPrimitiveProps, stableHash } from './JsxComponentView.tsx';

describe('extractPrimitiveProps', () => {
  test('passes through declared props', () => {
    const descriptorProps: PropDef[] = [
      { name: 'type', type: 'enum', enumValues: ['info', 'warning'], required: false },
      { name: 'title', type: 'string', required: false },
    ];
    const attrs = { props: { type: 'warning', title: 'Heads up' } };

    const result = extractPrimitiveProps(attrs, descriptorProps);

    expect(result).toEqual({ type: 'warning', title: 'Heads up' });
  });

  test('excludes reactnode-typed PropDef entries (content hole, not a prop)', () => {
    const descriptorProps: PropDef[] = [
      { name: 'title', type: 'string', required: false },
      { name: 'children', type: 'reactnode', required: true },
    ];
    // Shouldn't happen in practice (parser wouldn't put children in props), but
    // asserting the filter excludes reactnode names if they somehow appear.
    const attrs = { props: { title: 'Hi', children: 'shouldnt be here' } };

    const result = extractPrimitiveProps(attrs, descriptorProps);

    expect(result).toEqual({ title: 'Hi' });
    expect(result).not.toHaveProperty('children');
  });

  test('REGRESSION: undeclared attrs pass through (e.g. InlineTOC items, Mermaid chart, TypeTable type)', () => {
    // Registry PropDef only declares `children: reactnode`, but the fumadocs
    // InlineTOC component requires an `items` array or it crashes.
    const descriptorProps: PropDef[] = [{ name: 'children', type: 'reactnode', required: false }];
    const attrs = {
      props: {
        items: [
          { title: 'Intro', url: '#intro', depth: 1 },
          { title: 'Usage', url: '#usage', depth: 2 },
        ],
      },
    };

    const result = extractPrimitiveProps(attrs, descriptorProps);

    // The undeclared `items` MUST reach the component.
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(2);
  });

  test('REGRESSION: preserves unknown attrs alongside declared ones (FR-21 merge symmetry)', () => {
    // fumadocs Card PropDef declares title/description but not `color`/`external`.
    // The render path must NOT drop unknown attrs — matches the serialize-path
    // reconstructAttrs merge semantics.
    const descriptorProps: PropDef[] = [
      { name: 'title', type: 'string', required: false },
      { name: 'description', type: 'string', required: false },
    ];
    const attrs = {
      props: {
        title: 'Custom Card',
        description: 'With extras',
        color: '#F05032',
        external: true,
      },
    };

    const result = extractPrimitiveProps(attrs, descriptorProps);

    expect(result).toEqual({
      title: 'Custom Card',
      description: 'With extras',
      color: '#F05032',
      external: true,
    });
  });

  test('handles empty props', () => {
    const result = extractPrimitiveProps({ props: {} }, []);
    expect(result).toEqual({});
  });

  test('handles missing props attr', () => {
    const result = extractPrimitiveProps({}, []);
    expect(result).toEqual({});
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
