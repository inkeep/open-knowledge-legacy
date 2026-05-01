import { describe, expect, test } from 'bun:test';
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
