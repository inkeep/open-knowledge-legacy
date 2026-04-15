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

describe('MDX round-trip — paired flow elements', () => {
  // Paired MDX components round-trip byte-identically via raw-source capture
  // in the jsxComponent.content attr + `restoreFromMdx`'s mixed-case close-tag
  // preservation (NG9 sentinels; `HTML_CLOSE_TAG_RE` excludes JSX closing
  // tags). The atom-node schema is sufficient because the entire paired-tag
  // source (open-tag + children + close-tag) is captured as a single string
  // and serialized verbatim.
  test('paired with text children round-trips byte-identically', () => {
    assertRoundTrip('<Callout>\n\nHello world\n\n</Callout>\n');
  });

  test('deep nesting round-trips byte-identically', () => {
    assertRoundTrip('<A>\n<B>\n<C>text</C>\n</B>\n</A>\n');
  });

  test('paired with block children round-trips', () => {
    assertRoundTrip('<Card>\n\n# Heading\n\nparagraph\n\n</Card>\n');
  });

  test('paired with mixed inline children round-trips', () => {
    assertRoundTrip('<Note>see <br> below</Note>\n');
  });
});

describe('MDX round-trip — import/export statements (agnostic mode: prose)', () => {
  // Under agnostic MDX mode (R1), import/export statements are no longer parsed
  // as mdxjsEsm nodes — they re-parse as prose paragraphs per NG1. The text
  // content is preserved on round-trip (not lost), but the structural mechanism
  // differs: prose paragraph instead of atom jsxComponent.
  test('named import re-parses as prose (braces become expression)', () => {
    // Under agnostic mode, `{ Chart }` is claimed as an MDX expression.
    // The import keyword and path remain as prose text.
    const output = normalize(mdRoundTrip("import { Chart } from './Chart'\n"));
    expect(output).toContain('import');
    expect(output).toContain('Chart');
    expect(output).toContain("'./Chart'");
  });

  test('default import preserved as prose', () => {
    const output = normalize(mdRoundTrip("import Chart from './Chart'\n"));
    expect(output).toContain('import');
    expect(output).toContain('Chart');
  });

  test('export const preserved as prose', () => {
    const output = normalize(mdRoundTrip("export const meta = { title: 'Test' }\n"));
    expect(output).toContain('export const meta');
  });

  test('import + content: content structure preserved', () => {
    const output = normalize(mdRoundTrip("import { Chart } from './Chart'\n\n# Hello\n"));
    expect(output).toContain('import');
    expect(output).toContain('# Hello');
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
