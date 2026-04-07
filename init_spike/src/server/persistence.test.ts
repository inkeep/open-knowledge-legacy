import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { safeContentPath } from './persistence';

// Expected content directory — used only in assertion comparisons, not in function-under-test
if (!import.meta.dirname) throw new Error('import.meta.dirname is undefined');
const CONTENT_DIR = resolve(import.meta.dirname, '../../content');

describe('safeContentPath', () => {
  test('allows simple document names', () => {
    const result = safeContentPath('test-doc');
    expect(result).toBe(resolve(CONTENT_DIR, 'test-doc.md'));
  });

  test('rejects path traversal with ../', () => {
    expect(() => safeContentPath('../etc/passwd')).toThrow('Invalid document name');
  });

  test('rejects absolute path injection', () => {
    expect(() => safeContentPath('/etc/passwd')).toThrow('Invalid document name');
  });

  test('rejects traversal to parent directory', () => {
    expect(() => safeContentPath('../../package.json')).toThrow('Invalid document name');
  });

  test('allows subdirectory within content', () => {
    const result = safeContentPath('sub/nested');
    expect(result).toBe(resolve(CONTENT_DIR, 'sub/nested.md'));
  });
});
