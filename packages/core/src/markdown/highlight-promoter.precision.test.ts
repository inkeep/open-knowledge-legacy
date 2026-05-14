import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function collectHighlightedTextNodes(json: JSONContent): JSONContent[] {
  const out: JSONContent[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === 'text' && (n.marks ?? []).some((m) => m.type === 'highlight')) {
      out.push(n);
    }
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

function plainTextOf(json: JSONContent): string {
  let out = '';
  const visit = (n: JSONContent) => {
    if (n.type === 'text') out += n.text ?? '';
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

describe('highlight-promoter — acceptance', () => {
  test('basic `==hello==`', () => {
    const json = mdManager.parse('==hello==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hello');
  });

  test('mid-paragraph `a ==hello== b`', () => {
    const json = mdManager.parse('a ==hello== b\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hello');
    expect(plainTextOf(json)).toBe('a hello b');
  });

  test('multi-word `==a b c==`', () => {
    const json = mdManager.parse('==a b c==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('a b c');
  });

  test('inner whitespace-flanked `==` does NOT close (`==a == b==`)', () => {
    const json = mdManager.parse('==a == b==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('a == b');
  });

  test('with embedded math `==a + $x$ + b==`', () => {
    const json = mdManager.parse('==a + $x$ + b==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(0);
  });

  test('with surrounding emphasis `*==hi==*`', () => {
    const json = mdManager.parse('*==hi==*\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hi');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['emphasis', 'highlight']);
  });

  test('with surrounding bold `**==hi==**`', () => {
    const json = mdManager.parse('**==hi==**\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hi');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['highlight', 'strong']);
  });
});

describe('highlight-promoter — rejection (stay prose)', () => {
  test('single `=text=` is not a delimiter', () => {
    const json = mdManager.parse('=text=\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('=text=');
  });

  test('`===` (three equals, edge ambiguity)', () => {
    const json = mdManager.parse('===\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('`====` (four equals)', () => {
    const json = mdManager.parse('====\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('open with leading space `== text==` (left-flanking violation)', () => {
    const json = mdManager.parse('== text==\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('== text==');
  });

  test('close with trailing space `==text ==` (right-flanking violation)', () => {
    const json = mdManager.parse('==text ==\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('==text ==');
  });

  test('unmatched `==text` (no closing delimiter)', () => {
    const json = mdManager.parse('==text\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('unmatched `text==` (no opening delimiter)', () => {
    const json = mdManager.parse('text==\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('multi-line `==a\\n more==` (rule 3, body cannot cross newline)', () => {
    const json = mdManager.parse('==a\nmore==\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('equation `a == b` (no closing pair) stays prose', () => {
    const json = mdManager.parse('a == b\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('a == b');
  });

  test('escaped opening `\\==text==`', () => {
    const json = mdManager.parse('\\==text==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('text');
  });
});

describe('highlight-promoter — multi-match', () => {
  test('two highlights on one line `==a== ==b==`', () => {
    const json = mdManager.parse('==a== ==b==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(2);
    expect(marks[0].text).toBe('a');
    expect(marks[1].text).toBe('b');
  });

  test('chained `==a==b==` highlights `a`, leaves `b==` as text', () => {
    const json = mdManager.parse('==a==b==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('a');
    expect(plainTextOf(json)).toBe('ab==');
  });

  test('three highlights `==a== ==b== ==c==`', () => {
    const json = mdManager.parse('==a== ==b== ==c==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(3);
    expect(marks.map((m) => m.text)).toEqual(['a', 'b', 'c']);
  });

  test('adjacent no-separator `==a====b==` produces ONE highlight body=`a====b`', () => {
    const json = mdManager.parse('==a====b==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('a====b');
    expect(mdManager.serialize(json)).toBe('==a====b==\n');
  });
});

describe('highlight-promoter — cross-children body (==**bold**==, ==*italic*==, ==`code`==)', () => {
  test('`==**bold**==` carries both highlight + strong', () => {
    const json = mdManager.parse('==**bold**==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('bold');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['highlight', 'strong']);
  });

  test('`==*italic*==` carries both highlight + emphasis', () => {
    const json = mdManager.parse('==*italic*==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('italic');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['emphasis', 'highlight']);
  });

  test('` ==`code`== ` carries both highlight + code', () => {
    const json = mdManager.parse('==`code`==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('code');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['code', 'highlight']);
  });

  test('`==~~strike~~==` carries highlight + strike', () => {
    const json = mdManager.parse('==~~strike~~==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('strike');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['highlight', 'strike']);
  });

  test('mid-paragraph `a ==**bold**== b` highlights only the bold', () => {
    const json = mdManager.parse('a ==**bold**== b\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('bold');
    expect(plainTextOf(json)).toBe('a bold b');
  });

  test('`==**a** **b**==` highlights the full body — both bolds plus separator', () => {
    const json = mdManager.parse('==**a** **b**==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(3);
    expect(marks.map((m) => m.text)).toEqual(['a', ' ', 'b']);
    const markSets = marks.map((m) =>
      (m.marks ?? [])
        .map((mm) => mm.type)
        .sort()
        .join(','),
    );
    expect(markSets).toEqual(['highlight,strong', 'highlight', 'highlight,strong']);
  });

  test('flanking rule 2 — `== **bold**==` (open followed by space) stays prose', () => {
    const json = mdManager.parse('a == **bold**== b\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('flanking rule 4 — `==**bold** ==` (close preceded by space) stays prose', () => {
    const json = mdManager.parse('a ==**bold** == b\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('`==Bold: **bold thing** end.==j` — open + close mid-text with formatting in body (user repro)', () => {
    const json = mdManager.parse('==Bold: **bold thing** end.==j\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.map((m) => m.text)).toEqual(['Bold: ', 'bold thing', ' end.']);
    const strongMark = marks.find((m) => m.text === 'bold thing');
    expect((strongMark?.marks ?? []).map((mm) => mm.type).sort()).toEqual(['highlight', 'strong']);
    expect(plainTextOf(json)).toBe('Bold: bold thing end.j');
    const src = '==Bold: **bold thing** end.==j\n';
    expect(mdManager.serialize(json)).toBe(src);
    const second = mdManager.parse(mdManager.serialize(json));
    expect(collectHighlightedTextNodes(second).length).toBe(3);
  });

  test('opaque inline (link) inside `==[anchor](url)==` — stays prose', () => {
    const json = mdManager.parse('==[anchor](url)==\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('opaque inline (inline math) inside `==$x$==` — stays prose', () => {
    const json = mdManager.parse('==$x$==\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('close `==` followed by `=` via inlineCode start char — rule 5 cross-boundary rejection', () => {
    const src = '==**bold**==`=code`\n';
    const json = mdManager.parse(src);
    const marks = collectHighlightedTextNodes(json);
    for (const m of marks) {
      expect(m.text).not.toContain('=code');
    }
  });

  test('`==prefix *em* and **strong** suffix==` — multi-inline body wrapped by `==…==`', () => {
    const json = mdManager.parse('==prefix *em* and **strong** suffix==\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.map((m) => m.text)).toEqual(['prefix ', 'em', ' and ', 'strong', ' suffix']);
  });

  test('chained `==**bold**== and ==*italic*== and ==`code`==` highlights all three runs', () => {
    const src = '==**bold**== and ==*italic*== and ==`code`==\n';
    const json = mdManager.parse(src);
    const marks = collectHighlightedTextNodes(json);
    expect(marks.map((m) => m.text)).toEqual(['bold', 'italic', 'code']);
  });

  test('byte-stable round-trip — `==**bold**==` survives parse + serialize + reparse', () => {
    const src = 'a ==**bold**== b\n';
    const first = mdManager.parse(src);
    const round = mdManager.serialize(first);
    expect(round).toBe(src);
    const second = mdManager.parse(round);
    expect(mdManager.serialize(second)).toBe(src);
    expect(collectHighlightedTextNodes(second).length).toBe(1);
  });
});

describe('highlight-promoter — MDX `<mark>` JSX form', () => {
  test('`<mark>hello</mark>` parses as highlight mark', () => {
    const json = mdManager.parse('<mark>hello</mark>\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('hello');
  });

  test('mid-paragraph `<mark>x</mark>` parses as highlight mark', () => {
    const json = mdManager.parse('a <mark>x</mark> b\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('x');
    expect(plainTextOf(json)).toBe('a x b');
  });

  test('`<mark>` with surrounding emphasis carries both marks', () => {
    const json = mdManager.parse('*<mark>x</mark>*\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['emphasis', 'highlight']);
  });

  test('`<mark>**x**</mark>` carries both highlight + strong', () => {
    const json = mdManager.parse('<mark>**x**</mark>\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('x');
    const markTypes = (marks[0].marks ?? []).map((m) => m.type).sort();
    expect(markTypes).toEqual(['highlight', 'strong']);
  });

  test('`<mark color="red">` — attributes silently dropped', () => {
    const json = mdManager.parse('<mark color="red">x</mark>\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('x');
    const out = mdManager.serialize(json);
    expect(out).toBe('==x==\n');
  });

  test('two `<mark>` on one line', () => {
    const json = mdManager.parse('<mark>a</mark> and <mark>b</mark>\n');
    const marks = collectHighlightedTextNodes(json);
    expect(marks.length).toBe(2);
    expect(marks.map((m) => m.text)).toEqual(['a', 'b']);
  });

  test('capitalized `<Mark>` does NOT promote (lowercase-only by design)', () => {
    const json = mdManager.parse('<Mark>x</Mark>\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });
});

describe('highlight-promoter — protection from code spans + math', () => {
  test('`==text==` inside a code span stays code', () => {
    const json = mdManager.parse('a `==text==` b\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
    expect(plainTextOf(json)).toBe('a ==text== b');
  });

  test('`==text==` inside an inline-math body stays math', () => {
    const json = mdManager.parse('$$==a==$$\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });

  test('`==text==` inside a fenced code block stays code', () => {
    const json = mdManager.parse('```\n==text==\n```\n');
    expect(collectHighlightedTextNodes(json).length).toBe(0);
  });
});

describe('highlight-promoter — round-trip', () => {
  test('`==hello==` round-trips byte-stable', () => {
    const src = '==hello==\n';
    const json = mdManager.parse(src);
    const out = mdManager.serialize(json);
    expect(out).toBe(src);
  });

  test('`a ==hello== b` round-trips byte-stable', () => {
    const src = 'a ==hello== b\n';
    const json = mdManager.parse(src);
    const out = mdManager.serialize(json);
    expect(out).toBe(src);
  });

  test('two highlights round-trip byte-stable', () => {
    const src = '==a== ==b==\n';
    const json = mdManager.parse(src);
    const out = mdManager.serialize(json);
    expect(out).toBe(src);
  });

  test('`==a == b==` (whitespace-flanked inner) round-trips byte-stable', () => {
    const src = '==a == b==\n';
    const json = mdManager.parse(src);
    const out = mdManager.serialize(json);
    expect(out).toBe(src);
  });

  test('`<mark>x</mark>` normalizes to `==x==` on round-trip', () => {
    const json = mdManager.parse('<mark>x</mark>\n');
    const out = mdManager.serialize(json);
    expect(out).toBe('==x==\n');
  });

  test('`==text==` inside code span round-trips as code (not highlight)', () => {
    const src = 'a `==text==` b\n';
    const json = mdManager.parse(src);
    const out = mdManager.serialize(json);
    expect(out).toBe(src);
  });

  test('mid-paragraph `==**bold highlight**==` round-trips byte-stable (highlight outermost — canonical)', () => {
    const src = 'a ==**bold highlight**== b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('mid-paragraph `==*italic highlight*==` round-trips byte-stable (highlight outermost)', () => {
    const src = 'a ==*italic highlight*== b\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('`**==bold==**` (strong-outer input) normalizes to `==**bold**==` (highlight-outer canonical)', () => {
    const src = 'a **==bold==** b\n';
    const out = mdManager.serialize(mdManager.parse(src));
    expect(out).toBe('a ==**bold**== b\n');
  });

  test('`*==italic==*` (em-outer input) normalizes to `==*italic*==`', () => {
    const src = 'a *==italic==* b\n';
    const out = mdManager.serialize(mdManager.parse(src));
    expect(out).toBe('a ==*italic*== b\n');
  });

  test('highlight inside heading `## ==section==` round-trips', () => {
    const src = '## ==section==\n';
    const json = mdManager.parse(src);
    const out = mdManager.serialize(json);
    expect(out).toBe(src);
  });

  test('highlight inside blockquote `> ==quoted==` round-trips', () => {
    const src = '> ==quoted==\n';
    const json = mdManager.parse(src);
    const out = mdManager.serialize(json);
    expect(out).toBe(src);
  });

  test('highlight inside list item `- ==item==` round-trips', () => {
    const src = '- ==item==\n';
    const json = mdManager.parse(src);
    const out = mdManager.serialize(json);
    expect(out).toBe(src);
  });
});

describe('highlight-promoter — direct mdast→markdown', () => {
  // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation matching the existing precedent
  const minimalState: any = {
    enter: () => () => {},
    containerPhrasing: (node: { children?: Array<{ value?: string }> }) =>
      (node.children ?? []).map((c) => c.value ?? '').join(''),
    createTracker: () => ({
      move: (s: string) => s,
      current: () => ({}),
    }),
    options: {},
    unsafe: [],
    safe: (s: string) => s,
  };

  test('mark emits `==…==`', async () => {
    const { toMarkdownHandlers } = await import('./to-markdown-handlers.ts');
    const node = {
      type: 'mark' as const,
      children: [{ type: 'text' as const, value: 'hello' }],
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
    const out = (toMarkdownHandlers as any).mark(node, undefined, minimalState, {});
    expect(out).toBe('==hello==');
  });
});
