import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { safeSubdir } from './api-extension.ts';

describe('safeSubdir', () => {
  const baseDir = '/home/user/content';

  test('resolves a valid subdirectory', () => {
    expect(safeSubdir(baseDir, 'notes')).toBe(resolve(baseDir, 'notes'));
  });

  test('resolves nested subdirectories', () => {
    expect(safeSubdir(baseDir, 'notes/meetings')).toBe(resolve(baseDir, 'notes/meetings'));
  });

  test('allows the base directory itself (empty string)', () => {
    expect(safeSubdir(baseDir, '')).toBe(baseDir);
  });

  test('allows "." as the subdirectory', () => {
    expect(safeSubdir(baseDir, '.')).toBe(baseDir);
  });

  test('rejects path traversal with ..', () => {
    expect(() => safeSubdir(baseDir, '..')).toThrow('Invalid directory');
  });

  test('rejects path traversal with ../sibling', () => {
    expect(() => safeSubdir(baseDir, '../etc')).toThrow('Invalid directory');
  });

  test('rejects traversal via nested ../..', () => {
    expect(() => safeSubdir(baseDir, 'sub/../../..')).toThrow('Invalid directory');
  });

  test('rejects absolute paths outside base', () => {
    expect(() => safeSubdir(baseDir, '/etc/passwd')).toThrow('Invalid directory');
  });
});
