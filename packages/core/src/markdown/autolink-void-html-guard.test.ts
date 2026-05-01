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

describe('R23 guard: exhaustive < context coverage', () => {
  const mustNotThrow: Array<[string, string]> = [
    ['<https://example.com>', 'autolink https'],
    ['<mailto:a@b.com>', 'autolink mailto'],
    ['<ftp://files.x/p>', 'autolink ftp'],

    ['<br>', 'void br'],
    ['<hr>', 'void hr'],
    ['<img src="x">', 'void img with attr'],
    ['<br/>', 'self-closing br'],
    ['<br />', 'self-closing br with space'],

    ['<div>content</div>', 'div block'],
    ['<span>inline</span>', 'span inline'],
    ['<p>paragraph</p>', 'p tag'],

    ['<Callout>body</Callout>', 'paired MDX'],
    ['<Note>text</Note>', 'paired MDX inline'],
    ['<Icon />', 'self-closing MDX'],
    ['<Widget\n  title="hello"\n/>', 'multi-line self-closing JSX'],
    ['<Card\n  variant="warning"\n  />', 'multi-line self-closing with trailing space'],
    ['<Image src="https://example.com?a=1&b=2" />', 'self-closing with URL in attr'],
    ['<Chart data="https://api.example.com/v1" />', 'self-closing with URL path in attr'],
    ['<Link href="/path/to/page" />', 'self-closing with relative path in attr'],

    ['<', 'bare < at EOF'],
    ['< ', 'bare < + space'],
    ['<\n', 'bare < + newline'],
    ['a<b', 'inline <letter'],
    ['a < b', '< with spaces (comparison)'],
    ['<foo', 'unclosed <lowercase'],
    ['<foo bar', 'unclosed <lowercase with text'],
    ['<Foo', 'unclosed <Uppercase'],
    ['<foo>', 'lowercase tag (closed)'],

    ['<!-- comment -->', 'HTML comment'],
    ['<!-- <nested> -->', 'HTML comment with angle brackets'],
    ['<!--\nmultiline\n-->', 'multiline HTML comment'],

    ['<b>bold</b> and <foo unclosed', 'valid HTML + bare <'],
    ['if (x < y) return', 'code-like comparison'],
    ['a < b && c > d', 'double comparison'],
    ['<Callout>see <https://url></Callout>', 'MDX + autolink inside'],
    ['<Note>has <br> inside</Note>', 'MDX + void HTML inside'],

    ['<<<', 'triple <'],
    ['<><>', 'empty angle pairs'],
    ['<{expr}>', 'JSX expression-like'],
    ['< Component >', 'space after < (not JSX)'],
    ['<_private>', 'underscore start (mdx claims _)'],
    ['<$special>', 'dollar start (mdx claims $)'],
    ['<_', 'bare underscore-start unclosed'],
    ['<$', 'bare dollar-start unclosed'],

    ['The value is <unknown at this time', 'prose with <word'],
    ['Use Ctrl+< to go back', 'keyboard shortcut'],
    ['Template: <placeholder>', 'template-like'],
    ['Compare: 3 <foo> 5', 'comparison with word in angles'],

    ['</', 'bare </ at EOF'],
    ['</foo', 'incomplete close tag'],
    ['</Callout', 'incomplete uppercase close tag'],

    ['{', 'bare { at EOF'],
    ['{ ', 'bare { + space'],
    ['text {', 'text then bare {'],
    ['{ unclosed', 'unclosed {'],
    ['a{b', 'inline {letter'],
    ['{a', 'bare {letter at EOF'],
    ['{{', 'double {'],
    ['{{{', 'triple {'],
    ['{a{b', 'nested unmatched {'],

    ['{expression}', 'valid MDX expression'],
    ['{/* comment */}', 'MDX comment expression'],
    ['{}', 'empty MDX expression'],
    ['{123}', 'numeric MDX expression'],
    ['{true}', 'boolean MDX expression'],
    ['{{}}', 'nested matched braces'],

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

describe('R6a: safeText idempotency for §2.4 ambiguous chars', () => {
  const CHARS_AC = ['\\', '*', '_', '#', '<', '>', '{', '}'];

  for (const c of CHARS_AC) {
    test(`round-trip stable — bare "${c}"`, () => {
      const r1 = roundTrip(c);
      const r2 = roundTrip(r1);
      expect(r2).toBe(r1);
    });

    test(`round-trip stable — escaped "\\${c}"`, () => {
      const r1 = roundTrip(`\\${c}`);
      const r2 = roundTrip(r1);
      expect(r2).toBe(r1);
    });
  }

  test('double-escape stable (5 rounds) — "\\{"', () => {
    let s = '\\{';
    const outputs: string[] = [];
    for (let i = 0; i < 5; i++) {
      s = roundTrip(s);
      outputs.push(s);
    }
    expect(new Set(outputs).size).toBe(1);
  });

  test('double-escape stable (5 rounds) — "\\\\{"', () => {
    let s = '\\\\{';
    const outputs: string[] = [];
    for (let i = 0; i < 5; i++) {
      s = roundTrip(s);
      outputs.push(s);
    }
    expect(new Set(outputs).size).toBe(1);
  });

  test('CDATA-shaped HTML block idempotent (R6 Finding 4)', () => {
    const cdata =
      '<![CDATA[\nfunction matchwo(a,b)\n{\n  if (a < b && a < 0) then {\n    return 1;\n\n  } else {\n\n    return 0;\n  }\n}\n]]>\nokay\n';
    const r1 = roundTrip(cdata);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
    const countBs = (s: string) => (s.match(/\\\\/g) ?? []).length;
    expect(countBs(r2)).toBe(countBs(r1));
  });

  test('escaped brace in MDX-adjacent context preserves escape', () => {
    const md = 'prose \\{expression}\n';
    const r1 = roundTrip(md);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
    expect(r1).toContain('\\{');
  });

  test('unmatched brace still protected (no crash) — fix does not regress R23', () => {
    expect(() => mdManager.parse('prose {unclosed\n')).not.toThrow();
    expect(() => mdManager.parse('unclosed}\nprose\n')).not.toThrow();
    expect(() => mdManager.parse('{nested {unclosed\n')).not.toThrow();
  });

  test('literal backslash before matched pair is still a literal', () => {
    expect(() => mdManager.parse('\\\\{a}\n')).not.toThrow();
  });
});
