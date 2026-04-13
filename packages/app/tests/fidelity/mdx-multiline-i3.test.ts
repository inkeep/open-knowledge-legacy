/**
 * MDX multiline expression I3 stability — R16(b).
 *
 * Verifies f(f(x)) === f(x) for multiline JSX expressions, mitigating
 * the mdx-js/mdx#2533 indentation drift issue.
 *
 * The new pipeline stores raw MDX source as-is in jsxComponent.content,
 * so indentation does not accumulate across round-trips.
 */
import { describe, expect, test } from 'bun:test';
import { mdRoundTrip, normalize } from './helpers';

describe('I3 stability for MDX multiline expressions (mdx-js/mdx#2533)', () => {
  test('multiline object expression does not drift on repeated round-trips', () => {
    const input = '<Chart data={{ key: "value" }} />\n';
    const first = mdRoundTrip(input);
    const second = mdRoundTrip(first);
    const third = mdRoundTrip(second);
    expect(normalize(second)).toBe(normalize(first));
    expect(normalize(third)).toBe(normalize(second));
  });

  test('multiline JSX attrs converge and stay stable', () => {
    const input = '<Widget\n  title="hello"\n  data={values}\n/>\n';
    const first = mdRoundTrip(input);
    const second = mdRoundTrip(first);
    const third = mdRoundTrip(second);
    // Must converge: f(f(x)) === f(x)
    expect(normalize(second)).toBe(normalize(first));
    expect(normalize(third)).toBe(normalize(second));
  });

  test('expression-only block does not accumulate indentation', () => {
    const input = '{/* multi-line\n   comment */}\n';
    const first = mdRoundTrip(input);
    const second = mdRoundTrip(first);
    expect(normalize(second)).toBe(normalize(first));
  });

  test('import + export + MDX content converges', () => {
    const input =
      "import { Chart } from './Chart'\n\nexport const meta = { title: 'Test' }\n\n<Chart data={{ x: 1 }} />\n";
    const first = mdRoundTrip(input);
    const second = mdRoundTrip(first);
    expect(normalize(second)).toBe(normalize(first));
  });
});
