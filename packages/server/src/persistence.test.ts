import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { safeContentPath } from './persistence';

describe('safeContentPath', () => {
  const contentDir = '/app/content';

  test('allows simple document names', () => {
    const result = safeContentPath('test-doc', contentDir);
    expect(result).toBe(resolve(contentDir, 'test-doc.md'));
  });

  test('rejects path traversal with ../', () => {
    expect(() => safeContentPath('../etc/passwd', contentDir)).toThrow('Invalid document name');
  });

  test('rejects absolute path injection', () => {
    expect(() => safeContentPath('/etc/passwd', contentDir)).toThrow('Invalid document name');
  });

  test('rejects traversal to parent directory', () => {
    expect(() => safeContentPath('../../package.json', contentDir)).toThrow(
      'Invalid document name',
    );
  });

  test('allows subdirectory within content', () => {
    const result = safeContentPath('sub/nested', contentDir);
    expect(result).toBe(resolve(contentDir, 'sub/nested.md'));
  });
});
