/**
 * MDX flow/text/expression/esm round-trip — R16(a).
 *
 * Verifies byte-identical (or normalization-convergent) round-trip for the
 * MDX shapes the product supports. Derived from the 22/23 cases in
 * reports/mdx-crdt-roundtrip-fidelity/.
 *
 * The new pipeline stores raw MDX source in jsxComponent.content attrs,
 * so round-trip is byte-identical for all stored forms.
 */
import { describe, expect, test } from 'bun:test';
import { mdRoundTrip, normalize } from './helpers';

function assertRoundTrip(input: string): void {
  const output = normalize(mdRoundTrip(input));
  const expected = normalize(input);
  expect(output).toBe(expected);
}

describe('MDX round-trip — self-closing flow elements', () => {
  test('bare self-closing', () => {
    assertRoundTrip('<Chart />\n');
  });

  test('string literal attr', () => {
    assertRoundTrip('<Callout type="info" />\n');
  });

  test('expression attr', () => {
    assertRoundTrip('<Chart data={values} />\n');
  });

  test('boolean shorthand attr', () => {
    assertRoundTrip('<Icon disabled />\n');
  });

  test('spread attr', () => {
    assertRoundTrip('<Comp {...props} />\n');
  });

  test('member expression tag', () => {
    assertRoundTrip('<Docs.Link />\n');
  });

  test('member expression tag with attrs', () => {
    assertRoundTrip('<Foo.Bar baz="qux" />\n');
  });

  test('URL special chars in attr value', () => {
    assertRoundTrip('<Image src="https://example.com?a=1&b=2" />\n');
  });

  test('complex object expression attr', () => {
    assertRoundTrip('<Chart data={{ x: 1, y: 2 }} />\n');
  });
});

describe('MDX round-trip — paired flow elements (known gap)', () => {
  test('paired with text children throws — jsxComponent is atom, cannot host children', () => {
    // Known gap: paired MDX components with children cannot round-trip because
    // jsxComponent is an atom node (no children slot). Self-closing components
    // round-trip via raw-source capture in the content attr. Fixing this
    // requires making jsxComponent non-atom with a children content spec.
    expect(() => mdRoundTrip('<Callout>\nHello world\n</Callout>\n')).toThrow();
  });

  test('deep nesting throws — same atom limitation', () => {
    expect(() => mdRoundTrip('<A>\n<B>\n<C>text</C>\n</B>\n</A>\n')).toThrow();
  });
});

describe('MDX round-trip — import/export statements', () => {
  test('named import', () => {
    assertRoundTrip("import { Chart } from './Chart'\n");
  });

  test('default import', () => {
    assertRoundTrip("import Chart from './Chart'\n");
  });

  test('export const', () => {
    assertRoundTrip("export const meta = { title: 'Test' }\n");
  });

  test('import + content', () => {
    assertRoundTrip("import { Chart } from './Chart'\n\n# Hello\n");
  });
});

describe('MDX round-trip — expressions', () => {
  test('block expression (comment)', () => {
    assertRoundTrip('{/* comment */}\n');
  });
});

describe('MDX round-trip — normalization convergence', () => {
  test('boolean shorthand converges after first serialize (mdx-js/mdx#2608)', () => {
    // First round-trip may normalize; second+ must be stable
    const first = mdRoundTrip('<Icon disabled />\n');
    const second = mdRoundTrip(first);
    expect(normalize(second)).toBe(normalize(first));
  });

  test('self-closing spacing converges (<Chart/> → <Chart />)', () => {
    const first = mdRoundTrip('<Chart/>\n');
    const second = mdRoundTrip(first);
    expect(normalize(second)).toBe(normalize(first));
  });

  test('single-quote attr converges to double-quote', () => {
    const first = mdRoundTrip("<Callout type='warning' />\n");
    const second = mdRoundTrip(first);
    expect(normalize(second)).toBe(normalize(first));
  });
});
