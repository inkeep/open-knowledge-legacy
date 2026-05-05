import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';
import { formatLinkUrl } from './to-markdown-handlers.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

describe('to-markdown: emphasis delimiter preservation', () => {
  test('underscore emphasis round-trips as _', () => {
    expect(roundTrip('_word_\n')).toBe('_word_\n');
  });

  test('asterisk emphasis round-trips as *', () => {
    expect(roundTrip('*word*\n')).toBe('*word*\n');
  });
});

describe('to-markdown: strong delimiter preservation', () => {
  test('double-underscore strong round-trips as __', () => {
    expect(roundTrip('__word__\n')).toBe('__word__\n');
  });

  test('double-asterisk strong round-trips as **', () => {
    expect(roundTrip('**word**\n')).toBe('**word**\n');
  });
});

describe('to-markdown: code block fence preservation', () => {
  test('backtick fence round-trips', () => {
    expect(roundTrip('```js\ncode\n```\n')).toBe('```js\ncode\n```\n');
  });

  test('tilde fence round-trips as ~~~', () => {
    expect(roundTrip('~~~\ncode\n~~~\n')).toBe('~~~\ncode\n~~~\n');
  });

  test('4-backtick fence round-trips', () => {
    expect(roundTrip('````\ncode\n````\n')).toBe('````\ncode\n````\n');
  });

  test('code block with meta round-trips', () => {
    expect(roundTrip('```js title="foo"\nx\n```\n')).toBe('```js title="foo"\nx\n```\n');
  });

  test('code block with meta + multiple lines round-trips', () => {
    expect(roundTrip('```ts {1,3-5}\nline1\nline2\n```\n')).toBe(
      '```ts {1,3-5}\nline1\nline2\n```\n',
    );
  });
});

describe('to-markdown: code block style fenced vs indented (FR-21)', () => {
  test('indented multi-line round-trips byte-equal', () => {
    expect(roundTrip('    code\n    line\n')).toBe('    code\n    line\n');
  });

  test('indented single-line round-trips byte-equal', () => {
    expect(roundTrip('    just one line\n')).toBe('    just one line\n');
  });

  test('indented block followed by paragraph round-trips', () => {
    expect(roundTrip('    code\n\nP after\n')).toBe('    code\n\nP after\n');
  });

  test('paragraph then indented round-trips', () => {
    expect(roundTrip('P before\n\n    code\n')).toBe('P before\n\n    code\n');
  });

  test('fenced block stays fenced (regression check)', () => {
    expect(roundTrip('```\ncode\nline\n```\n')).toBe('```\ncode\nline\n```\n');
  });

  test('fenced block with language stays fenced (regression check)', () => {
    expect(roundTrip('```js\nconsole.log(1)\n```\n')).toBe('```js\nconsole.log(1)\n```\n');
  });

  test('PM JSON carries sourceStyle="indented" attr after parse', () => {
    const json = mdManager.parse('    code\n    line\n');
    type DocLike = { content?: { type: string; attrs?: { sourceStyle?: string } }[] };
    const block = (json as DocLike).content?.[0];
    expect(block?.type).toBe('codeBlock');
    expect(block?.attrs?.sourceStyle).toBe('indented');
  });

  test('PM JSON carries sourceStyle="fenced" attr for fenced input', () => {
    const json = mdManager.parse('```\ncode\n```\n');
    type DocLike = { content?: { type: string; attrs?: { sourceStyle?: string } }[] };
    const block = (json as DocLike).content?.[0];
    expect(block?.type).toBe('codeBlock');
    expect(block?.attrs?.sourceStyle).toBe('fenced');
  });

  test('idempotence: indented round-trip parses identically twice', () => {
    const md = '    code\n    line\n';
    const once = roundTrip(md);
    const twice = roundTrip(once);
    expect(once).toBe(md);
    expect(twice).toBe(md);
  });

  test('WYSIWYG-authored code block (no source) emits fenced by default', () => {
    const schema = getSchema(sharedExtensions);
    const codeBlock = schema.nodeType('codeBlock');
    const docNode = schema.nodes.doc.create(
      null,
      codeBlock.create({ language: null, fenceDelimiter: '`', fenceLength: 3, meta: null }, [
        schema.text('hello'),
      ]),
    );
    const out = mdManager.serialize(docNode.toJSON());
    expect(out).toBe('```\nhello\n```\n');
  });

  test('explicit sourceStyle="indented" on synthesized PM tree emits indented', () => {
    const schema = getSchema(sharedExtensions);
    const codeBlock = schema.nodeType('codeBlock');
    const docNode = schema.nodes.doc.create(
      null,
      codeBlock.create(
        {
          language: null,
          fenceDelimiter: '`',
          fenceLength: 3,
          meta: null,
          sourceStyle: 'indented',
        },
        [schema.text('hello\nworld')],
      ),
    );
    const out = mdManager.serialize(docNode.toJSON());
    expect(out).toBe('    hello\n    world\n');
  });

  test('indented block does NOT promote inside a list item (root-only scope)', () => {
    const md = '- list item\n\n    continuation paragraph (not code)\n';
    const out = roundTrip(md);
    const json = mdManager.parse(out) as { content?: { type: string }[] };
    const hasIndentedCodeBlock = (json.content ?? []).some((n) => n.type === 'codeBlock');
    expect(hasIndentedCodeBlock).toBe(false);
  });
});

describe('to-markdown: inline code fence preservation (FR-1, FR-2)', () => {
  test('single backtick wrapping round-trips byte-equal', () => {
    expect(roundTrip('`x`\n')).toBe('`x`\n');
  });

  test('multi-word inline code round-trips', () => {
    expect(roundTrip('`hello world`\n')).toBe('`hello world`\n');
  });

  test('double-backtick fence with simple value round-trips', () => {
    expect(roundTrip('``x``\n')).toBe('``x``\n');
  });

  test('content containing single backtick uses double fence + spaces', () => {
    expect(roundTrip('`` `x` ``\n')).toBe('`` `x` ``\n');
  });

  test('triple-backtick fence with no internal backticks round-trips', () => {
    expect(roundTrip('```x```\n')).toBe('```x```\n');
  });

  test('inline code inside emphasis round-trips', () => {
    expect(roundTrip('*`x`*\n')).toBe('*`x`*\n');
  });

  test('inline code inside strong round-trips', () => {
    expect(roundTrip('**`x`**\n')).toBe('**`x`**\n');
  });

  test('inline code inside link round-trips', () => {
    expect(roundTrip('[`x`](u)\n')).toBe('[`x`](u)\n');
  });
});

describe('to-markdown: lone backtick in text NOT escaped (FR-1d)', () => {
  test('single literal backtick mid-paragraph round-trips', () => {
    expect(roundTrip('type a ` here\n')).toBe('type a ` here\n');
  });

  test('odd-count backticks (unmatched run) round-trip as literal text', () => {
    expect(roundTrip('a ` b `` c\n')).toBe('a ` b `` c\n');
  });

  test('escaped backtick still survives via escapedChars', () => {
    expect(roundTrip('\\`escaped\\`\n')).toBe('\\`escaped\\`\n');
  });

  test('lone backtick at line start round-trips', () => {
    expect(roundTrip('` start of line\n')).toBe('` start of line\n');
  });
});

