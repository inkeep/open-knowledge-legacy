import { describe, expect, test } from 'bun:test';
import {
  BRIDGE_TOLERANCE_CLASSES,
  detectAppliedToleranceClasses,
  normalizeBridge,
} from './normalize.ts';

describe('per-line trailing whitespace strip', () => {
  test('trailing spaces on a line are stripped', () => {
    expect(normalizeBridge('foo \nbar')).toBe(normalizeBridge('foo\nbar'));
  });

  test('trailing tabs on a line are stripped', () => {
    expect(normalizeBridge('foo\t\t\nbar')).toBe(normalizeBridge('foo\nbar'));
  });

  test('mixed trailing whitespace on multiple lines', () => {
    expect(normalizeBridge('a  \nb \nc\t\nd')).toBe(normalizeBridge('a\nb\nc\nd'));
  });

  test('leading whitespace is preserved (only trailing stripped)', () => {
    expect(normalizeBridge('  foo')).toBe('  foo');
  });
});

describe('3+ newline collapse to 2 (NG1 floor)', () => {
  test('three newlines collapse to two', () => {
    expect(normalizeBridge('P1\n\n\nP2')).toBe(normalizeBridge('P1\n\nP2'));
  });

  test('four newlines collapse to two', () => {
    expect(normalizeBridge('P1\n\n\n\nP2')).toBe(normalizeBridge('P1\n\nP2'));
  });

  test('many newlines collapse to two', () => {
    expect(normalizeBridge('P1\n\n\n\n\n\n\nP2')).toBe(normalizeBridge('P1\n\nP2'));
  });

  test('two newlines preserved (not collapsed)', () => {
    expect(normalizeBridge('P1\n\nP2')).toBe('P1\n\nP2');
  });

  test('single newline preserved', () => {
    expect(normalizeBridge('P1\nP2')).toBe('P1\nP2');
  });
});

describe('trailing newline policy', () => {
  test('no trailing newline', () => {
    expect(normalizeBridge('P')).toBe(normalizeBridge('P'));
  });

  test('single trailing newline stripped', () => {
    expect(normalizeBridge('P')).toBe(normalizeBridge('P\n'));
  });

  test('multiple trailing newlines stripped', () => {
    expect(normalizeBridge('P')).toBe(normalizeBridge('P\n\n\n'));
  });

  test('trailing newlines do not affect interior structure', () => {
    expect(normalizeBridge('P1\n\nP2\n\n\n')).toBe(normalizeBridge('P1\n\nP2'));
  });
});

describe('leading newline policy (NG1 architectural floor at doc-start)', () => {
  test('no leading newline', () => {
    expect(normalizeBridge('P')).toBe(normalizeBridge('P'));
  });

  test('single leading newline stripped', () => {
    expect(normalizeBridge('P')).toBe(normalizeBridge('\nP'));
  });

  test('multiple leading newlines stripped', () => {
    expect(normalizeBridge('P')).toBe(normalizeBridge('\n\n\nP'));
  });

  test('leading newlines do not affect interior structure', () => {
    expect(normalizeBridge('\n\nP1\n\nP2')).toBe(normalizeBridge('P1\n\nP2'));
  });

  test('two leading newlines (the canonical source-mode-burst case) tolerate to zero', () => {
    expect(normalizeBridge('\n\nC6-A-SOURCE\nC6-A-WYSIWYG\n')).toBe(
      normalizeBridge('C6-A-SOURCE\nC6-A-WYSIWYG\n'),
    );
  });

  test('leading + trailing newlines both stripped (symmetric edges)', () => {
    expect(normalizeBridge('\n\nfoo\n\n')).toBe(normalizeBridge('foo'));
  });
});

