import { describe, expect, test } from 'bun:test';
import {
  appendPattern,
  editPatternAt,
  listPatterns,
  parseOkignoreDoc,
  removePatternAt,
  reorderPatterns,
  serializeOkignoreDoc,
} from './okignore-doc';

const ROUND_TRIP_FIXTURES: { name: string; text: string }[] = [
  { name: 'empty body', text: '' },
  { name: 'single pattern no trailing newline', text: 'drafts/' },
  { name: 'single pattern with trailing newline', text: 'drafts/\n' },
  { name: 'two patterns trailing newline', text: 'drafts/\n*.draft.md\n' },
  { name: 'two patterns no trailing newline', text: 'drafts/\n*.draft.md' },
  { name: 'leading + trailing comments', text: '# header\ndrafts/\n# footer\n' },
  { name: 'blank line in middle', text: 'drafts/\n\nvendor/\n' },
  { name: 'multi-blank cluster', text: 'a\n\n\n\nb\n' },
  { name: 'whitespace-only line', text: 'a\n   \nb\n' },
  { name: 'pattern with leading whitespace preserved', text: '  drafts/\n*.tmp\n' },
  { name: 'commented + blank + pattern interleaved', text: '# a\n\ndrafts/\n# b\n\nvendor/\n' },
  { name: 'cr inside line preserved verbatim', text: 'drafts\r/\nvendor/\n' },
  {
    name: 'realistic mixed body',
    text: '# Drafts\ndrafts/\n\n# Vendor pastes\nvendor/\n*.draft.md\n\n# done\n',
  },
];

describe('parseOkignoreDoc + serializeOkignoreDoc — byte-identical round-trip', () => {
  for (const { name, text } of ROUND_TRIP_FIXTURES) {
    test(`round-trip preserves: ${name}`, () => {
      const doc = parseOkignoreDoc(text);
      const out = serializeOkignoreDoc(doc);
      expect(out).toBe(text);
    });
  }
});

describe('parseOkignoreDoc — line classification', () => {
  test('truly empty body yields one blank line', () => {
    const doc = parseOkignoreDoc('');
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]).toEqual({ kind: 'blank', raw: '' });
  });

  test('classifies blank, comment, pattern correctly', () => {
    const doc = parseOkignoreDoc('# c\n\n   \ndrafts/\n  vendor/  \n');
    const kinds = doc.lines.map((l) => l.kind);
    expect(kinds).toEqual(['comment', 'blank', 'blank', 'pattern', 'pattern', 'blank']);
  });

  test('whitespace-only line classifies as blank (NOT pattern)', () => {
    const doc = parseOkignoreDoc('   \n');
    expect(doc.lines[0]).toEqual({ kind: 'blank', raw: '   ' });
  });

  test('pattern line stores trimmed text but raw preserves whitespace', () => {
    const doc = parseOkignoreDoc('  drafts/  \n');
    const first = doc.lines[0];
    expect(first.kind).toBe('pattern');
    if (first.kind === 'pattern') {
      expect(first.text).toBe('drafts/');
      expect(first.raw).toBe('  drafts/  ');
    }
  });

  test('comment line with leading whitespace classifies as comment', () => {
    const doc = parseOkignoreDoc('  # not a pattern\n');
    expect(doc.lines[0]?.kind).toBe('comment');
    expect(doc.lines[0]?.raw).toBe('  # not a pattern');
  });

  test('pattern that contains # mid-line is still a pattern', () => {
    const doc = parseOkignoreDoc('drafts/#nope\n');
    const first = doc.lines[0];
    expect(first.kind).toBe('pattern');
    if (first.kind === 'pattern') {
      expect(first.text).toBe('drafts/#nope');
    }
  });
});

describe('listPatterns', () => {
  test('returns only pattern lines in document order', () => {
    const doc = parseOkignoreDoc('# c\ndrafts/\n\nvendor/\n# d\n');
    const patterns = listPatterns(doc);
    expect(patterns.map((p) => p.text)).toEqual(['drafts/', 'vendor/']);
  });

  test('returns empty array for empty doc', () => {
    expect(listPatterns(parseOkignoreDoc(''))).toEqual([]);
  });

  test('returns empty array for comments-only doc', () => {
    expect(listPatterns(parseOkignoreDoc('# header\n# more\n'))).toEqual([]);
  });
});