describe('to-markdown: thematic break preservation', () => {
  test('doc-start --- normalizes to *** (NG10 serialize-side)', () => {
    expect(roundTrip('---\n')).toBe('***\n');
  });

  test('*** round-trips as ***', () => {
    expect(roundTrip('***\n')).toBe('***\n');
  });

  test('non-doc-start --- preserves sourceRaw', () => {
    expect(roundTrip('paragraph\n\n---\n\nmore\n')).toBe('paragraph\n\n---\n\nmore\n');
  });
});

describe('to-markdown: hard break style', () => {
  test('backslash hard break round-trips', () => {
    expect(roundTrip('line\\\nbreak\n')).toBe('line\\\nbreak\n');
  });
});

describe('to-markdown: heading style', () => {
  test('ATX heading round-trips', () => {
    expect(roundTrip('## Title\n')).toBe('## Title\n');
  });
});

describe('to-markdown: ATX heading trailing hashes (FR-15)', () => {
  test('no trailing hashes stays bare', () => {
    expect(roundTrip('# H\n')).toBe('# H\n');
  });

  test('matching count round-trips byte-equal', () => {
    expect(roundTrip('## H ##\n')).toBe('## H ##\n');
  });

  test('asymmetric count preserves the closer length', () => {
    expect(roundTrip('## H #####\n')).toBe('## H #####\n');
    expect(roundTrip('### asymmetric trail #\n')).toBe('### asymmetric trail #\n');
  });

  test('all six heading levels with matching closers round-trip', () => {
    expect(roundTrip('# A #\n')).toBe('# A #\n');
    expect(roundTrip('## B ##\n')).toBe('## B ##\n');
    expect(roundTrip('### C ###\n')).toBe('### C ###\n');
    expect(roundTrip('#### D ####\n')).toBe('#### D ####\n');
    expect(roundTrip('##### E #####\n')).toBe('##### E #####\n');
    expect(roundTrip('###### F ######\n')).toBe('###### F ######\n');
  });

  test('empty content with trailing closer round-trips', () => {
    expect(roundTrip('# ###\n')).toBe('# ###\n');
    expect(roundTrip('## ###\n')).toBe('## ###\n');
  });

  test('hash without space before is content (CommonMark §4.2 — no closer)', () => {
    expect(roundTrip('## H#\n')).toBe('## H#\n');
    expect(roundTrip('## abrupt##\n')).toBe('## abrupt##\n');
  });

  test('PM attrs carry sourceTrailingHashes through the round-trip', () => {
    const json = mdManager.parse('### H ####\n');
    const heading = (json.content ?? []).find((n) => n.type === 'heading');
    expect(heading).toBeTruthy();
    expect(heading?.attrs?.headingStyle).toBe('atx');
    expect(heading?.attrs?.sourceTrailingHashes).toBe(4);
  });

  test('PM attrs default to null when no trailing closer', () => {
    const json = mdManager.parse('### Plain heading\n');
    const heading = (json.content ?? []).find((n) => n.type === 'heading');
    expect(heading?.attrs?.sourceTrailingHashes).toBeNull();
  });

  test('headings authored from WYSIWYG (no source) emit bare ATX', () => {
    const synthesized = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'WYSIWYG title' }],
        },
      ],
    };
    expect(mdManager.serialize(synthesized)).toBe('## WYSIWYG title\n');
  });

  test('explicit sourceTrailingHashes=0 attr emits bare ATX', () => {
    const synthesized = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, headingStyle: 'atx', sourceTrailingHashes: 0 },
          content: [{ type: 'text', text: 'zero' }],
        },
      ],
    };
    expect(mdManager.serialize(synthesized)).toBe('# zero\n');
  });

  test('explicit sourceTrailingHashes attr is honored on synthesized PM tree', () => {
    const synthesized = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3, headingStyle: 'atx', sourceTrailingHashes: 2 },
          content: [{ type: 'text', text: 'manual closer' }],
        },
      ],
    };
    expect(mdManager.serialize(synthesized)).toBe('### manual closer ##\n');
  });

  test('setext heading style still wins when sourceStyle=setext', () => {
    const synthesized = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, headingStyle: 'setext', sourceTrailingHashes: 3 },
          content: [{ type: 'text', text: 'Setext H' }],
        },
      ],
    };
    expect(mdManager.serialize(synthesized)).toBe('Setext H\n========\n');
  });
});

describe('to-markdown: setext heading underline length (FR-22)', () => {
  test('H1 with 5-char underline round-trips byte-equal', () => {
    expect(roundTrip('H\n=====\n')).toBe('H\n=====\n');
  });

  test('H1 with 1-char underline (CommonMark §4.3 minimum) round-trips', () => {
    expect(roundTrip('H\n=\n')).toBe('H\n=\n');
  });

  test('H1 with 11-char underline round-trips', () => {
    expect(roundTrip('H\n===========\n')).toBe('H\n===========\n');
  });

  test('H2 with 5-char underline round-trips byte-equal', () => {
    expect(roundTrip('H\n-----\n')).toBe('H\n-----\n');
  });

  test('H2 with 1-char underline round-trips', () => {
    expect(roundTrip('H\n-\n')).toBe('H\n-\n');
  });

  test('H2 with 11-char underline round-trips', () => {
    expect(roundTrip('H\n-----------\n')).toBe('H\n-----------\n');
  });

  test('long content with short underline round-trips byte-equal', () => {
    expect(roundTrip('this is a long heading\n===\n')).toBe('this is a long heading\n===\n');
  });

  test('content == underline length round-trips (no-change case)', () => {
    expect(roundTrip('short\n=====\n')).toBe('short\n=====\n');
  });

  test('PM tree carries sourceUnderlineLength attr', () => {
    const json = mdManager.parse('H\n=====\n') as {
      content: Array<{ type: string; attrs: { sourceUnderlineLength: unknown } }>;
    };
    expect(json.content[0].type).toBe('heading');
    expect(json.content[0].attrs.sourceUnderlineLength).toBe(5);
  });

  test('ATX heading does NOT get sourceUnderlineLength attr', () => {
    const json = mdManager.parse('# H\n') as {
      content: Array<{ type: string; attrs: { sourceUnderlineLength: unknown } }>;
    };
    expect(json.content[0].type).toBe('heading');
    expect(json.content[0].attrs.sourceUnderlineLength).toBeNull();
  });

  test('synthesized PM tree without sourceUnderlineLength falls back to library default', () => {
    const synthesized = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, headingStyle: 'setext', sourceUnderlineLength: null },
          content: [{ type: 'text', text: 'WYSIWYG' }],
        },
      ],
    };
    expect(mdManager.serialize(synthesized)).toBe('WYSIWYG\n=======\n');
  });

  test('explicit sourceUnderlineLength on synthesized PM tree is honored', () => {
    const synthesized = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, headingStyle: 'setext', sourceUnderlineLength: 7 },
          content: [{ type: 'text', text: 'Hi' }],
        },
      ],
    };
    expect(mdManager.serialize(synthesized)).toBe('Hi\n-------\n');
  });

  test('idempotence: parse → serialize → parse → serialize matches first round', () => {
    const inputs = ['H\n=====\n', 'H\n-\n', 'this is a long heading\n===\n', 'short\n=====\n'];
    for (const input of inputs) {
      const r1 = roundTrip(input);
      const r2 = roundTrip(r1);
      expect(r2).toBe(r1);
    }
  });

  test('bridge invariant byte-equal WITHOUT tolerance class — setext H1 5-char', async () => {
    const { normalizeBridge } = await import('../bridge/normalize.ts');
    const input = 'H\n=====\n';
    const output = roundTrip(input);
    expect(normalizeBridge(input)).toBe(normalizeBridge(output));
    expect(input).toBe(output);
  });

  test('bridge invariant byte-equal WITHOUT tolerance class — setext H2 11-char', async () => {
    const { normalizeBridge } = await import('../bridge/normalize.ts');
    const input = 'H\n-----------\n';
    const output = roundTrip(input);
    expect(normalizeBridge(input)).toBe(normalizeBridge(output));
    expect(input).toBe(output);
  });
});