describe('CRLF ↔ LF normalize', () => {
  test('CRLF line endings equivalent to LF', () => {
    expect(normalizeBridge('Line1\r\nLine2\r\n')).toBe(normalizeBridge('Line1\nLine2\n'));
  });

  test('mixed CRLF and LF in same input', () => {
    expect(normalizeBridge('A\r\nB\nC\r\nD')).toBe(normalizeBridge('A\nB\nC\nD'));
  });

  test('bare \\r tolerated (Old-Mac line endings stripped)', () => {
    expect(normalizeBridge('Line1\rLine2')).toBe('Line1Line2');
  });

  test('CRLF with surrounding content', () => {
    expect(normalizeBridge('# Heading\r\n\r\nbody\r\n')).toBe(
      normalizeBridge('# Heading\n\nbody\n'),
    );
  });
});

describe('UTF-8 BOM strip', () => {
  test('leading BOM stripped', () => {
    expect(normalizeBridge('﻿Hello\n')).toBe(normalizeBridge('Hello\n'));
  });

  test('non-leading BOM preserved (only leading stripped)', () => {
    expect(normalizeBridge('Hello﻿World')).toBe('Hello﻿World');
  });

  test('BOM with content', () => {
    expect(normalizeBridge('﻿# Heading\n\nbody\n')).toBe(normalizeBridge('# Heading\n\nbody\n'));
  });

  test('bare BOM normalizes to empty', () => {
    expect(normalizeBridge('﻿')).toBe('');
  });
});

describe('doc-start thematic break canonical (--- ↔ ***)', () => {
  test('doc-start `---` and `***` equivalent', () => {
    expect(normalizeBridge('---\nP\n')).toBe(normalizeBridge('***\nP\n'));
  });

  test('longer thematic breaks at doc start equivalent', () => {
    expect(normalizeBridge('-----\nP\n')).toBe(normalizeBridge('*****\nP\n'));
  });

  test('doc-start `---` only (no following content) equivalent to `***` only', () => {
    expect(normalizeBridge('---')).toBe(normalizeBridge('***'));
  });

  test('mid-doc thematic break NOT in tolerance class', () => {
    const a = normalizeBridge('P1\n\n***\n\nP2\n');
    const b = normalizeBridge('P1\n\n---\n\nP2\n');
    expect(a).not.toBe(b);
  });
});

describe('setext underline length (NOT a tolerance class — removed per FR-22 / US-011)', () => {
  test('H1 short vs long underline NOT collapsed', () => {
    expect(normalizeBridge('Title\n=====\n')).not.toBe(normalizeBridge('Title\n=\n'));
  });

  test('H1 11-char vs 3-char underline NOT collapsed', () => {
    expect(normalizeBridge('Title\n===========\n')).not.toBe(normalizeBridge('Title\n===\n'));
  });

  test('H2 short vs long underline NOT collapsed', () => {
    expect(normalizeBridge('Title\n-----\n')).not.toBe(normalizeBridge('Title\n-\n'));
  });

  test('byte-equal underline runs DO compare equal', () => {
    expect(normalizeBridge('Title\n=====\n')).toBe(normalizeBridge('Title\n=====\n'));
    expect(normalizeBridge('Title\n-----\n')).toBe(normalizeBridge('Title\n-----\n'));
  });
});

describe('combined tolerance classes', () => {
  test('all tolerance classes can stack', () => {
    const noisy = '﻿---\r\nP1\r\n\r\n\r\n\r\nP2\r\n';
    const clean = '***\nP1\n\nP2\n';
    expect(normalizeBridge(noisy)).toBe(normalizeBridge(clean));
  });

  test('BOM with CRLF and matching setext underline', () => {
    expect(normalizeBridge('﻿Title\r\n=====\r\n\r\nbody\r\n')).toBe(
      normalizeBridge('Title\n=====\n\nbody'),
    );
  });

  test('doc-start *** with CRLF and BOM', () => {
    expect(normalizeBridge('﻿*****\r\n\r\nP\r\n')).toBe(normalizeBridge('---\n\nP'));
  });
});