describe('appendPattern', () => {
  test('appends to empty doc with trailing newline', () => {
    const next = appendPattern(parseOkignoreDoc(''), 'drafts/');
    expect(serializeOkignoreDoc(next)).toBe('drafts/\n');
  });

  test('appends to doc that already ends with newline', () => {
    const next = appendPattern(parseOkignoreDoc('a/\n'), 'b/');
    expect(serializeOkignoreDoc(next)).toBe('a/\nb/\n');
  });

  test('appends to doc that does NOT end with newline', () => {
    const next = appendPattern(parseOkignoreDoc('a/'), 'b/');
    expect(serializeOkignoreDoc(next)).toBe('a/\nb/\n');
  });

  test('preserves comments and blank lines verbatim through append', () => {
    const text = '# Drafts\ndrafts/\n\n# Vendor\nvendor/\n';
    const next = appendPattern(parseOkignoreDoc(text), '*.tmp');
    expect(serializeOkignoreDoc(next)).toBe(`${text}*.tmp\n`);
  });

  test('trims input pattern (mirrors L3 server-side strip)', () => {
    const next = appendPattern(parseOkignoreDoc(''), '   drafts/   ');
    expect(serializeOkignoreDoc(next)).toBe('drafts/\n');
  });

  test('empty/whitespace-only input returns the doc unchanged', () => {
    const original = parseOkignoreDoc('a/\n');
    expect(appendPattern(original, '')).toBe(original);
    expect(appendPattern(original, '   ')).toBe(original);
    expect(appendPattern(original, '\t\n')).toBe(original);
  });
});

describe('editPatternAt', () => {
  test('replaces the n-th pattern with the trimmed new text', () => {
    const text = '# c\ndrafts/\nvendor/\n';
    const next = editPatternAt(parseOkignoreDoc(text), 1, '*.tmp');
    expect(serializeOkignoreDoc(next)).toBe('# c\ndrafts/\n*.tmp\n');
  });

  test('preserves comments + blank lines through edit', () => {
    const text = '# A\n\ndrafts/\n# B\n\nvendor/\n';
    const next = editPatternAt(parseOkignoreDoc(text), 0, '*.draft.md');
    expect(serializeOkignoreDoc(next)).toBe('# A\n\n*.draft.md\n# B\n\nvendor/\n');
  });

  test('trims new text on edit (loses leading/trailing whitespace)', () => {
    const next = editPatternAt(parseOkignoreDoc('drafts/\n'), 0, '   *.tmp   ');
    expect(serializeOkignoreDoc(next)).toBe('*.tmp\n');
  });

  test('edit-to-empty drops the line (== remove)', () => {
    const text = 'drafts/\nvendor/\n';
    const next = editPatternAt(parseOkignoreDoc(text), 0, '');
    expect(serializeOkignoreDoc(next)).toBe('vendor/\n');
  });

  test('edit-to-whitespace-only drops the line (== remove, defensive)', () => {
    const text = 'drafts/\nvendor/\n';
    const next = editPatternAt(parseOkignoreDoc(text), 0, '   ');
    expect(serializeOkignoreDoc(next)).toBe('vendor/\n');
  });

  test('out-of-range patternIndex returns the doc unchanged', () => {
    const original = parseOkignoreDoc('drafts/\n');
    expect(editPatternAt(original, 5, 'foo')).toBe(original);
    expect(editPatternAt(original, -1, 'foo')).toBe(original);
  });

  test('edit on the only pattern keeps the trailing newline', () => {
    const next = editPatternAt(parseOkignoreDoc('drafts/\n'), 0, 'vendor/');
    expect(serializeOkignoreDoc(next)).toBe('vendor/\n');
  });
});