describe('to-markdown: list marker preservation', () => {
  test('dash bullet round-trips', () => {
    expect(roundTrip('- item one\n- item two\n')).toBe('- item one\n- item two\n');
  });

  test('plus bullet round-trips', () => {
    expect(roundTrip('+ item one\n+ item two\n')).toBe('+ item one\n+ item two\n');
  });

  test('asterisk bullet round-trips', () => {
    expect(roundTrip('* item one\n* item two\n')).toBe('* item one\n* item two\n');
  });
});

describe('to-markdown: text handler (NG5 fidelity)', () => {
  test('literal & in text survives round-trip', () => {
    expect(roundTrip('H&M Store\n')).toBe('H&M Store\n');
  });

  test('literal < in text survives round-trip', () => {
    expect(roundTrip('a < b\n')).toBe('a < b\n');
  });

  test('literal [ in prose survives round-trip', () => {
    expect(roundTrip('text [ more\n')).toBe('text [ more\n');
  });

  test('literal trailing backslash runs stay literal text', () => {
    const triple = '\\'.repeat(3);
    expect(roundTrip('\\\n')).toBe('\\\n');
    expect(roundTrip('text \\\n')).toBe('text \\\n');
    expect(roundTrip(`${triple}\n`)).toBe(`${triple}\n`);
    expect(roundTrip(`text ${triple}\n`)).toBe(`text ${triple}\n`);
  });

  test('escaped bracket plus trailing backslash round-trips verbatim', () => {
    const trailing = '\\';
    expect(roundTrip(`\\[text${trailing}\n`)).toBe(`\\[text${trailing}\n`);
  });

  test('unfinished link label stays literal text', () => {
    expect(roundTrip('[foo]\n')).toBe('[foo]\n');
  });

  test('unfinished wiki-link stays literal text', () => {
    expect(roundTrip('[[Page\n')).toBe('[[Page\n');
  });

  test('empty-label inline link stays literal text', () => {
    expect(roundTrip('[]()\n')).toBe('[]()\n');
    expect(roundTrip('[](x)\n')).toBe('[](x)\n');
  });

  test('unfinished link destination stays literal text', () => {
    expect(roundTrip('[foo](\n')).toBe('[foo](\n');
  });
});

describe('to-markdown: link URL preservation', () => {
  test('URL with & survives round-trip', () => {
    const md = '[link](https://example.com?a=1&b=2)\n';
    expect(roundTrip(md)).toBe(md);
  });
});