describe('negative cases — substantive byte differences NOT collapsed', () => {
  test('different content does not collapse', () => {
    expect(normalizeBridge('foo')).not.toBe(normalizeBridge('bar'));
  });

  test('source-form delimiter classes NOT a tolerance class (`__foo__` vs `**foo**`)', () => {
    expect(normalizeBridge('__foo__\n')).not.toBe(normalizeBridge('**foo**\n'));
  });

  test('different blank-line structure preserved (1 vs 2)', () => {
    expect(normalizeBridge('P1\nP2')).not.toBe(normalizeBridge('P1\n\nP2'));
  });

  test('heading level differences preserved', () => {
    expect(normalizeBridge('# Heading\n')).not.toBe(normalizeBridge('## Heading\n'));
  });

  test('mid-doc *** vs mid-doc ---', () => {
    expect(normalizeBridge('A\n\n***\n\nB')).not.toBe(normalizeBridge('A\n\n---\n\nB'));
  });

  test('list marker differences preserved (- vs *)', () => {
    expect(normalizeBridge('- item\n')).not.toBe(normalizeBridge('* item\n'));
  });
});

describe('order of operations — BOM strip BEFORE CRLF normalize', () => {
  test('BOM with CRLF: BOM is stripped before line-based regex anchoring', () => {
    expect(normalizeBridge('﻿---\nP\n')).toBe(normalizeBridge('---\nP\n'));
  });

  test('BOM with CRLF doc-start thematic break canonical applies', () => {
    expect(normalizeBridge('﻿***\r\nP\r\n')).toBe(normalizeBridge('---\nP'));
  });
});

describe('idempotence', () => {
  test('normalizeBridge is idempotent (running twice = once)', () => {
    const inputs = [
      '',
      'foo',
      'P1\n\nP2',
      '﻿# H\r\n\r\nbody\r\n',
      'Title\n======\n',
      '---\nP',
      '﻿***\r\n\r\nP1\r\n\r\n\r\nP2\r\n\r\n\r\n',
    ];
    for (const input of inputs) {
      const once = normalizeBridge(input);
      const twice = normalizeBridge(once);
      expect(twice).toBe(once);
    }
  });
});

