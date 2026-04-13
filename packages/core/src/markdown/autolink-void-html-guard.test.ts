/**
 * Tests for R23 autolink + void-HTML regression fix.
 *
 * Verifies that `<https://example.com>` and `<br>` parse without crashing
 * (the 2 regressions surfaced by R1 probe).
 */
import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

describe('R23: autolink regression fix', () => {
  test('autolink <https://example.com> parses without error', () => {
    expect(() => mdManager.parse('Visit <https://example.com>.\n')).not.toThrow();
  });

  test('autolink round-trips', () => {
    const md = 'Visit <https://example.com>.\n';
    const output = roundTrip(md);
    expect(output).toContain('https://example.com');
  });
});

describe('R23: void HTML regression fix', () => {
  test('<br> parses without error', () => {
    expect(() => mdManager.parse('Line one<br>Line two.\n')).not.toThrow();
  });

  test('<br> round-trips', () => {
    const md = 'Line one<br>Line two.\n';
    const output = roundTrip(md);
    expect(output).toContain('<br>');
  });

  test('<hr> parses without error', () => {
    expect(() => mdManager.parse('Above\n\n<hr>\n\nBelow\n')).not.toThrow();
  });

  test('<img> parses without error', () => {
    expect(() => mdManager.parse('<img src="photo.jpg">\n')).not.toThrow();
  });

  test('<br/> self-closing parses without error', () => {
    expect(() => mdManager.parse('Line<br/>break.\n')).not.toThrow();
  });
});

describe('R23: invalid JSX opener recovery', () => {
  test('literal <50ms in prose parses without error', () => {
    expect(() => mdManager.parse('Warm replay when nothing changed is <50ms.\n')).not.toThrow();
  });

  test('literal <50ms in prose remains literal text in parsed content', () => {
    const json = mdManager.parse('Warm replay when nothing changed is <50ms.\n');
    expect(json.content?.[0]?.type).toBe('paragraph');
    expect(json.content?.[0]?.content?.[0]?.text).toBe(
      'Warm replay when nothing changed is <50ms.',
    );
  });

  test('comparison prose 2 < 5 remains literal text in parsed content', () => {
    const json = mdManager.parse('Comparison: 2 < 5 and 7 > 3.\n');
    expect(json.content?.[0]?.type).toBe('paragraph');
    expect(json.content?.[0]?.content?.[0]?.text).toBe('Comparison: 2 < 5 and 7 > 3.');
  });
});

/**
 * Exhaustive `<` context coverage — every position where `<` can appear in
 * real-world content. Guards against the class of bug where a new remark
 * plugin claims `<` in a context the R23 guard didn't anticipate.
 *
 * Added after PR #95: bare `<letter` without closing `>` crashed remark-mdx.
 */
describe('R23 guard: exhaustive < context coverage', () => {
  const mustNotThrow: Array<[string, string]> = [
    // Autolinks (existing coverage — included for completeness)
    ['<https://example.com>', 'autolink https'],
    ['<mailto:a@b.com>', 'autolink mailto'],
    ['<ftp://files.x/p>', 'autolink ftp'],

    // Void HTML
    ['<br>', 'void br'],
    ['<hr>', 'void hr'],
    ['<img src="x">', 'void img with attr'],
    ['<br/>', 'self-closing br'],
    ['<br />', 'self-closing br with space'],

    // Lowercase HTML (opening + closing)
    ['<div>content</div>', 'div block'],
    ['<span>inline</span>', 'span inline'],
    ['<p>paragraph</p>', 'p tag'],

    // Uppercase JSX (must still parse as MDX)
    ['<Callout>body</Callout>', 'paired MDX'],
    ['<Note>text</Note>', 'paired MDX inline'],
    ['<Icon />', 'self-closing MDX'],
    ['<Widget\n  title="hello"\n/>', 'multi-line self-closing JSX'],
    ['<Card\n  variant="warning"\n  />', 'multi-line self-closing with trailing space'],

    // Bare < (the PR #95 regression class — must NOT crash)
    ['<', 'bare < at EOF'],
    ['< ', 'bare < + space'],
    ['<\n', 'bare < + newline'],
    ['a<b', 'inline <letter'],
    ['a < b', '< with spaces (comparison)'],
    ['<foo', 'unclosed <lowercase'],
    ['<foo bar', 'unclosed <lowercase with text'],
    ['<Foo', 'unclosed <Uppercase'],
    ['<foo>', 'lowercase tag (closed)'],

    // HTML comments
    ['<!-- comment -->', 'HTML comment'],
    ['<!-- <nested> -->', 'HTML comment with angle brackets'],
    ['<!--\nmultiline\n-->', 'multiline HTML comment'],

    // Mixed patterns
    ['<b>bold</b> and <foo unclosed', 'valid HTML + bare <'],
    ['if (x < y) return', 'code-like comparison'],
    ['a < b && c > d', 'double comparison'],
    ['<Callout>see <https://url></Callout>', 'MDX + autolink inside'],
    ['<Note>has <br> inside</Note>', 'MDX + void HTML inside'],

    // Edge cases
    ['<<<', 'triple <'],
    ['<><>', 'empty angle pairs'],
    ['<{expr}>', 'JSX expression-like'],
    ['< Component >', 'space after < (not JSX)'],
    ['<_private>', 'underscore start (mdx claims _)'],
    ['<$special>', 'dollar start (mdx claims $)'],
    ['<_', 'bare underscore-start unclosed'],
    ['<$', 'bare dollar-start unclosed'],

    // Realistic prose
    ['The value is <unknown at this time', 'prose with <word'],
    ['Use Ctrl+< to go back', 'keyboard shortcut'],
    ['Template: <placeholder>', 'template-like'],
    ['Compare: 3 <foo> 5', 'comparison with word in angles'],

    // Incomplete close tags (guard protects these)
    ['</', 'bare </ at EOF'],
    ['</foo', 'incomplete close tag'],
    ['</Callout', 'incomplete uppercase close tag'],

    // Bare { — unmatched (guard protects these)
    ['{', 'bare { at EOF'],
    ['{ ', 'bare { + space'],
    ['text {', 'text then bare {'],
    ['{ unclosed', 'unclosed {'],
    ['a{b', 'inline {letter'],
    ['{a', 'bare {letter at EOF'],
    // Consecutive/nested unmatched braces
    ['{{', 'double {'],
    ['{{{', 'triple {'],
    ['{a{b', 'nested unmatched {'],

    // Valid MDX expressions (must still work)
    ['{expression}', 'valid MDX expression'],
    ['{/* comment */}', 'MDX comment expression'],
    ['{}', 'empty MDX expression'],
    ['{123}', 'numeric MDX expression'],
    ['{true}', 'boolean MDX expression'],
    ['{{}}', 'nested matched braces'],

    // Mixed < and {
    ['<foo and {bar', 'bare < and bare { together'],
    ['<Callout>{content}</Callout>', 'MDX with expression inside'],
    ['{expression} and <br>', 'expression + void HTML'],
  ];

  for (const [input, label] of mustNotThrow) {
    test(`does not throw: ${label}`, () => {
      expect(() => mdManager.parse(input)).not.toThrow();
    });
  }
});