describe('to-markdown: formatLinkUrl unit', () => {
  test('empty URL → empty', () => {
    expect(formatLinkUrl('')).toBe('');
  });

  test('plain URL without special chars → verbatim', () => {
    expect(formatLinkUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  test('URL with balanced parens → verbatim', () => {
    expect(formatLinkUrl('http://example.com/(paren)')).toBe('http://example.com/(paren)');
  });

  test('URL with deeply nested balanced parens → verbatim', () => {
    expect(formatLinkUrl('a((b)(c))d')).toBe('a((b)(c))d');
  });

  test('URL with unbalanced opening parens → escape all parens', () => {
    expect(formatLinkUrl('foo(and(bar)')).toBe('foo\\(and\\(bar\\)');
  });

  test('URL with unbalanced closing paren → escape all parens', () => {
    expect(formatLinkUrl('a)b')).toBe('a\\)b');
  });

  test('URL with literal angle chars + balanced parens → verbatim', () => {
    expect(formatLinkUrl('<url>')).toBe('<url>');
    expect(formatLinkUrl('foo<bar')).toBe('foo<bar');
    expect(formatLinkUrl('foo>bar')).toBe('foo>bar');
  });

  test('URL with backslash but balanced parens → verbatim', () => {
    expect(formatLinkUrl('foo\\bar')).toBe('foo\\bar');
  });

  test('URL with backslash AND unbalanced parens → escape backslash too', () => {
    expect(formatLinkUrl('foo\\(bar')).toBe('foo\\\\\\(bar');
  });
});

describe('to-markdown: link handler URL parity (US-010 R6b)', () => {
  test('link with unbalanced escaped parens round-trips byte-identically', () => {
    const md = '[link](foo\\(and\\(bar\\))\n';
    expect(roundTrip(md)).toBe(md);
    expect(roundTrip(roundTrip(md))).toBe(roundTrip(md));
  });

  test('link with balanced parens preserves verbatim', () => {
    const md = '[link](http://example.com/(paren))\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('link with literal angle chars in URL value', () => {
    const md = '[link](<url>)\n';
    expect(roundTrip(md)).toBe(md);
    expect(roundTrip(roundTrip(md))).toBe(roundTrip(md));
  });

  test('autolink form (sourceStyle=autolink) preserved as <url>', () => {
    const md = '<https://example.com>\n';
    expect(roundTrip(md)).toBe(md);
  });
});

describe('to-markdown: image handler URL parity (US-010 R6c)', () => {
  test('image with angle-bracket URL form round-trips byte-identically', () => {
    const md = '![foo](<url>)\n';
    expect(roundTrip(md)).toBe(md);
    expect(roundTrip(roundTrip(md))).toBe(roundTrip(md));
  });

  test('plain image URL round-trips verbatim', () => {
    const md = '![alt](http://example.com/img.png)\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('image URL with balanced parens preserves verbatim', () => {
    const md = '![alt](http://example.com/(image).png)\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('image with title preserves title quoting', () => {
    const md = '![alt](http://example.com/img.png "title")\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('image with empty alt round-trips', () => {
    const md = '![](http://example.com/img.png)\n';
    expect(roundTrip(md)).toBe(md);
  });
});

describe('to-markdown: GFM table alignment (FR-13)', () => {
  test('default alignment (no markers) round-trips with - markers', () => {
    expect(roundTrip('| a | b |\n| - | - |\n| 1 | 2 |\n')).toBe(
      '| a | b |\n| - | - |\n| 1 | 2 |\n',
    );
  });

  test('left alignment :-- round-trips', () => {
    expect(roundTrip('| a | b |\n| :- | :- |\n| 1 | 2 |\n')).toBe(
      '| a | b |\n| :- | :- |\n| 1 | 2 |\n',
    );
  });

  test('center alignment :-: round-trips', () => {
    expect(roundTrip('| a | b |\n| :-: | :-: |\n| 1 | 2 |\n')).toBe(
      '| a | b |\n| :-: | :-: |\n| 1 | 2 |\n',
    );
  });

  test('right alignment -: round-trips', () => {
    expect(roundTrip('| a | b |\n| -: | -: |\n| 1 | 2 |\n')).toBe(
      '| a | b |\n| -: | -: |\n| 1 | 2 |\n',
    );
  });

  test('mixed alignment per column round-trips', () => {
    expect(roundTrip('| a | b | c |\n| :- | :-: | -: |\n| L | C | R |\n')).toBe(
      '| a | b | c |\n| :- | :-: | -: |\n| L | C | R |\n',
    );
  });

  test('alignment survives multiple body rows', () => {
    const md = '| a | b |\n| :-: | -: |\n| 1 | 2 |\n| 3 | 4 |\n';
    expect(roundTrip(md)).toBe(md);
  });
});

describe('to-markdown: GFM table header semantics (FR-14)', () => {
  test('first-row cells materialize as tableHeader PM nodes', () => {
    const json = mdManager.parse('| a | b |\n| - | - |\n| 1 | 2 |\n');
    const table = json.content?.[0];
    expect(table?.type).toBe('table');
    const firstRow = table?.content?.[0];
    expect(firstRow?.type).toBe('tableRow');
    const firstRowCells = firstRow?.content ?? [];
    expect(firstRowCells.every((c) => c?.type === 'tableHeader')).toBe(true);
    const secondRow = table?.content?.[1];
    const secondRowCells = secondRow?.content ?? [];
    expect(secondRowCells.every((c) => c?.type === 'tableCell')).toBe(true);
  });

  test('header semantics preserved across round-trip with alignment', () => {
    const md = '| Header A | Header B |\n| :-: | -: |\n| body 1 | body 2 |\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('single-row header-only table round-trips', () => {
    const md = '| a | b |\n| - | - |\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('first-row cells carry their column align attr', () => {
    const json = mdManager.parse('| a | b | c |\n| :- | :-: | -: |\n| L | C | R |\n');
    const headerCells = json.content?.[0]?.content?.[0]?.content ?? [];
    expect(headerCells[0]?.attrs?.align).toBe('left');
    expect(headerCells[1]?.attrs?.align).toBe('center');
    expect(headerCells[2]?.attrs?.align).toBe('right');
  });

  test('body-row cells carry their column align attr', () => {
    const json = mdManager.parse('| a | b | c |\n| :- | :-: | -: |\n| L | C | R |\n');
    const bodyCells = json.content?.[0]?.content?.[1]?.content ?? [];
    expect(bodyCells[0]?.attrs?.align).toBe('left');
    expect(bodyCells[1]?.attrs?.align).toBe('center');
    expect(bodyCells[2]?.attrs?.align).toBe('right');
  });
});

describe('to-markdown: GFM table column-padding control (FR-16)', () => {
  test('center-aligned :---: with 3 dashes round-trips byte-equal regardless of cell width', () => {
    expect(roundTrip('| x |\n| :---: |\n| 1234 |\n')).toBe('| x |\n| :---: |\n| 1234 |\n');
  });

  test('5-dash centered alignment row :-----: round-trips', () => {
    expect(roundTrip('| col |\n| :-----: |\n| body |\n')).toBe('| col |\n| :-----: |\n| body |\n');
  });

  test('1-dash canonical-min :-: round-trips', () => {
    expect(roundTrip('| col |\n| :-: |\n| body |\n')).toBe('| col |\n| :-: |\n| body |\n');
  });

  test('left-aligned :-- with various dash counts preserves user count', () => {
    expect(roundTrip('| col |\n| :--- |\n| body |\n')).toBe('| col |\n| :--- |\n| body |\n');
    expect(roundTrip('| col |\n| :- |\n| body |\n')).toBe('| col |\n| :- |\n| body |\n');
  });

  test('right-aligned --: with various dash counts preserves user count', () => {
    expect(roundTrip('| col |\n| ---: |\n| body |\n')).toBe('| col |\n| ---: |\n| body |\n');
    expect(roundTrip('| col |\n| -: |\n| body |\n')).toBe('| col |\n| -: |\n| body |\n');
  });

  test('unaligned --- with various dash counts preserves user count', () => {
    expect(roundTrip('| col |\n| --- |\n| body |\n')).toBe('| col |\n| --- |\n| body |\n');
    expect(roundTrip('| col |\n| ------ |\n| body |\n')).toBe('| col |\n| ------ |\n| body |\n');
    expect(roundTrip('| col |\n| - |\n| body |\n')).toBe('| col |\n| - |\n| body |\n');
  });

  test('per-column dash counts can differ across columns', () => {
    const md = '| a | b | c |\n| - | --- | ----- |\n| 1 | 2 | 3 |\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('per-column alignment + per-column dash count both preserved', () => {
    const md = '| a | b | c |\n| :--- | :----: | -----: |\n| 1 | 2 | 3 |\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('cell-content alignment within rows preserved (existing behavior)', () => {
    const json = mdManager.parse('| col |\n| :---: |\n| body |\n');
    const table = json.content?.[0];
    expect(table?.type).toBe('table');
    expect(table?.attrs?.sourceDashCounts).toEqual([3]);
  });

  test('WYSIWYG-authored table (no source) emits canonical 1-dash markers', () => {
    const json = mdManager.parse('| a |\n| --- |\n| 1 |\n');
    const table = json.content?.[0];
    expect(table?.attrs?.sourceDashCounts).toEqual([3]);

    const tableNode = table;
    if (tableNode) {
      tableNode.attrs = { ...tableNode.attrs, sourceDashCounts: null };
    }
    expect(mdManager.serialize(json)).toBe('| a |\n| - |\n| 1 |\n');
  });

  test('explicit empty array sourceDashCounts falls through to canonical-min', () => {
    const json = mdManager.parse('| a |\n| --- |\n| 1 |\n');
    const tableNode = json.content?.[0];
    if (tableNode) {
      tableNode.attrs = { ...tableNode.attrs, sourceDashCounts: [] };
    }
    expect(mdManager.serialize(json)).toBe('| a |\n| - |\n| 1 |\n');
  });

  test('sourceDashCounts persists through PM JSON round-trip', () => {
    const json = mdManager.parse('| col |\n| :----: |\n| body |\n');
    const table = json.content?.[0];
    expect(table?.attrs?.sourceDashCounts).toEqual([4]);
  });
});

describe('to-markdown: GFM bare-URL autolink (FR-17)', () => {
  test('bare https URL in paragraph round-trips byte-equal', () => {
    expect(roundTrip('Visit https://example.com today.\n')).toBe(
      'Visit https://example.com today.\n',
    );
  });

  test('bare http URL round-trips byte-equal', () => {
    expect(roundTrip('see http://x.com path\n')).toBe('see http://x.com path\n');
  });

  test('bare URL with query string round-trips byte-equal', () => {
    expect(roundTrip('see https://x.com?query=1\n')).toBe('see https://x.com?query=1\n');
  });

  test('bare URL with fragment round-trips byte-equal', () => {
    expect(roundTrip('see https://x.com#frag\n')).toBe('see https://x.com#frag\n');
  });

  test('bare URL with path round-trips byte-equal', () => {
    expect(roundTrip('see https://x.com/path/to/page\n')).toBe('see https://x.com/path/to/page\n');
  });

  test('bare URL standalone (no surrounding text) round-trips byte-equal', () => {
    expect(roundTrip('https://x.com\n')).toBe('https://x.com\n');
  });

  test('bare email autolink round-trips byte-equal as mailto-stripped form', () => {
    expect(roundTrip('reach a@b.com\n')).toBe('reach a@b.com\n');
  });

  test('bare www host round-trips byte-equal as www-prefix-stripped form', () => {
    expect(roundTrip('use www.example.com today\n')).toBe('use www.example.com today\n');
  });

  test('bare URL with trailing punctuation round-trips byte-equal', () => {
    expect(roundTrip('see https://x.com.\n')).toBe('see https://x.com.\n');
    expect(roundTrip('see https://x.com,\n')).toBe('see https://x.com,\n');
    expect(roundTrip('see https://x.com)\n')).toBe('see https://x.com)\n');
    expect(roundTrip('see https://x.com!\n')).toBe('see https://x.com!\n');
  });

  test('bare URL inside parens round-trips byte-equal', () => {
    expect(roundTrip('see (https://x.com)\n')).toBe('see (https://x.com)\n');
  });

  test('multiple bare URLs in one paragraph round-trip byte-equal', () => {
    expect(roundTrip('a https://x.com and https://y.com here\n')).toBe(
      'a https://x.com and https://y.com here\n',
    );
  });

  test('bare URL inside emphasis round-trips byte-equal', () => {
    expect(roundTrip('_em https://x.com em_\n')).toBe('_em https://x.com em_\n');
  });

  test('bare URL inside strong round-trips byte-equal', () => {
    expect(roundTrip('__strong https://x.com strong__\n')).toBe(
      '__strong https://x.com strong__\n',
    );
  });

  test('bare URL inside list item round-trips byte-equal', () => {
    expect(roundTrip('- https://x.com\n- https://y.com\n')).toBe(
      '- https://x.com\n- https://y.com\n',
    );
  });

  test('bare URL inside blockquote round-trips byte-equal', () => {
    expect(roundTrip('> https://x.com\n')).toBe('> https://x.com\n');
  });

  test('bare URL inside heading round-trips byte-equal', () => {
    expect(roundTrip('## https://x.com\n')).toBe('## https://x.com\n');
  });

  test('mixed angle-bracket + bare in same paragraph both round-trip byte-equal', () => {
    expect(roundTrip('see <https://x.com> and https://x.com bare\n')).toBe(
      'see <https://x.com> and https://x.com bare\n',
    );
  });

  test('explicit inline link [text](url) where text===url stays inline form', () => {
    expect(roundTrip('[https://x.com](https://x.com)\n')).toBe('[https://x.com](https://x.com)\n');
  });

  test('explicit inline link with title stays inline form (defensive vs gfm-autolink)', () => {
    expect(roundTrip('[click](https://x.com "title")\n')).toBe('[click](https://x.com "title")\n');
  });

  test('explicit inline link [text](url) where text != url stays inline form', () => {
    expect(roundTrip('[click here](https://example.com)\n')).toBe(
      '[click here](https://example.com)\n',
    );
  });

  test('bare URL round-trip is idempotent', () => {
    const input = 'Visit https://example.com today.\n';
    const r1 = roundTrip(input);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
  });

  test('bare URL paragraph followed by another paragraph round-trips byte-equal', () => {
    expect(roundTrip('https://x.com\n\nP2\n')).toBe('https://x.com\n\nP2\n');
  });

  test('PM mark linkStyle is gfm-autolink for bare URLs', () => {
    const json = mdManager.parse('Visit https://example.com today\n');
    function findLinkMark(n: unknown): unknown {
      if (typeof n !== 'object' || n === null) return null;
      const node = n as { marks?: unknown[]; content?: unknown[] };
      if (Array.isArray(node.marks)) {
        for (const m of node.marks) {
          const mark = m as { type?: string };
          if (mark.type === 'link') return m;
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          const found = findLinkMark(child);
          if (found) return found;
        }
      }
      return null;
    }
    const mark = findLinkMark(json) as { attrs?: Record<string, unknown> } | null;
    expect(mark?.attrs?.linkStyle).toBe('gfm-autolink');
    expect(mark?.attrs?.href).toBe('https://example.com');
  });

  test('PM mark linkStyle is inline (NOT gfm-autolink) for explicit [text](url) form', () => {
    const json = mdManager.parse('[https://x.com](https://x.com)\n');
    function findLinkMark(n: unknown): unknown {
      if (typeof n !== 'object' || n === null) return null;
      const node = n as { marks?: unknown[]; content?: unknown[] };
      if (Array.isArray(node.marks)) {
        for (const m of node.marks) {
          const mark = m as { type?: string };
          if (mark.type === 'link') return m;
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          const found = findLinkMark(child);
          if (found) return found;
        }
      }
      return null;
    }
    const mark = findLinkMark(json) as { attrs?: Record<string, unknown> } | null;
    expect(mark?.attrs?.linkStyle).toBe('inline');
  });

  test('autolink form remains <url> when both forms appear in same doc', () => {
    expect(roundTrip('<https://example.com>\n')).toBe('<https://example.com>\n');
  });
});

describe('to-markdown: image reference (FR-18)', () => {
  test('full image reference round-trips byte-equal', () => {
    expect(roundTrip('![alt][ref]\n\n[ref]: https://x.com/img.png\n')).toBe(
      '![alt][ref]\n\n[ref]: https://x.com/img.png\n',
    );
  });

  test('collapsed image reference round-trips byte-equal', () => {
    expect(roundTrip('![ref][]\n\n[ref]: https://x.com/img.png\n')).toBe(
      '![ref][]\n\n[ref]: https://x.com/img.png\n',
    );
  });

  test('shortcut image reference round-trips byte-equal', () => {
    expect(roundTrip('![ref]\n\n[ref]: https://x.com/img.png\n')).toBe(
      '![ref]\n\n[ref]: https://x.com/img.png\n',
    );
  });

  test('full image reference with title preserves title bytes', () => {
    expect(roundTrip('![alt][ref]\n\n[ref]: https://x.com/img.png "title"\n')).toBe(
      '![alt][ref]\n\n[ref]: https://x.com/img.png "title"\n',
    );
  });

  test('inline image control case is unaffected (jsxComponent path)', () => {
    expect(roundTrip('![alt](https://x.com/img.png)\n')).toBe('![alt](https://x.com/img.png)\n');
  });

  test('image reference inside a paragraph keeps surrounding text', () => {
    expect(roundTrip('Look at ![alt][ref] inline.\n\n[ref]: https://x.com/img.png\n')).toBe(
      'Look at ![alt][ref] inline.\n\n[ref]: https://x.com/img.png\n',
    );
  });

  test('multiple image references sharing one definition round-trip', () => {
    expect(roundTrip('![alt1][ref] ![alt2][ref]\n\n[ref]: https://x.com/img.png\n')).toBe(
      '![alt1][ref] ![alt2][ref]\n\n[ref]: https://x.com/img.png\n',
    );
  });

  test('case-mixed identifier label preserved (e.g., [Ref])', () => {
    expect(roundTrip('![alt][Ref]\n\n[Ref]: https://x.com/img.png\n')).toBe(
      '![alt][Ref]\n\n[Ref]: https://x.com/img.png\n',
    );
  });

  test('image reference inside emphasis round-trips', () => {
    expect(roundTrip('*![alt][ref]*\n\n[ref]: https://x.com/img.png\n')).toBe(
      '*![alt][ref]*\n\n[ref]: https://x.com/img.png\n',
    );
  });

  test('round-trip is idempotent for image references', () => {
    const input = '![alt][ref]\n\n[ref]: https://x.com/img.png\n';
    const r1 = roundTrip(input);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
  });

  test('PM atom carries label + identifier + referenceType attrs', () => {
    const json = mdManager.parse('![alt][Ref]\n\n[Ref]: https://x.com/img.png\n');
    function findImageRef(n: unknown): { attrs?: Record<string, unknown> } | null {
      if (!n || typeof n !== 'object') return null;
      const node = n as { type?: string; content?: unknown[]; attrs?: Record<string, unknown> };
      if (node.type === 'imageReference') return node;
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          const found = findImageRef(child);
          if (found) return found;
        }
      }
      return null;
    }
    const ref = findImageRef(json);
    expect(ref?.attrs?.label).toBe('Ref');
    expect(ref?.attrs?.identifier).toBe('ref');
    expect(ref?.attrs?.alt).toBe('alt');
    expect(ref?.attrs?.referenceType).toBe('full');
  });

  test('plain inline image stays as inline image (image node, not imageReference)', () => {
    const json = mdManager.parse('![alt](https://x.com/img.png)\n');
    function hasImageReference(n: unknown): boolean {
      if (!n || typeof n !== 'object') return false;
      const node = n as { type?: string; content?: unknown[] };
      if (node.type === 'imageReference') return true;
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          if (hasImageReference(child)) return true;
        }
      }
      return false;
    }
    expect(hasImageReference(json)).toBe(false);
  });

  test('image reference with empty alt and shortcut form round-trips', () => {
    expect(roundTrip('![image label]\n\n[image label]: /img.png\n')).toBe(
      '![image label]\n\n[image label]: /img.png\n',
    );
  });
});

