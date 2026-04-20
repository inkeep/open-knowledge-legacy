import { describe, expect, test } from 'bun:test';
import { docNameToDialogSeed, docNameToMarkdownPath, normalizeDocNameInput } from './doc-paths';

describe('normalizeDocNameInput', () => {
  test('trims and removes relative prefixes and markdown extensions', () => {
    expect(normalizeDocNameInput('  ./guides/install.mdx  ')).toBe('guides/install');
    expect(normalizeDocNameInput('/notes/today.md')).toBe('notes/today');
  });
});

describe('docNameToMarkdownPath', () => {
  test('appends .md to normalized doc names', () => {
    expect(docNameToMarkdownPath('./guides/install.mdx')).toBe('guides/install.md');
  });

  test('falls back to untitled.md for empty input', () => {
    expect(docNameToMarkdownPath('   ')).toBe('untitled.md');
  });
});

describe('docNameToDialogSeed', () => {
  test('returns parent directory and suggested filename for nested docs', () => {
    expect(docNameToDialogSeed('./guides/install.mdx')).toEqual({
      initialDir: 'guides',
      suggestedName: 'install.md',
    });
  });

  test('returns root defaults for empty input', () => {
    expect(docNameToDialogSeed('')).toEqual({
      initialDir: '',
      suggestedName: 'untitled.md',
    });
  });

  test('keeps root-level docs in the current directory', () => {
    expect(docNameToDialogSeed('readme')).toEqual({
      initialDir: '',
      suggestedName: 'readme.md',
    });
  });
});
