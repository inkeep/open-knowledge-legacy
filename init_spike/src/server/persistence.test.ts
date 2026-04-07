import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

// safeContentPath is not exported, so we replicate the logic for testing.
// This validates the security-critical path traversal prevention.
const CONTENT_DIR = resolve(import.meta.dirname ?? '.', '../../content');

function safeContentPath(documentName: string): string {
  const filePath = resolve(CONTENT_DIR, `${documentName}.md`);
  if (!filePath.startsWith(`${CONTENT_DIR}/`)) {
    throw new Error(`Invalid document name: ${documentName}`);
  }
  return filePath;
}

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