describe('to-markdown: link URL angle-bracket form (FR-19)', () => {
  test('inline link bare URL round-trips bare', () => {
    expect(roundTrip('[link](https://example.com)\n')).toBe('[link](https://example.com)\n');
  });

  test('inline link with angle-bracketed URL round-trips angle-bracketed', () => {
    expect(roundTrip('[link](<https://example.com>)\n')).toBe('[link](<https://example.com>)\n');
  });

  test('autolink standalone <url> stays angle-bracketed (linkStyle=autolink path)', () => {
    expect(roundTrip('<https://example.com>\n')).toBe('<https://example.com>\n');
  });

  test('GFM bare URL standalone stays bare (linkStyle=gfm-autolink path)', () => {
    expect(roundTrip('visit https://example.com today\n')).toBe(
      'visit https://example.com today\n',
    );
  });

  test('angle-bracketed URL with internal space (impossible bare) round-trips', () => {
    expect(roundTrip('[link](<http://example.com/foo bar>)\n')).toBe(
      '[link](<http://example.com/foo bar>)\n',
    );
  });

  test('angle-bracketed empty URL `<>` round-trips', () => {
    expect(roundTrip('[link](<>)\n')).toBe('[link](<>)\n');
  });

  test('multiple links with mixed URL forms round-trip in same paragraph', () => {
    const input = 'See [a](https://x.com) and [b](<https://y.com>) inline.\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('PM mark carries sourceUrlForm=angle-bracketed for [text](<url>)', () => {
    const json = mdManager.parse('[link](<https://x.com>)\n');
    function findLinkMark(n: unknown): { attrs?: Record<string, unknown> } | null {
      if (!n || typeof n !== 'object') return null;
      const node = n as {
        type?: string;
        content?: unknown[];
        marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
      };
      const found = node.marks?.find?.((m) => m.type === 'link');
      if (found) return found;
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          const m = findLinkMark(child);
          if (m) return m;
        }
      }
      return null;
    }
    const mark = findLinkMark(json);
    expect(mark?.attrs?.sourceUrlForm).toBe('angle-bracketed');
  });

  test('PM mark sourceUrlForm defaults null for `[text](url)` form', () => {
    const json = mdManager.parse('[link](https://x.com)\n');
    function findLinkMark(n: unknown): { attrs?: Record<string, unknown> } | null {
      if (!n || typeof n !== 'object') return null;
      const node = n as {
        type?: string;
        content?: unknown[];
        marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
      };
      const found = node.marks?.find?.((m) => m.type === 'link');
      if (found) return found;
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          const m = findLinkMark(child);
          if (m) return m;
        }
      }
      return null;
    }
    const mark = findLinkMark(json);
    expect(mark?.attrs?.sourceUrlForm).toBe(null);
  });

  test('round-trip is idempotent for angle-bracketed inline links', () => {
    const input = '[link](<https://x.com>)\n';
    const r1 = roundTrip(input);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
  });
});

