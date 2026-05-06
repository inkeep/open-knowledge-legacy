import { describe, expect, test } from 'bun:test';
import { posix, win32 } from 'node:path';
import { __testing } from './build-skill-zip.ts';

const { computeWrapperFolderName, toPosixZipPath } = __testing;

describe('computeWrapperFolderName', () => {
  test('POSIX: returns last segment', () => {
    expect(computeWrapperFolderName('/usr/local/lib/skills/open-knowledge', posix.basename)).toBe(
      'open-knowledge',
    );
  });

  test('POSIX: handles trailing slash', () => {
    expect(computeWrapperFolderName('/usr/local/lib/skills/open-knowledge/', posix.basename)).toBe(
      'open-knowledge',
    );
  });

  test('Windows: backslash-separated absolute path returns last segment', () => {
    expect(
      computeWrapperFolderName(
        'C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\@inkeep\\open-knowledge\\dist\\assets\\skills\\open-knowledge',
        win32.basename,
      ),
    ).toBe('open-knowledge');
  });

  test('Windows: forward-slash absolute path returns last segment (UNC, mixed)', () => {
    expect(computeWrapperFolderName('C:/foo/bar/open-knowledge', win32.basename)).toBe(
      'open-knowledge',
    );
  });

  test('falls back to "open-knowledge" when basename is empty', () => {
    expect(computeWrapperFolderName('', posix.basename)).toBe('open-knowledge');
  });
});

describe('toPosixZipPath', () => {
  test('POSIX: passes through unchanged', () => {
    expect(toPosixZipPath('SKILL.md', '/')).toBe('SKILL.md');
    expect(toPosixZipPath('subdir/file.txt', '/')).toBe('subdir/file.txt');
  });

  test('Windows: rewrites backslashes to forward slashes', () => {
    expect(toPosixZipPath('subdir\\file.txt', '\\')).toBe('subdir/file.txt');
    expect(toPosixZipPath('a\\b\\c\\d.md', '\\')).toBe('a/b/c/d.md');
  });

  test('flat file name has no separators to rewrite', () => {
    expect(toPosixZipPath('SKILL.md', '\\')).toBe('SKILL.md');
  });
});