describe('removePatternAt', () => {
  test('drops the n-th pattern line', () => {
    const next = removePatternAt(parseOkignoreDoc('a/\nb/\nc/\n'), 1);
    expect(serializeOkignoreDoc(next)).toBe('a/\nc/\n');
  });

  test('preserves comments around a removed pattern', () => {
    const text = '# Drafts\ndrafts/\n# After\nvendor/\n';
    const next = removePatternAt(parseOkignoreDoc(text), 0);
    expect(serializeOkignoreDoc(next)).toBe('# Drafts\n# After\nvendor/\n');
  });

  test('preserves blank lines around a removed pattern', () => {
    const text = '\ndrafts/\n\nvendor/\n';
    const next = removePatternAt(parseOkignoreDoc(text), 1);
    expect(serializeOkignoreDoc(next)).toBe('\ndrafts/\n\n');
  });

  test('out-of-range patternIndex returns the doc unchanged', () => {
    const original = parseOkignoreDoc('drafts/\n');
    expect(removePatternAt(original, 5)).toBe(original);
    expect(removePatternAt(original, -1)).toBe(original);
  });
});

describe('reorderPatterns', () => {
  test('moves pattern from to', () => {
    const next = reorderPatterns(parseOkignoreDoc('a/\nb/\nc/\n'), 0, 2);
    expect(serializeOkignoreDoc(next)).toBe('b/\nc/\na/\n');
  });

  test('moves pattern up the list', () => {
    const next = reorderPatterns(parseOkignoreDoc('a/\nb/\nc/\n'), 2, 0);
    expect(serializeOkignoreDoc(next)).toBe('c/\na/\nb/\n');
  });

  test('moving in place returns the doc unchanged', () => {
    const original = parseOkignoreDoc('a/\nb/\n');
    expect(reorderPatterns(original, 0, 0)).toBe(original);
    expect(reorderPatterns(original, 1, 1)).toBe(original);
  });

  test('comment + blank line positions are PRESERVED — patterns rotate through pattern slots', () => {
    const text = '# A\na/\n# B\nb/\nc/\n';
    const next = reorderPatterns(parseOkignoreDoc(text), 1, 0);
    expect(serializeOkignoreDoc(next)).toBe('# A\nb/\n# B\na/\nc/\n');
  });

  test('reorder preserves leading/trailing whitespace on pattern lines (raw travels with text)', () => {
    const text = '  drafts/  \nvendor/\n';
    const next = reorderPatterns(parseOkignoreDoc(text), 0, 1);
    expect(serializeOkignoreDoc(next)).toBe('vendor/\n  drafts/  \n');
  });

  test('out-of-range from or to returns the doc unchanged', () => {
    const original = parseOkignoreDoc('a/\nb/\n');
    expect(reorderPatterns(original, 0, 5)).toBe(original);
    expect(reorderPatterns(original, 5, 0)).toBe(original);
    expect(reorderPatterns(original, -1, 1)).toBe(original);
  });

  test('reorder a single-pattern doc is a no-op', () => {
    const original = parseOkignoreDoc('only/\n');
    expect(reorderPatterns(original, 0, 0)).toBe(original);
  });
});

describe('compositional integrity', () => {
  test('append → edit → reorder → remove preserves comment positions', () => {
    let doc = parseOkignoreDoc('# Header\ndrafts/\n# Mid\nvendor/\n');
    doc = appendPattern(doc, '*.tmp');
    expect(serializeOkignoreDoc(doc)).toBe('# Header\ndrafts/\n# Mid\nvendor/\n*.tmp\n');
    doc = editPatternAt(doc, 1, 'lib/');
    expect(serializeOkignoreDoc(doc)).toBe('# Header\ndrafts/\n# Mid\nlib/\n*.tmp\n');
    doc = reorderPatterns(doc, 2, 0);
    expect(serializeOkignoreDoc(doc)).toBe('# Header\n*.tmp\n# Mid\ndrafts/\nlib/\n');
    doc = removePatternAt(doc, 0);
    expect(serializeOkignoreDoc(doc)).toBe('# Header\n# Mid\ndrafts/\nlib/\n');
  });
});