describe('to-markdown: link title quote-style (FR-20)', () => {
  test('double-quote title round-trips with double quotes', () => {
    expect(roundTrip('[link](https://x.com "title")\n')).toBe('[link](https://x.com "title")\n');
  });

  test('single-quote title round-trips with single quotes', () => {
    expect(roundTrip("[link](https://x.com 'title')\n")).toBe("[link](https://x.com 'title')\n");
  });

  test('paren title round-trips with parens', () => {
    expect(roundTrip('[link](https://x.com (title))\n')).toBe('[link](https://x.com (title))\n');
  });

  test("single-quote title with internal `\\'` escape round-trips", () => {
    expect(roundTrip("[link](https://x.com 'it\\'s')\n")).toBe("[link](https://x.com 'it\\'s')\n");
  });

  test('double-quote title with internal `\\"` escape round-trips', () => {
    expect(roundTrip('[link](https://x.com "say \\"hi\\"")\n')).toBe(
      '[link](https://x.com "say \\"hi\\"")\n',
    );
  });

  test('paren title with internal `\\(` `\\)` escapes round-trips', () => {
    expect(roundTrip('[link](https://x.com (a\\(b\\)c))\n')).toBe(
      '[link](https://x.com (a\\(b\\)c))\n',
    );
  });

  test('single-quote title containing literal double-quote stays untouched', () => {
    expect(roundTrip(`[link](https://x.com 'a "quoted" t')\n`)).toBe(
      `[link](https://x.com 'a "quoted" t')\n`,
    );
  });

  test('double-quote title containing literal single-quote stays untouched', () => {
    expect(roundTrip(`[link](https://x.com "it's fine")\n`)).toBe(
      `[link](https://x.com "it's fine")\n`,
    );
  });

  test('paren title containing literal single + double quotes stays untouched', () => {
    expect(roundTrip(`[link](https://x.com (it's "fine"))\n`)).toBe(
      `[link](https://x.com (it's "fine"))\n`,
    );
  });

  test('angle-bracketed URL combined with single-quote title round-trips', () => {
    expect(roundTrip("[link](<https://x.com> 'title')\n")).toBe(
      "[link](<https://x.com> 'title')\n",
    );
  });

  test('angle-bracketed URL combined with paren title round-trips', () => {
    expect(roundTrip('[link](<https://x.com> (title))\n')).toBe(
      '[link](<https://x.com> (title))\n',
    );
  });

  test("PM mark carries sourceTitleMarker=single for `'title'` form", () => {
    const json = mdManager.parse("[link](https://x.com 'a')\n");
    function findLinkMark(n: unknown): { attrs?: Record<string, unknown> } | null {
      if (!n || typeof n !== 'object') return null;
      const node = n as {
        type?: string;
        content?: unknown[];
        marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
      };
      const found = node.marks?.find?.((m) => m.type === 'link');
      if (found) return found;
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          const m = findLinkMark(child);
          if (m) return m;
        }
      }
      return null;
    }
    const mark = findLinkMark(json);
    expect(mark?.attrs?.sourceTitleMarker).toBe('single');
    expect(mark?.attrs?.title).toBe('a');
  });

  test('PM mark carries sourceTitleMarker=paren for `(title)` form', () => {
    const json = mdManager.parse('[link](https://x.com (a))\n');
    function findLinkMark(n: unknown): { attrs?: Record<string, unknown> } | null {
      if (!n || typeof n !== 'object') return null;
      const node = n as {
        type?: string;
        content?: unknown[];
        marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
      };
      const found = node.marks?.find?.((m) => m.type === 'link');
      if (found) return found;
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          const m = findLinkMark(child);
          if (m) return m;
        }
      }
      return null;
    }
    const mark = findLinkMark(json);
    expect(mark?.attrs?.sourceTitleMarker).toBe('paren');
  });

  test('PM mark sourceTitleMarker null for link with no title', () => {
    const json = mdManager.parse('[link](https://x.com)\n');
    function findLinkMark(n: unknown): { attrs?: Record<string, unknown> } | null {
      if (!n || typeof n !== 'object') return null;
      const node = n as {
        type?: string;
        content?: unknown[];
        marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
      };
      const found = node.marks?.find?.((m) => m.type === 'link');
      if (found) return found;
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          const m = findLinkMark(child);
          if (m) return m;
        }
      }
      return null;
    }
    const mark = findLinkMark(json);
    expect(mark?.attrs?.sourceTitleMarker).toBe(null);
  });

  test('WYSIWYG-authored link (no title attr) emits bare without title', () => {
    expect(roundTrip('[link](https://x.com)\n')).toBe('[link](https://x.com)\n');
  });

  test('round-trip is idempotent for paren-style title links', () => {
    const input = '[link](https://x.com (paren))\n';
    const r1 = roundTrip(input);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
  });

  test('mixed: paragraph with all four title forms round-trips byte-equal', () => {
    const input = 'Visit [a](u1 \'one\') and [b](u2 "two") and [c](u3 (three)) and [d](u4) here.\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('title forms preserved when wrapped inside emphasis / list / blockquote', () => {
    expect(roundTrip("*[link](u 'a')*\n")).toBe("*[link](u 'a')*\n");
    expect(roundTrip('- [link](u (b))\n')).toBe('- [link](u (b))\n');
    expect(roundTrip('> [link](u "c")\n')).toBe('> [link](u "c")\n');
  });
});