describe('block-separator-collapse — `\\n[marker]` ≡ `\\n\\n[marker]`', () => {
  test('heading: `\\n# H` equivalent to `\\n\\n# H`', () => {
    expect(normalizeBridge('P\n# H\n')).toBe(normalizeBridge('P\n\n# H\n'));
  });

  test('blockquote: `\\n> q` equivalent to `\\n\\n> q`', () => {
    expect(normalizeBridge('P\n> q\n')).toBe(normalizeBridge('P\n\n> q\n'));
  });

  test('unordered list: `\\n- item` equivalent to `\\n\\n- item`', () => {
    expect(normalizeBridge('P\n- item\n')).toBe(normalizeBridge('P\n\n- item\n'));
  });

  test('fenced code: `\\n```ts` equivalent to `\\n\\n```ts`', () => {
    expect(normalizeBridge('P\n```ts\nx\n```\n')).toBe(normalizeBridge('P\n\n```ts\nx\n```\n'));
  });

  test('ordered list: `\\n1. item` equivalent to `\\n\\n1. item`', () => {
    expect(normalizeBridge('P\n1. item\n')).toBe(normalizeBridge('P\n\n1. item\n'));
  });

  test('plus-marker list: `\\n+ item` equivalent to `\\n\\n+ item`', () => {
    expect(normalizeBridge('P\n+ item\n')).toBe(normalizeBridge('P\n\n+ item\n'));
  });

  test('tilde fence: `\\n~~~` equivalent to `\\n\\n~~~`', () => {
    expect(normalizeBridge('P\n~~~ts\nx\n~~~\n')).toBe(normalizeBridge('P\n\n~~~ts\nx\n~~~\n'));
  });

  test('NEGATIVE: `text\\nmore` NOT equivalent to `text\\n\\nmore` (paragraph soft break preserved)', () => {
    expect(normalizeBridge('text\nmore')).not.toBe(normalizeBridge('text\n\nmore'));
  });

  test('reverse: heading line followed by paragraph (`## H\\nP` ≡ `## H\\n\\nP`)', () => {
    expect(normalizeBridge('## H\nP\n')).toBe(normalizeBridge('## H\n\nP\n'));
  });

  test('reverse: blockquote line followed by paragraph (`> q\\nP` ≡ `> q\\n\\nP`)', () => {
    expect(normalizeBridge('> q\nP\n')).toBe(normalizeBridge('> q\n\nP\n'));
  });

  test('reverse: list item followed by paragraph (`- item\\nP` ≡ `- item\\n\\nP`)', () => {
    expect(normalizeBridge('- item\nP\n')).toBe(normalizeBridge('- item\n\nP\n'));
  });

  test('reverse: ordered list item followed by paragraph (`1. item\\nP` ≡ `1. item\\n\\nP`)', () => {
    expect(normalizeBridge('1. item\nP\n')).toBe(normalizeBridge('1. item\n\nP\n'));
  });

  test('reverse: plus-marker list item followed by paragraph (`+ item\\nP` ≡ `+ item\\n\\nP`)', () => {
    expect(normalizeBridge('+ item\nP\n')).toBe(normalizeBridge('+ item\n\nP\n'));
  });

  test('reverse: tilde fence open followed by content (`~~~ts\\nx` ≡ `~~~ts\\n\\nx`)', () => {
    expect(normalizeBridge('~~~ts\nx\n~~~\n')).toBe(normalizeBridge('~~~ts\n\nx\n~~~\n'));
  });

  test('S6 fixture shape: heading line followed by long paragraph', () => {
    const ytext =
      '## Section 1 — Lorem elit labore minim\nEa reprehenderit pariatur sunt id amet.\n';
    const frag =
      '## Section 1 — Lorem elit labore minim\n\nEa reprehenderit pariatur sunt id amet.\n';
    expect(normalizeBridge(ytext)).toBe(normalizeBridge(frag));
  });
});

describe('commonmark-escape collapse', () => {
  test('escaped underscore equivalent to plain underscore', () => {
    expect(normalizeBridge('init_spike')).toBe(normalizeBridge('init\\_spike'));
  });

  test('escaped tilde equivalent to plain tilde', () => {
    expect(normalizeBridge('~3000')).toBe(normalizeBridge('\\~3000'));
  });

  test('multiple escaped tildes equivalent to multiple plain tildes', () => {
    expect(normalizeBridge('~~~')).toBe(normalizeBridge('\\~\\~\\~'));
  });

  test('escaped underscore in identifier-like text', () => {
    expect(normalizeBridge('STOP_IF')).toBe(normalizeBridge('STOP\\_IF'));
  });

  test('mdast strip-on-inline-code direction: `\\|---\\|` equivalent to `|---|`', () => {
    expect(normalizeBridge('`\\|---\\|---\\|`')).toBe(normalizeBridge('`|---|---|`'));
  });

  test('NEGATIVE: backslash before a NON-escapable char is preserved', () => {
    expect(normalizeBridge('a\\b')).toBe('a\\b');
    expect(normalizeBridge('a\\b')).not.toBe(normalizeBridge('ab'));
  });

  test('NEGATIVE: plain text without backslashes is preserved', () => {
    expect(normalizeBridge('plain text')).toBe('plain text');
  });

  test('idempotent: applying collapse to already-collapsed string is a no-op', () => {
    expect(normalizeBridge(normalizeBridge('init\\_spike'))).toBe(normalizeBridge('init_spike'));
  });
});

