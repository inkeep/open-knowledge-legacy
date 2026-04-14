import { describe, expect, test } from 'bun:test';
import { getSuggestedPath } from './CreatePageDialog';

describe('getSuggestedPath', () => {
  test('preserves a valid unresolved target as the default filename', () => {
    expect(getSuggestedPath('Y', '#/STORIES')).toBe('Y.md');
    expect(getSuggestedPath('Page Name', '#/notes/current')).toBe('notes/Page Name.md');
  });

  test('falls back to slug form for invalid path segments', () => {
    expect(getSuggestedPath('Page/Name', '#/STORIES')).toBe('page-name.md');
    expect(getSuggestedPath('Trailing Dot.', '#/docs/current')).toBe('docs/trailing-dot.md');
  });
});