describe('to-markdown: blockquote marker spacing (FR-23)', () => {
  test('default `> foo` (single-space) round-trips byte-equal', () => {
    expect(roundTrip('> foo\n')).toBe('> foo\n');
  });

  test('`>foo` (no-space) round-trips byte-equal', () => {
    expect(roundTrip('>foo\n')).toBe('>foo\n');
  });

  test('multi-line `> ` (single-space) preserved per line', () => {
    expect(roundTrip('> line 1\n> line 2\n')).toBe('> line 1\n> line 2\n');
  });

  test('multi-line `>` (no-space) preserved per line', () => {
    expect(roundTrip('>line 1\n>line 2\n')).toBe('>line 1\n>line 2\n');
  });

  test('mixed `> line\n>line` preserved per line (single then none)', () => {
    expect(roundTrip('> line 1\n>line 2\n')).toBe('> line 1\n>line 2\n');
  });

  test('mixed `>line\n> line` preserved per line (none then single)', () => {
    expect(roundTrip('>line 1\n> line 2\n')).toBe('>line 1\n> line 2\n');
  });

  test('multi-paragraph blockquote with blank-line `>` continuation preserves per-line spacing', () => {
    const input = '> paragraph 1\n>\n> paragraph 2\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('multi-paragraph all-no-space blockquote preserves per-line spacing', () => {
    const input = '>paragraph 1\n>\n>paragraph 2\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('mixed across paragraphs (single first, none second) preserves per-paragraph spacing', () => {
    const input = '> paragraph 1\n>\n>paragraph 2\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('nested blockquote `> > nested` preserves spacing on both levels', () => {
    expect(roundTrip('> > nested\n')).toBe('> > nested\n');
  });

  test('nested blockquote `>> nested` preserves no-space outer + single inner', () => {
    expect(roundTrip('>> nested\n')).toBe('>> nested\n');
  });

  test('nested blockquote `>>nested` preserves no-space on both levels', () => {
    expect(roundTrip('>>nested\n')).toBe('>>nested\n');
  });

  test('blockquote inside paragraph context preserves no-space form', () => {
    expect(roundTrip('before\n\n>blockquote\n\nafter\n')).toBe('before\n\n>blockquote\n\nafter\n');
  });

  test('idempotence: parse → serialize → parse → serialize preserves bytes', () => {
    const inputs = [
      '> foo\n',
      '>foo\n',
      '> line 1\n>line 2\n',
      '> paragraph 1\n>\n>paragraph 2\n',
      '>> nested\n',
    ];
    for (const input of inputs) {
      const out1 = roundTrip(input);
      const out2 = roundTrip(out1);
      expect(out2).toBe(out1);
    }
  });

  test('PM blockquote node carries sourceMarkerSpacings attr from source', () => {
    const schema = getSchema(sharedExtensions);
    const json = mdManager.parse('> a\n>b\n');
    const doc = schema.nodeFromJSON(json);
    const blockquote = doc.firstChild;
    expect(blockquote?.type.name).toBe('blockquote');
    expect(blockquote?.attrs.sourceMarkerSpacings).toEqual(['single', 'none']);
  });

  test('PM blockquote attr is null for WYSIWYG-authored blockquote (no source)', () => {
    const schema = getSchema(sharedExtensions);
    const blockquote = schema.nodes.blockquote.create(
      null,
      schema.nodes.paragraph.create(null, schema.text('hello')),
    );
    const doc = schema.nodes.doc.create(null, blockquote);
    const json = doc.toJSON();
    const out = mdManager.serialize(json);
    expect(out).toBe('> hello\n');
  });

  test('explicit sourceMarkerSpacings on synthesized blockquote honored on serialize', () => {
    const schema = getSchema(sharedExtensions);
    const blockquote = schema.nodes.blockquote.create(
      { sourceMarkerSpacings: ['none'] },
      schema.nodes.paragraph.create(null, schema.text('hello')),
    );
    const doc = schema.nodes.doc.create(null, blockquote);
    const json = doc.toJSON();
    const out = mdManager.serialize(json);
    expect(out).toBe('>hello\n');
  });

  test('out-of-range index defaults to single-space (WYSIWYG-grown blockquote)', () => {
    const schema = getSchema(sharedExtensions);
    const blockquote = schema.nodes.blockquote.create({ sourceMarkerSpacings: ['none'] }, [
      schema.nodes.paragraph.create(null, schema.text('original')),
      schema.nodes.paragraph.create(null, schema.text('grown')),
    ]);
    const doc = schema.nodes.doc.create(null, blockquote);
    const json = doc.toJSON();
    const out = mdManager.serialize(json);
    expect(out).toBe('>original\n>\n> grown\n');
  });
});