describe('table-align-row-spacing collapse', () => {
  test('unpadded equivalent to padded alignment row', () => {
    expect(normalizeBridge('|---|---|')).toBe(normalizeBridge('| --- | --- |'));
  });

  test('three-column alignment row, unpadded vs padded', () => {
    expect(normalizeBridge('|---|---|---|')).toBe(normalizeBridge('| --- | --- | --- |'));
  });

  test('colon markers preserved: left-align ↔ left-align', () => {
    expect(normalizeBridge('|:---|:---|')).toBe(normalizeBridge('| :--- | :--- |'));
  });

  test('colon markers preserved: right-align ↔ right-align', () => {
    expect(normalizeBridge('|---:|---:|')).toBe(normalizeBridge('| ---: | ---: |'));
  });

  test('colon markers preserved: center-align ↔ center-align', () => {
    expect(normalizeBridge('|:---:|:---:|')).toBe(normalizeBridge('| :---: | :---: |'));
  });

  test('mixed colon markers across columns', () => {
    expect(normalizeBridge('|:---:|---:|:---|')).toBe(normalizeBridge('| :---: | ---: | :--- |'));
  });

  test('whole markdown table with header + alignment row + data rows', () => {
    const unpadded = '|Name|Age|\n|---|---|\n|Alice|30|\n';
    const padded = '|Name|Age|\n| --- | --- |\n|Alice|30|\n';
    expect(normalizeBridge(unpadded)).toBe(normalizeBridge(padded));
  });

  test('NEGATIVE: a paragraph line that is NOT an alignment row keeps its whitespace', () => {
    expect(normalizeBridge('a - b | c')).toBe('a - b | c');
  });

  test('NEGATIVE: single-column "table" with no separator is NOT collapsed', () => {
    expect(normalizeBridge('|---|')).toBe('|---|');
  });
});

describe('emphasis-around-code flatten', () => {
  test('strong wrapper around inline code equivalent to bare inline code', () => {
    expect(normalizeBridge('**`text-indent`**')).toBe(normalizeBridge('`text-indent`'));
  });

  test('strong wrapper with surrounding whitespace collapses identically', () => {
    expect(normalizeBridge('** `code` **')).toBe(normalizeBridge('`code`'));
  });

  test('NEGATIVE: strong wrapping non-code content is preserved', () => {
    expect(normalizeBridge('**bold text**')).toBe('**bold text**');
    expect(normalizeBridge('**bold text**')).not.toBe(normalizeBridge('bold text'));
  });

  test('NEGATIVE: strong wrapping multiple inline-code spans is preserved', () => {
    expect(normalizeBridge('**`a` and `b`**')).toBe('**`a` and `b`**');
  });
});

describe('list-indent canonical collapse', () => {
  test('6-space-indented list item equivalent to 3-space-indented', () => {
    expect(normalizeBridge('      - nested item')).toBe(normalizeBridge('   - nested item'));
  });

  test('top-level list item unchanged', () => {
    expect(normalizeBridge('- item')).toBe('- item');
  });

  test('whole nested list block collapses identically', () => {
    const sixSpace = '- a\n      - nested\n      - also nested\n- b\n';
    const threeSpace = '- a\n   - nested\n   - also nested\n- b\n';
    expect(normalizeBridge(sixSpace)).toBe(normalizeBridge(threeSpace));
  });

  test('tab-indented list item equivalent to 3-space-indented', () => {
    expect(normalizeBridge('\t- nested item')).toBe(normalizeBridge('   - nested item'));
  });

  test('ordered list with deep indent collapses', () => {
    expect(normalizeBridge('      1. nested item')).toBe(normalizeBridge('   1. nested item'));
  });

  test('asterisk-marker list with deep indent collapses', () => {
    expect(normalizeBridge('      * nested item')).toBe(normalizeBridge('   * nested item'));
  });

  test('plus-marker list with deep indent collapses', () => {
    expect(normalizeBridge('      + nested item')).toBe(normalizeBridge('   + nested item'));
  });

  test('Pandoc alphabetic marker with deep indent collapses', () => {
    expect(normalizeBridge('      a. nested item')).toBe(normalizeBridge('   a. nested item'));
  });

  test('NEGATIVE: non-list-marker line with leading whitespace is preserved', () => {
    expect(normalizeBridge('   plain paragraph line')).toBe('   plain paragraph line');
  });
});

