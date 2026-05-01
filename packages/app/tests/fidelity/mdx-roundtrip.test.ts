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
    assertRoundTrip('<img src="https://example.com?a=1&b=2" />\n');
  });

  test('complex object expression attr', () => {
    assertRoundTrip('<Chart data={{ x: 1, y: 2 }} />\n');
  });
});

describe('MDX round-trip — paired flow elements', () => {
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
  test('named import re-parses as prose (braces become expression)', () => {
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