describe('to-markdown: definition source-form preservation (FR-24)', () => {
  test('single-line `[ref]: url` round-trips byte-equal', () => {
    expect(roundTrip('[ref]: url\n')).toBe('[ref]: url\n');
  });

  test('single-line with double-quote title round-trips byte-equal', () => {
    expect(roundTrip('[ref]: url "title"\n')).toBe('[ref]: url "title"\n');
  });

  test('single-line with single-quote title round-trips byte-equal', () => {
    expect(roundTrip("[ref]: url 'title'\n")).toBe("[ref]: url 'title'\n");
  });

  test('single-line with paren title round-trips byte-equal', () => {
    expect(roundTrip('[ref]: url (title)\n')).toBe('[ref]: url (title)\n');
  });

  test('multi-line url-only round-trips byte-equal', () => {
    expect(roundTrip('[ref]:\n  url\n')).toBe('[ref]:\n  url\n');
  });

  test('multi-line full (double-quote) round-trips byte-equal', () => {
    const input = '[ref]:\n  url\n  "title"\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('multi-line full (single-quote) round-trips byte-equal', () => {
    const input = "[ref]:\n  url\n  'title'\n";
    expect(roundTrip(input)).toBe(input);
  });

  test('multi-line full (paren) round-trips byte-equal', () => {
    const input = '[ref]:\n  url\n  (title)\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('case-mismatch identifier `[Ref]` preserves label case', () => {
    expect(roundTrip('[Ref]: url\n')).toBe('[Ref]: url\n');
  });

  test('angle-bracketed url preserved on single-line via R23 PUA', () => {
    expect(roundTrip('[ref]: <url>\n')).toBe('[ref]: <url>\n');
  });

  test('angle-bracketed url preserved on multi-line', () => {
    expect(roundTrip('[ref]:\n  <url>\n')).toBe('[ref]:\n  <url>\n');
  });

  test('angle-bracketed url with title on multi-line', () => {
    const input = '[ref]:\n  <url>\n  "title"\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('paren title with internal escaped paren preserved', () => {
    const input = '[ref]: url (with \\(escaped\\))\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('single-quote title with internal escaped apostrophe preserved', () => {
    const input = "[ref]: url 'with \\'escape\\''\n";
    expect(roundTrip(input)).toBe(input);
  });

  test('definition + reference usage (full form) round-trips byte-equal', () => {
    const input = '[link][ref]\n\n[ref]: url\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('definition + collapsed reference round-trips byte-equal', () => {
    const input = '[ref][]\n\n[ref]: url\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('definition + shortcut reference round-trips byte-equal', () => {
    const input = '[ref]\n\n[ref]: url\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('definition + image reference round-trips byte-equal', () => {
    const input = '![alt][ref]\n\n[ref]: url\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('definition + multi-line def with single-quote title via reference', () => {
    const input = "[link][ref]\n\n[ref]:\n  url\n  'title'\n";
    expect(roundTrip(input)).toBe(input);
  });

  test('idempotence: parse → serialize → parse → serialize preserves bytes', () => {
    const inputs = [
      '[ref]: url\n',
      '[ref]: url "title"\n',
      "[ref]: url 'title'\n",
      '[ref]: url (title)\n',
      '[ref]:\n  url\n  "title"\n',
      "[ref]:\n  url\n  'title'\n",
      '[ref]:\n  url\n  (title)\n',
      '[ref]: <url>\n',
      '[Ref]: url\n',
    ];
    for (const input of inputs) {
      const out1 = roundTrip(input);
      const out2 = roundTrip(out1);
      expect(out1).toBe(input);
      expect(out2).toBe(out1);
    }
  });

  test('PM linkRefDef carries sourceLayout=multiline from multi-line source', () => {
    const schema = getSchema(sharedExtensions);
    const json = mdManager.parse('[ref]:\n  url\n  "title"\n');
    const doc = schema.nodeFromJSON(json);
    const def = doc.firstChild;
    expect(def?.type.name).toBe('linkRefDef');
    expect(def?.attrs.sourceLayout).toBe('multiline');
    expect(def?.attrs.sourceTitleMarker).toBe('double');
  });

  test('PM linkRefDef carries sourceLayout=inline from single-line source', () => {
    const schema = getSchema(sharedExtensions);
    const json = mdManager.parse('[ref]: url\n');
    const doc = schema.nodeFromJSON(json);
    const def = doc.firstChild;
    expect(def?.type.name).toBe('linkRefDef');
    expect(def?.attrs.sourceLayout).toBe('inline');
    expect(def?.attrs.sourceTitleMarker).toBe(null);
  });

  test('PM linkRefDef sourceTitleMarker=single from single-quote source', () => {
    const schema = getSchema(sharedExtensions);
    const json = mdManager.parse("[ref]: url 'title'\n");
    const doc = schema.nodeFromJSON(json);
    const def = doc.firstChild;
    expect(def?.attrs.sourceTitleMarker).toBe('single');
  });

  test('PM linkRefDef sourceTitleMarker=paren from paren source', () => {
    const schema = getSchema(sharedExtensions);
    const json = mdManager.parse('[ref]: url (title)\n');
    const doc = schema.nodeFromJSON(json);
    const def = doc.firstChild;
    expect(def?.attrs.sourceTitleMarker).toBe('paren');
  });

  test('WYSIWYG-authored linkRefDef (no source attrs) defaults to canonical form', () => {
    const schema = getSchema(sharedExtensions);
    const def = schema.nodes.linkRefDef.create({
      label: 'ref',
      href: 'url',
      title: 'title',
    });
    const doc = schema.nodes.doc.create(null, def);
    const json = doc.toJSON();
    const out = mdManager.serialize(json);
    expect(out).toBe('[ref]: url "title"\n');
  });

  test('explicit sourceLayout=multiline on synthesized PM tree honored on serialize', () => {
    const schema = getSchema(sharedExtensions);
    const def = schema.nodes.linkRefDef.create({
      label: 'ref',
      href: 'url',
      title: 'title',
      sourceLayout: 'multiline',
      sourceTitleMarker: 'single',
    });
    const doc = schema.nodes.doc.create(null, def);
    const json = doc.toJSON();
    const out = mdManager.serialize(json);
    expect(out).toBe("[ref]:\n  url\n  'title'\n");
  });
});