describe('detectAppliedToleranceClasses (FR-41)', () => {
  test('exposes the class enum for bounded-cardinality emit consumers', () => {
    expect(BRIDGE_TOLERANCE_CLASSES).toEqual([
      'bom',
      'crlf',
      'commonmark-escape',
      'emphasis-around-code',
      'leading-newline',
      'doc-start-thematic',
      'block-separator-collapse',
      'table-align-row-spacing',
      'list-indent-canonical',
      'trailing-whitespace',
      'blank-line-collapse',
      'trailing-newline',
    ]);
  });

  test('detects emphasis-around-code when either input contains the tight wrap', () => {
    expect(detectAppliedToleranceClasses('**`text-indent`**', '`text-indent`')).toContain(
      'emphasis-around-code',
    );
  });

  test('detects list-indent-canonical when either input has an indented list item', () => {
    expect(detectAppliedToleranceClasses('      - foo', '   - foo')).toContain(
      'list-indent-canonical',
    );
    expect(detectAppliedToleranceClasses('\t- foo', '- foo')).toContain('list-indent-canonical');
  });

  test('does not detect list-indent-canonical when neither input has indent', () => {
    expect(detectAppliedToleranceClasses('- foo', '- foo')).not.toContain('list-indent-canonical');
  });

  test('detects commonmark-escape when present in either input', () => {
    expect(detectAppliedToleranceClasses('init\\_spike', 'init_spike')).toContain(
      'commonmark-escape',
    );
    expect(detectAppliedToleranceClasses('init_spike', 'init\\_spike')).toContain(
      'commonmark-escape',
    );
    expect(detectAppliedToleranceClasses('\\~5ms', '~5ms')).toContain('commonmark-escape');
  });

  test('does not detect commonmark-escape for unrelated backslashes', () => {
    expect(detectAppliedToleranceClasses('a\\b', 'a\\b')).not.toContain('commonmark-escape');
  });

  test('detects table-align-row-spacing when either input contains an alignment row', () => {
    expect(detectAppliedToleranceClasses('|---|---|', '| --- | --- |')).toContain(
      'table-align-row-spacing',
    );
    expect(detectAppliedToleranceClasses('|:---|---:|', '| :--- | ---: |')).toContain(
      'table-align-row-spacing',
    );
  });

  test('does not detect table-align-row-spacing for paragraph content', () => {
    expect(detectAppliedToleranceClasses('a - b | c', 'a - b | c')).not.toContain(
      'table-align-row-spacing',
    );
  });

  test('detects block-separator-collapse when one side has `\\n\\n[marker]` and the other has `\\n[marker]`', () => {
    expect(detectAppliedToleranceClasses('P\n# H', 'P\n\n# H')).toContain(
      'block-separator-collapse',
    );
    expect(detectAppliedToleranceClasses('P\n\n- item', 'P\n- item')).toContain(
      'block-separator-collapse',
    );
  });

  test('does not detect block-separator-collapse when both sides have the same separator shape', () => {
    expect(detectAppliedToleranceClasses('P\n\n# H', 'P\n\n# H')).not.toContain(
      'block-separator-collapse',
    );
    expect(detectAppliedToleranceClasses('P\n# H', 'P\n# H')).not.toContain(
      'block-separator-collapse',
    );
  });

  test('detects BOM when present in either input', () => {
    expect(detectAppliedToleranceClasses('﻿foo', 'foo')).toContain('bom');
    expect(detectAppliedToleranceClasses('foo', '﻿foo')).toContain('bom');
  });

  test('detects CRLF when carriage returns present', () => {
    expect(detectAppliedToleranceClasses('a\r\nb', 'a\nb')).toContain('crlf');
    expect(detectAppliedToleranceClasses('a\nb', 'a\r\nb')).toContain('crlf');
  });

  test('detects leading-newline when one input has it and the other does not', () => {
    expect(detectAppliedToleranceClasses('\n\nfoo', 'foo')).toContain('leading-newline');
    expect(detectAppliedToleranceClasses('foo', '\nfoo')).toContain('leading-newline');
  });

  test('does not detect leading-newline when both inputs have it equally', () => {
    expect(detectAppliedToleranceClasses('\n\nfoo', '\n\nfoo')).not.toContain('leading-newline');
  });

  test('detects doc-start-thematic when one is *** and the other is ---', () => {
    expect(detectAppliedToleranceClasses('***\nP', '---\nP')).toContain('doc-start-thematic');
    expect(detectAppliedToleranceClasses('---\nP', '***\nP')).toContain('doc-start-thematic');
  });

  test('does not detect doc-start-thematic when neither input starts with *** or ---', () => {
    expect(detectAppliedToleranceClasses('foo\nP', 'foo\nP')).not.toContain('doc-start-thematic');
  });

  test('detects trailing-whitespace via mid-line indicator', () => {
    expect(detectAppliedToleranceClasses('foo \nbar', 'foo\nbar')).toContain('trailing-whitespace');
    expect(detectAppliedToleranceClasses('foo\t\nbar', 'foo\nbar')).toContain(
      'trailing-whitespace',
    );
  });

  test('detects trailing-whitespace via end-of-string indicator (no trailing newline)', () => {
    expect(detectAppliedToleranceClasses('foo  ', 'foo')).toContain('trailing-whitespace');
  });

  test('does not double-emit trailing-whitespace when both indicators apply', () => {
    const classes = detectAppliedToleranceClasses('foo \nbar  ', 'foo\nbar');
    expect(classes.filter((c) => c === 'trailing-whitespace')).toHaveLength(1);
  });

  test('detects blank-line-collapse via 3+ newlines', () => {
    expect(detectAppliedToleranceClasses('a\n\n\nb', 'a\n\nb')).toContain('blank-line-collapse');
    expect(detectAppliedToleranceClasses('a\n\n\n\n\nb', 'a\n\nb')).toContain(
      'blank-line-collapse',
    );
  });

  test('detects trailing-newline when exactly one input has trailing \\n', () => {
    expect(detectAppliedToleranceClasses('foo\n', 'foo')).toContain('trailing-newline');
    expect(detectAppliedToleranceClasses('foo', 'foo\n')).toContain('trailing-newline');
  });

  test('does not detect trailing-newline when both inputs have trailing \\n', () => {
    expect(detectAppliedToleranceClasses('foo\n', 'foo\n')).not.toContain('trailing-newline');
  });

  test('returns empty array for byte-equal inputs', () => {
    expect(detectAppliedToleranceClasses('foo', 'foo')).toEqual([]);
    expect(detectAppliedToleranceClasses('', '')).toEqual([]);
  });

  test('returns multiple classes when multiple differences apply', () => {
    const classes = detectAppliedToleranceClasses('﻿\n\nfoo \r\n\r\n\r\nbar  ', 'foo\n\nbar');
    expect(classes).toContain('bom');
    expect(classes).toContain('crlf');
    expect(classes).toContain('leading-newline');
    expect(classes).toContain('trailing-whitespace');
    expect(classes).toContain('blank-line-collapse');
  });

  test('returns only valid class labels (bounded cardinality)', () => {
    const classes = detectAppliedToleranceClasses(
      '﻿\n\n***\nfoo \r\n\r\n\r\nbar  ',
      '---\nfoo\n\nbar',
    );
    for (const cls of classes) {
      expect(BRIDGE_TOLERANCE_CLASSES).toContain(cls);
    }
  });
});
